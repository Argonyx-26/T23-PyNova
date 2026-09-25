export interface LessonStats {
  attempts: number;
  wrong: number;
  misconceptions: Record<string, number>;
}

export interface StudentStats {
  attempts: number;
  wrong: number;
  streak: number;
  lessons: Record<string, { attempts: number; wrong: number }>;
  lastMisconception: string | null;
  lastAt: number;
}

export interface ClassEvent extends StudentEvent {
  at?: number;
}

export interface StudentEvent {
  studentId: string;
  lessonId: string;
  misconceptionId: string | null;
  correct: boolean;
}

export interface ClassState {
  version: number;
  lessons: Record<string, LessonStats>;
  students: Record<string, StudentStats>;
  recent: ClassEvent[];
  updatedAt: number;
}

// Module-level singleton. Same Node process shares state across routes.
// Resets on restart; seed restores demo spike.
const lessons: Record<string, LessonStats> = {};
const students: Record<string, StudentStats> = {};
const recent: ClassEvent[] = [];
let version = 0;

const RECENT_CAP = 50;

export function recordEvent(e: StudentEvent): void {
  const at = Date.now();
  const stats = lessons[e.lessonId] ?? { attempts: 0, wrong: 0, misconceptions: {} };
  stats.attempts += 1;
  if (!e.correct) {
    stats.wrong += 1;
    if (e.misconceptionId) {
      stats.misconceptions[e.misconceptionId] = (stats.misconceptions[e.misconceptionId] ?? 0) + 1;
    }
  }
  lessons[e.lessonId] = stats;

  const s = students[e.studentId] ?? {
    attempts: 0,
    wrong: 0,
    streak: 0,
    lessons: {},
    lastMisconception: null,
    lastAt: at,
  };
  s.attempts += 1;
  s.streak = e.correct ? s.streak + 1 : 0;
  if (!e.correct) {
    s.wrong += 1;
    s.lastMisconception = e.misconceptionId;
  }
  const sl = s.lessons[e.lessonId] ?? { attempts: 0, wrong: 0 };
  sl.attempts += 1;
  if (!e.correct) sl.wrong += 1;
  s.lessons[e.lessonId] = sl;
  s.lastAt = at;
  students[e.studentId] = s;

  recent.unshift({ ...e, at });
  if (recent.length > RECENT_CAP) recent.length = RECENT_CAP;
  version += 1;
}

export function getClassState(): ClassState {
  return { version, lessons: { ...lessons }, students: { ...students }, recent: [...recent], updatedAt: Date.now() };
}

export function resetClassState(): void {
  for (const k of Object.keys(lessons)) delete lessons[k];
  for (const k of Object.keys(students)) delete students[k];
  recent.length = 0;
  version += 1;
}
