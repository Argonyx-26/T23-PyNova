import { diagnose } from "@/lib/diagnostic";
import { diagnoseSchema } from "@/lib/schemas";
import { clientIp, rateLimited } from "@/lib/rate-limit";

export async function POST(request: Request) {
  // Bound LLM spend: one live call per answer is the product promise —
  // don't let a looped client turn it into an unbounded bill (LLM10).
  if (rateLimited(`diagnose:${clientIp(request)}`, 30, 60_000)) {
    return Response.json({ error: "Too many diagnoses. Slow down." }, { status: 429 });
  }

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
