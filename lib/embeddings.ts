// Gemini text-embedding-004 → 768-dim vectors matching the pgvector schema.
// Offline fallback: deterministic hashing embedding so the demo pipeline
// (upload → chunk → embed → search → quiz) works with zero API keys.

const EMBED_MODEL = "text-embedding-004";
export const EMBED_DIM = 768;

async function geminiEmbed(texts: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: texts.map((t) => ({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text: t }] },
        })),
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!res.ok) throw new Error(`Embeddings failed: ${res.status}`);
  const data = (await res.json()) as { embeddings?: { values?: number[] }[] };
  const out = data.embeddings?.map((e) => e.values ?? []) ?? [];
  if (out.length !== texts.length || out.some((v) => v.length !== EMBED_DIM)) {
    throw new Error("Unexpected embedding response shape");
  }
  return out;
}

// Deterministic hashed bag-of-words embedding (offline demo mode).
function hashEmbed(text: string): number[] {
  const vec = new Array<number>(EMBED_DIM).fill(0);
  const tokens = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    let h = 2166136261;
    for (let i = 0; i < tok.length; i++) {
      h ^= tok.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % EMBED_DIM;
    vec[idx] += 1;
    // second hash for slight spread
    const h2 = Math.imul(h ^ 0x9e3779b9, 2654435761) >>> 0;
    vec[Math.abs(h2) % EMBED_DIM] += 0.5;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export async function embedTexts(texts: string[], apiKey?: string): Promise<number[][]> {
  if (apiKey && texts.length > 0) {
    try {
      return await geminiEmbed(texts, apiKey);
    } catch {
      // fall through to offline embedding
    }
  }
  return texts.map(hashEmbed);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}
