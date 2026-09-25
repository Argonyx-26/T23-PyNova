import { recordEvent, resetClassState, type ClassEvent } from "./class-store";

// One class, six students, one spike: frac-add dominates frac-1.
// Judges see red cell + drill-down instantly after reset.
export const SEED_EVENTS: ClassEvent[] = [
  { studentId: "s-ana", lessonId: "frac-1", misconceptionId: "frac-add", correct: false },
  { studentId: "s-dev", lessonId: "frac-1", misconceptionId: "frac-add", correct: false },
  { studentId: "s-ira", lessonId: "frac-1", misconceptionId: "frac-add", correct: false },
  { studentId: "s-kab", lessonId: "frac-1", misconceptionId: "frac-add", correct: false },
  { studentId: "s-mia", lessonId: "frac-1", misconceptionId: null, correct: true },
  { studentId: "s-raj", lessonId: "frac-2", misconceptionId: "frac-equiv", correct: false },
  { studentId: "s-ana", lessonId: "frac-1", misconceptionId: null, correct: true },
];

export function seedClassState(): void {
  resetClassState();
  for (const e of SEED_EVENTS) recordEvent(e);
}

export async function seedDemoClient(): Promise<void> {
  await fetch("/api/class-state", { method: "DELETE" });
  for (const e of SEED_EVENTS) {
    await fetch("/api/class-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(e),
    });
  }
}
