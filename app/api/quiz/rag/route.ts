import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { embedTexts } from "@/lib/embeddings";
import { retrieveChunks, generateRagQuiz, cacheEmbedding } from "@/lib/rag-quiz";
import { clientIp, rateLimited } from "@/lib/rate-limit";

/**
 * GET /api/quiz/rag?topic=...&count=5&materialId=...
 * Retrieval-grounded quiz generation:
 *   1. embed the topic (or use stored chunks directly)
 *   2. similarity-search material chunks (Supabase RPC or local cache)
 *   3. generate questions strictly from the retrieved context
 */
export async function GET(request: NextRequest) {
  if (rateLimited(`ragquiz:${clientIp(request)}`, 20, 60_000)) {
    return Response.json({ error: "Too many requests." }, { status: 429 });
  }

  const url = new URL(request.url);
  const topic = (url.searchParams.get("topic") ?? "").slice(0, 300);
  const materialId = url.searchParams.get("materialId");
  const count = Math.min(10, Math.max(1, Number(url.searchParams.get("count") ?? 5)));
  const apiKey = process.env.GEMINI_API_KEY;

  const supabase = getSupabaseAdmin();
  type ChunkRow = { id: string; material_id: string; content: string; materials?: { title?: string } | null };

  let chunkRows: ChunkRow[] = [];

  if (supabase) {
    // Fast path: pgvector similarity search when a topic is provided.
    if (topic) {
      const [qvec] = await embedTexts([topic || "class material"], apiKey);
      let rpc = supabase.rpc("match_material_chunks", {
        query_embedding: JSON.stringify(qvec),
        match_count: 8,
      });
      if (materialId) rpc = rpc.eq("material_id", materialId);
      const { data, error } = (await rpc) as {
        data: { chunk_id: string; material_id: string; content: string; similarity: number }[] | null;
        error: { message: string } | null;
      };
      if (!error && data && data.length > 0) {
        const titles = new Map<string, string>();
        const { data: mats } = await supabase.from("materials").select("id, title");
        for (const m of mats ?? []) titles.set(m.id, m.title);
        const retrieved = data.map((d) => ({
          id: d.chunk_id as string,
          materialId: d.material_id as string,
          materialTitle: titles.get(d.material_id as string) ?? "class material",
          content: d.content as string,
          similarity: d.similarity as number,
        }));
        return await respond(retrieved, count, apiKey, topic, "supabase");
      }
    }
    // Fallback: latest material's chunks.
    const { data } = await supabase
      .from("material_chunks")
      .select("id, material_id, content, materials(title)")
      .order("created_at", { ascending: false })
      .limit(40);
    chunkRows = (data as unknown as ChunkRow[]) ?? [];
  } else {
    // ---- Demo mode: in-memory course-store ----
    const { listTopics } = await import("@/lib/course-store");
    const topics = listTopics();
    if (topics.length > 0) {
      chunkRows = topics.flatMap((t) =>
        chunkTextLocal(t.material).map((content, i) => ({
          id: `${t.id}:${i}`,
          material_id: t.id,
          content,
          materials: { title: t.title },
        })),
      );
    }
  }

  // Local similarity ranking (also warms the cache for offline grading).
  const [qvec] = await embedTexts([topic || "class material"], apiKey);
  const scored = chunkRows.map((r) => {
    const [cvec] = embedTextsLocalSync(r.content);
    cacheEmbedding(r.id, cvec);
    return {
      id: r.id,
      materialId: r.material_id,
      materialTitle: r.materials?.title ?? "class material",
      content: r.content,
      similarity: cosineLocal(qvec, cvec),
    };
  });
  const retrieved = scored.sort((a, b) => b.similarity - a.similarity).slice(0, 8);

  return await respond(retrieved, count, apiKey, topic, supabase ? "supabase" : "demo");
}

async function respond(
  retrieved: { id: string; materialId: string; materialTitle: string; content: string; similarity: number }[],
  count: number,
  apiKey: string | undefined,
  topic: string,
  mode: string,
) {
  if (retrieved.length === 0) {
    return Response.json({ error: "No course material uploaded yet." }, { status: 404 });
  }
  const questions = await generateRagQuiz(retrieved, topic, count, apiKey);
  if (questions.length === 0) {
    return Response.json({ error: "Could not derive questions from the material." }, { status: 422 });
  }
  return Response.json({
    mode,
    sources: [...new Set(retrieved.map((r) => r.materialTitle))].slice(0, 5),
    topSimilarity: retrieved[0]?.similarity ?? 0,
    questions,
  });
}

// ---- local helpers (demo mode) ----
function chunkTextLocal(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  const out: string[] = [];
  let cur = "";
  for (const s of clean.split(/(?<=[.!?])\s+(?=[A-Z0-9])/g)) {
    if ((cur + " " + s).trim().length <= 800) cur = (cur ? cur + " " : "") + s;
    else {
      if (cur) out.push(cur.trim());
      cur = s;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter((c) => c.length > 40).slice(0, 30);
}

// Synchronous wrapper using the async embedTexts is not possible; instead
// we use a tiny sync hash embedding identical to the offline fallback so
// ranking works without awaits inside .map().
import { EMBED_DIM } from "@/lib/embeddings";
function embedTextsLocalSync(text: string): number[][] {
  const vec = new Array<number>(EMBED_DIM).fill(0);
  const tokens = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    let h = 2166136261;
    for (let i = 0; i < tok.length; i++) {
      h ^= tok.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    vec[Math.abs(h) % EMBED_DIM] += 1;
    const h2 = Math.imul(h ^ 0x9e3779b9, 2654435761) >>> 0;
    vec[Math.abs(h2) % EMBED_DIM] += 0.5;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return [vec.map((v) => v / norm)];
}

function cosineLocal(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) dot += a[i] * b[i];
  return dot;
}
