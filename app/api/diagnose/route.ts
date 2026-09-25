import { diagnose } from "@/lib/diagnostic";
import { diagnoseSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = diagnoseSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid diagnose request.", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  const { answer, reasoning, lessonId, quizId, expected, demo } = parsed.data;
  const url = new URL(request.url);
  const demoParam = demo ?? url.searchParams.get("demo") ?? undefined;
  const result = await diagnose(
    { answer, reasoning, lessonId, quizId, expected, demo: demoParam ?? undefined },
    process.env.GEMINI_API_KEY,
  );
  return Response.json(result);
}
