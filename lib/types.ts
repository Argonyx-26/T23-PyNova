export interface Misconception {
  id: string;
  subject: "fractions" | "algebra" | "biology";
  title: string;
  keywords: string[];
  lessonId: string;
  quizIds: string[];
}

export interface Lesson {
  id: string;
  title: string;
  content: string;
  nextLessonId: string | null;
  x: number;
  y: number;
}

export interface Quiz {
  id: string;
  lessonId: string;
  prompt: string;
  misconceptionId: string;
}

export interface DiagnoseResult {
  misconception_id: string | null;
  confidence: number;
  feedback_20_words: string;
  next_lesson_id: string;
  correct: boolean;
}

export interface StudentState {
  studentId: string;
  xp: number;
  streak: number;
  mastery: Record<string, number>;
  unlockedLessonIds: string[];
}

export interface MapNode {
  lessonId: string;
  title: string;
  status: "locked" | "open" | "mastered";
  x: number;
  y: number;
}

export const MASTERY_THRESHOLD = 0.8;
export const XP_CORRECT = 10;
export const XP_RETRY = 2;
