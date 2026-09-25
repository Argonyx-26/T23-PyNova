import { generateQuestionsFromTopics, type GeneratedQuestion } from "@/lib/quiz-gen";
import { listTopics } from "@/lib/course-store";
import { clientIp, rateLimited } from "@/lib/rate-limit";
import { LESSON_IDS } from "@/lib/schemas";
import type { GamePack } from "@/lib/game-bank";

// Builds a playable quiz pack from the teacher's uploaded portions.
// GET /api/quiz-from-material?lessonId=frac-1 (lessonId optional).
export async function GET(request: Request) {
  if (rateLimited(`quizgen:${clientIp(request)}`, 30, 60_000)) {
    return Response.json({ error: "Too many requests." }, { status: 429 });
  }

  const url = new URL(request.url);
  const lessonId = url.searchParams.get("lessonId") ?? LESSON_IDS[0];
  if (!/^[a-z0-9-]{3,64}$/i.test(lessonId) || !(LESSON_IDS as string[]).includes(lessonId)) {
    return Response.json({ error: "Unknown lessonId." }, { status: 400 });
  }

  const topics = listTopics();
  if (topics.length === 0) {
    return Response.json({ error: "No course material uploaded yet." }, { status: 404 });
  }

  const questions: GeneratedQuestion[] = generateQuestionsFromTopics(topics);
  if (questions.length === 0) {
    return Response.json({ error: "Could not derive questions from the uploaded material." }, { status: 422 });
  }

  const pack: GamePack & { source: string[] } = {
    lessonId,
    title: "Portions Check: Teacher Material",
    questions: questions.slice(0, 5).map((q) => ({
      q: q.q,
      options: q.options,
      answer: q.answer,
      tag: q.tag,
    })),
    source: questions.slice(0, 5).map((q) => q.sourceTopicTitle),
  };

  return Response.json({ pack, expected: questions.slice(0, 5).map((q) => q.expectedReasoning) });
}
