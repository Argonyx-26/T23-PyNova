import { z } from "zod";
import bank from "./bank.json";

// ---- Canonical allowlists derived from the content bank ----
// Any lesson/quiz/misconception id outside these lists is rejected
// before it can touch shared state or an LLM prompt.
const lessons = bank.lessons as { id: string }[];
const quizzes = bank.quizzes as { id: string }[];
const misconceptions = bank.misconceptions as { id: string }[];

export const LESSON_IDS = lessons.map((l) => l.id);
export const QUIZ_IDS = quizzes.map((q) => q.id);
export const MISCONCEPTION_IDS = misconceptions.map((m) => m.id);

const idSchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9-]+$/i);

export const classEventSchema = z.object({
  studentId: idSchema
    .max(32)
    .transform((v) => v.slice(0, 32))
    .optional(),
  lessonId: idSchema.refine((v) => (LESSON_IDS as string[]).includes(v), {
    message: "Unknown lessonId",
  }),
  misconceptionId: idSchema
    .refine((v) => (MISCONCEPTION_IDS as string[]).includes(v), {
      message: "Unknown misconceptionId",
    })
    .nullable()
    .optional(),
  correct: z.boolean(),
});

export const diagnoseSchema = z.object({
  answer: z.string().max(200).default(""),
  reasoning: z.string().max(2000).default(""),
  lessonId: idSchema.refine((v) => (LESSON_IDS as string[]).includes(v), {
    message: "Unknown lessonId",
  }),
  quizId: idSchema.refine((v) => (QUIZ_IDS as string[]).includes(v), {
    message: "Unknown quizId",
  }),
  // Optional expected reasoning from the teacher's uploaded material —
  // anchors grading to the taught portions.
  expected: z.string().max(600).optional(),
  demo: z.string().max(32).optional(),
});

export type ClassEventInput = z.infer<typeof classEventSchema>;
export type DiagnoseInputValidated = z.infer<typeof diagnoseSchema>;
