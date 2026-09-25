import { embedTexts, cosineSimilarity } from "./embeddings";
import type { RetrievedChunk } from "./rag-types";

const QUIZ_MODEL = "gemini-2.0-flash";

export interface RagQuestion {
  q: string;
  options: [string, string, string, string];
  answer: number;
  expectedReasoning: string;
  citation: string;
}

interface GeminiQuizResponse {
  questions?: {
    question?: string;
    options?: string[];
    answer_index?: number;
    expected_reasoning?: string;
  }[];
}

/** Retrieve the most relevant chunks for a topic using embedding similarity. */
export async function retrieveChunks(
  topic: string,
  chunks: { id: string; materialId: string; content: string; materialTitle: string }[],
  apiKey?: string,
  topK = 6,
): Promise<RetrievedChunk[]> {
  if (chunks.length === 0) return [];
  const [qvec] = await embedTexts([topic || "class material"], apiKey);
  const scored = chunks.map((c) => {
    const [cvec] = embedCache.get(c.id) ?? [null];
    return {
      id: c.id,
      materialId: c.materialId,
      content: c.content,
      materialTitle: c.materialTitle,
      similarity: cvec ? cosineSimilarity(qvec, cvec) : 0,
    };
  });
  return scored.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
}

// Per-process embedding cache keyed by chunk id (avoids re-embedding).
export const embedCache = new Map<string, number[][]>();

export function cacheEmbedding(id: string, vec: number[]): void {
  embedCache.set(id, [vec]);
}

/** Generate a quiz strictly grounded in the retrieved context. */
export async function generateRagQuiz(
  contextChunks: RetrievedChunk[],
  topic: string,
  count: number,
  apiKey?: string,
): Promise<RagQuestion[]> {
  const context = contextChunks
    .map((c, i) => `[${i + 1}] (source: ${c.materialTitle}) ${c.content}`)
    .join("\n\n");

  if (apiKey) {
    try {
      const prompt =
        `You are a teacher's quiz generator. Create ${count} multiple-choice questions ` +
        `STRICTLY from the class material below (topic: "${topic}"). ` +
        `Each question must be answerable from the material alone. Prefer numeric/reasoning ` +
        `questions when the material contains worked math. Return JSON only: ` +
        `{"questions":[{"question":string,"options":[4 strings],"answer_index":0-3,` +
        `"expected_reasoning":string}]}. Reasoning must cite the method from the material.\n\n` +
        `CLASS MATERIAL:\n${context}`;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${QUIZ_MODEL}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        const parsed = safeParseQuiz(raw);
        if (parsed.length > 0) {
          return parsed.map((q, i) => ({
            q: q.question,
            options: q.options as RagQuestion["options"],
            answer: q.answer_index,
            expectedReasoning: q.expected_reasoning,
            citation: contextChunks[Math.min(i, contextChunks.length - 1)]?.materialTitle ?? "class material",
          }));
        }
      }
    } catch {
      // fall through to deterministic generator
    }
  }

  // ---- Offline deterministic generator: sentence-transformation MCQs ----
  const questions: RagQuestion[] = [];
  for (const chunk of contextChunks) {
    if (questions.length >= count) break;
    const sentences = chunk.content.split(/(?<=[.!?])\s+/).filter((s) => s.length > 30);
    for (const s of sentences) {
      if (questions.length >= count) break;
      const others = contextChunks
        .flatMap((c) => c.content.split(/(?<=[.!?])\s+/))
        .filter((o) => o !== s && o.length > 30 && o.length < 140);
      if (others.length < 3) continue;
      const distractors: string[] = [];
      for (const o of others) {
        if (distractors.length >= 3) break;
        if (!distractors.some((d) => similarEnough(d, o))) distractors.push(o);
      }
      if (distractors.length < 3) continue;
      const correct = s.length > 120 ? s.slice(0, 117) + "…" : s;
      questions.push({
        q: `Per the class material, which statement is correct?`,
        options: [
          correct,
          distractors[0].length > 120 ? distractors[0].slice(0, 117) + "…" : distractors[0],
          distractors[1].length > 120 ? distractors[1].slice(0, 117) + "…" : distractors[1],
          distractors[2].length > 120 ? distractors[2].slice(0, 117) + "…" : distractors[2],
        ] as RagQuestion["options"],
        answer: 0,
        expectedReasoning: `Directly from the uploaded material: "${s.slice(0, 160)}"`,
        citation: chunk.materialTitle,
      });
    }
  }
  // Shuffle option order per question so the answer isn't always A.
  return questions.map((q, i) => {
    const correct = q.options[q.answer];
    const opts = [...q.options];
    const swap = (i * 3 + 1) % 4;
    [opts[0], opts[swap]] = [opts[swap], opts[0]];
    return { ...q, options: opts as RagQuestion["options"], answer: opts.indexOf(correct) };
  });
}

function similarEnough(a: string, b: string): boolean {
  const wa = new Set(a.toLowerCase().split(/\s+/));
  const wb = new Set(b.toLowerCase().split(/\s+/));
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter += 1;
  return inter / Math.max(1, Math.min(wa.size, wb.size)) > 0.6;
}

function safeParseQuiz(raw: string): { question: string; options: string[]; answer_index: number; expected_reasoning: string }[] {
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return [];
    const parsed = JSON.parse(raw.slice(start, end + 1)) as GeminiQuizResponse;
    return (parsed.questions ?? [])
      .filter(
        (q) =>
          typeof q.question === "string" &&
          Array.isArray(q.options) &&
          q.options.length === 4 &&
          typeof q.answer_index === "number" &&
          q.answer_index >= 0 &&
          q.answer_index <= 3,
      )
      .map((q) => ({
        question: q.question as string,
        options: q.options as string[],
        answer_index: q.answer_index as number,
        expected_reasoning: typeof q.expected_reasoning === "string" ? q.expected_reasoning : "",
      }));
  } catch {
    return [];
  }
}
