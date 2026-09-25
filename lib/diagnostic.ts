import type { DiagnoseResult } from "./types";
import bank from "./bank.json";
import fallbackMap from "./fallback-map.json";

export interface DiagnoseInput {
  answer: string;
  reasoning: string;
  lessonId: string;
  quizId: string;
  demo?: string;
  // Expected reasoning from the teacher's uploaded portions (material quizzes).
  expected?: string;
}

function fallbackDiagnose(input: DiagnoseInput): DiagnoseResult {
  const text = `${input.answer} ${input.reasoning}`.toLowerCase();
  const lessons = bank.lessons as { id: string; nextLessonId: string | null }[];
  const current = lessons.find((l) => l.id === input.lessonId);
  const nextId = current?.nextLessonId ?? input.lessonId;

  // Material quizzes: grade against the expected answer from the teacher's
  // uploaded portions when no LLM key is available.
  if (input.expected) {
    const frac = input.expected.match(/\b\d+\/\d+\b/);
    const eq = input.expected.match(/=\s*(-?\d+)\b/);
    const token = frac?.[0] ?? eq?.[1];
    if (token && input.answer.toLowerCase().includes(token.toLowerCase())) {
      return {
        misconception_id: null,
        confidence: 0.9,
        feedback_20_words: `Matches the taught method. Correct: ${token}. Mastery up.`,
        next_lesson_id: nextId,
        correct: true,
      };
    }
    const m = (bank.misconceptions as { id: string; title: string }[]).find((x) =>
      Object.values(x).some((v) => typeof v === "string" && text.includes(String(v).toLowerCase())),
    );
    return {
      misconception_id: m?.id ?? null,
      confidence: 0.72,
      feedback_20_words: `Off the taught portion. Expected ${token ?? "the notes' method"} — check the class material and retry.`,
      next_lesson_id: input.lessonId,
      correct: false,
    };
  }

  let bestId: string | null = null;
  let bestHits = 0;
  for (const [id, keywords] of Object.entries(fallbackMap as Record<string, string[]>)) {
    let hits = 0;
    for (const kw of keywords) {
      if (kw && text.includes(kw.toLowerCase())) hits += 1;
    }
    if (hits > bestHits) {
      bestHits = hits;
      bestId = id;
    }
  }

  if (bestId && bestHits > 0) {
    const m = (bank.misconceptions as { id: string; title: string }[]).find((x) => x.id === bestId);
    return {
      misconception_id: bestId,
      confidence: 0.75,
      feedback_20_words: `Caught it: ${m?.title ?? bestId}. Fix one step, retry now.`,
      next_lesson_id: input.lessonId,
      correct: false,
    };
  }
  return {
    misconception_id: null,
    confidence: 0.9,
    feedback_20_words: "Correct reasoning. Mastery up. Next node unlocked.",
    next_lesson_id: nextId,
    correct: true,
  };
}

function isValidResult(v: unknown): v is DiagnoseResult {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    (typeof o.misconception_id === "string" || o.misconception_id === null) &&
    typeof o.confidence === "number" &&
    typeof o.feedback_20_words === "string" &&
    typeof o.next_lesson_id === "string" &&
    typeof o.correct === "boolean"
  );
}

const GEMINI_MODEL = "gemini-2.0-flash";

export async function diagnose(input: DiagnoseInput, apiKey?: string): Promise<DiagnoseResult> {
  if (input.demo || !apiKey) return fallbackDiagnose(input);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const expectedBlock = input.expected
      ? ` Expected answer/method from the teacher's uploaded portion: ${input.expected}. Grade strictly against it.`
      : "";
    const prompt = `Grade K-12 reasoning. Return JSON only: {"misconception_id": string|null, "confidence": number, "feedback_20_words": string, "next_lesson_id": string, "correct": boolean}. Lesson ${input.lessonId}, quiz ${input.quizId}.${expectedBlock} Answer: ${input.answer}. Reasoning: ${input.reasoning}. If wrong map to known misconception, next_lesson_id = current lesson. If right, misconception_id null, next = next lesson. Feedback <=20 words.`;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: ctrl.signal,
      }
    );
    clearTimeout(timer);
    if (!res.ok) return fallbackDiagnose(input);
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return fallbackDiagnose(input);
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    if (!isValidResult(parsed)) return fallbackDiagnose(input);
    return parsed;
  } catch {
    return fallbackDiagnose(input);
  }
}
