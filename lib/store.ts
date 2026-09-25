import type { DiagnoseResult, StudentState } from "./types";
import { freshStudent } from "./world";

const KEY_PREFIX = "eduquest:student:";

export function loadStudent(studentId: string): StudentState {
  if (typeof window === "undefined") return freshStudent(studentId);
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + studentId);
    if (!raw) return freshStudent(studentId);
    const parsed = JSON.parse(raw) as StudentState;
    if (!parsed || parsed.studentId !== studentId || !Array.isArray(parsed.unlockedLessonIds)) {
      return freshStudent(studentId);
    }
    return parsed;
  } catch {
    return freshStudent(studentId);
  }
}

export function saveStudent(state: StudentState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY_PREFIX + state.studentId, JSON.stringify(state));
  } catch {
    // storage full or blocked: ignore, session still works
  }
}

export interface SubmitOutcome {
  result: DiagnoseResult;
  ms: number;
  cached: boolean;
}

export async function submitAnswer(input: {
  answer: string;
  reasoning: string;
  lessonId: string;
  quizId: string;
  studentId?: string;
  expected?: string;
}): Promise<SubmitOutcome> {
  const started = performance.now();
  const res = await fetch("/api/diagnose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Diagnose failed: ${res.status}`);
  const result = (await res.json()) as DiagnoseResult;
  const ms = Math.round(performance.now() - started);
  // Fire-and-forget class heatmap event. Teacher view degrades to
  // last state if this fails, so never block student loop.
  fetch("/api/class-state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      studentId: input.studentId ?? "demo-student",
      lessonId: input.lessonId,
      misconceptionId: result.misconception_id,
      correct: result.correct,
    }),
  }).catch(() => {
    // heatmap best-effort only
  });
  return { result, ms, cached: !process.env.NEXT_PUBLIC_GEMINI_LIVE && ms < 500 };
}
