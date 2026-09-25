import type { Lesson, MapNode, StudentState } from "./types";
import { MASTERY_THRESHOLD, XP_CORRECT, XP_RETRY } from "./types";
import bank from "./bank.json";

export function getLessons(): Lesson[] {
  return bank.lessons as Lesson[];
}

export function freshStudent(studentId: string): StudentState {
  const first = getLessons()[0];
  return { studentId, xp: 0, streak: 0, mastery: {}, unlockedLessonIds: [first.id] };
}

export function applyResult(
  state: StudentState,
  lessonId: string,
  correct: boolean
): StudentState {
  const prev = state.mastery[lessonId] ?? 0;
  const mastery = {
    ...state.mastery,
    [lessonId]: correct ? Math.min(1, prev + 0.5) : Math.max(0, prev - 0.2),
  };
  const lessons = getLessons();
  const current = lessons.find((l) => l.id === lessonId);
  const unlocked = new Set(state.unlockedLessonIds);
  if (correct && (mastery[lessonId] ?? 0) >= MASTERY_THRESHOLD && current?.nextLessonId) {
    unlocked.add(current.nextLessonId);
  }
  return {
    ...state,
    xp: state.xp + (correct ? XP_CORRECT : XP_RETRY),
    streak: correct ? state.streak + 1 : 0,
    mastery,
    unlockedLessonIds: [...unlocked],
  };
}

export function getMapGrid(state: StudentState): MapNode[] {
  return getLessons().map((l) => {
    const m = state.mastery[l.id] ?? 0;
    const unlocked = state.unlockedLessonIds.includes(l.id);
    return {
      lessonId: l.id,
      title: l.title,
      x: l.x,
      y: l.y,
      status: m >= MASTERY_THRESHOLD ? "mastered" : unlocked ? "open" : "locked",
    };
  });
}
