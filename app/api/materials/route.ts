import { NextRequest } from "next/server";
import { getSupabaseAdmin, supabaseAdminConfigured } from "@/lib/supabase";
import { embedTexts } from "@/lib/embeddings";
import { extractPdfText, chunkText } from "@/lib/pdf-text";
import { clientIp, rateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";

const SUBJECTS = ["Fractions", "Algebra", "Biology", "General"];

/**
 * POST /api/materials
 *  - multipart/form-data: file (pdf), title, subject
 *  - application/json:    { title, subject, material }
 * Pipeline: extract → chunk → embed (Gemini) → persist to Supabase (pgvector).
 * Falls back to the in-memory course-store when Supabase is not configured.
 */
export async function POST(request: NextRequest) {
  if (rateLimited(`materials:${clientIp(request)}`, 10, 60_000)) {
    return Response.json({ error: "Too many uploads. Slow down." }, { status: 429 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const contentType = request.headers.get("content-type") ?? "";
  let title = "";
  let subject = "General";
  let fullText = "";
  let sourceType: "text" | "pdf" = "text";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      title = String(form.get("title") ?? "").trim();
      subject = String(form.get("subject") ?? "General");
      const file = form.get("file");
      if (file instanceof File && file.size > 0) {
        if (file.size > 10 * 1024 * 1024) {
          return Response.json({ error: "PDF too large (max 10 MB)." }, { status: 413 });
        }
        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        if (!isPdf) {
          return Response.json({ error: "Only PDF files are supported." }, { status: 415 });
        }
        fullText = await extractPdfText(await file.arrayBuffer());
        sourceType = "pdf";
        if (!title) title = file.name.replace(/\.pdf$/i, "").slice(0, 120);
      } else {
        fullText = String(form.get("material") ?? "");
      }
    } else {
      const body = (await request.json()) as { title?: string; subject?: string; material?: string };
      title = String(body.title ?? "").trim();
      subject = String(body.subject ?? "General");
      fullText = String(body.material ?? "");
    }
  } catch {
    return Response.json({ error: "Could not read upload." }, { status: 400 });
  }

  if (title.length < 3 || title.length > 120) {
    return Response.json({ error: "Title must be 3–120 chars." }, { status: 400 });
  }
  if (!SUBJECTS.includes(subject)) subject = "General";
  if (fullText.trim().length < 20) {
    return Response.json({ error: "Material too short (min 20 chars)." }, { status: 400 });
  }
  fullText = fullText.slice(0, 200_000);

  const chunks = chunkText(fullText);
  if (chunks.length === 0) {
    return Response.json({ error: "Could not extract readable text from the upload." }, { status: 422 });
  }

  // Embed all chunks (Gemini when key present; deterministic fallback otherwise).
  const vectors = await embedTexts(chunks, apiKey);

  const supabase = getSupabaseAdmin();
  let supabaseDown = false;
  if (supabase) {
    const { data: mat, error: matErr } = await supabase
      .from("materials")
      .insert({ title, subject, source_type: sourceType, char_count: fullText.length })
      .select("id")
      .single();
    if (matErr || !mat) {
      // DB unreachable/unmigrated — fall through to demo mode rather than
      // failing the teacher's upload mid-demo.
      supabaseDown = true;
    } else {
      const rows = chunks.map((content, i) => ({
        material_id: mat.id as string,
        chunk_index: i,
        content,
        embedding: JSON.stringify(vectors[i]),
      }));
      const { error: chunkErr } = await supabase.from("material_chunks").insert(rows);
      if (chunkErr) {
        supabaseDown = true;
      } else {
        return Response.json(
          {
            ok: true,
            mode: "supabase",
            material: { id: mat.id, title, subject, sourceType, chunks: chunks.length },
          },
          { status: 201 },
        );
      }
    }
  }
  if (supabaseDown) console.warn("[materials] Supabase unavailable — falling back to in-memory store");

  // ---- Demo mode (no Supabase): persist to in-memory course-store ----
  const { addTopic } = await import("@/lib/course-store");
  const topic = addTopic({ title, subject: subject as never, material: fullText.slice(0, 20_000) });
  // Warm the embedding cache so quiz generation is instant.
  const { cacheEmbedding } = await import("@/lib/rag-quiz");
  chunks.forEach((content, i) => cacheEmbedding(`${topic.id}:${i}`, vectors[i]));
  return Response.json(
    {
      ok: true,
      mode: "demo",
      material: { id: topic.id, title, subject, sourceType, chunks: chunks.length },
    },
    { status: 201 },
  );
}

/** GET /api/materials — list uploaded materials. */
export async function GET() {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from("materials")
      .select("id, title, subject, source_type, char_count, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (!error) return Response.json({ mode: "supabase", materials: data });
    console.warn("[materials] Supabase read failed — falling back to in-memory store:", error.message);
  }
  const { listTopics, seedDefaultMaterial } = await import("@/lib/course-store");
  seedDefaultMaterial();
  const topics = listTopics().map((t) => ({
    id: t.id,
    title: t.title,
    subject: t.subject,
    source_type: "text",
    char_count: t.material.length,
    created_at: t.createdAt,
  }));
  return Response.json({ mode: "demo", materials: topics });
}
