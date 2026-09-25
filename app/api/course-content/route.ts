import { addTopic, deleteTopic, getContentVersion, listTopics, seedDefaultMaterial } from "@/lib/course-store";
import { uploadMaterialSchema } from "@/lib/course-schemas";
import { clientIp, rateLimited } from "@/lib/rate-limit";

export async function GET() {
  // Lazy-seed baseline class notes so students always have portions to study.
  seedDefaultMaterial();
  return Response.json({ topics: listTopics(), version: getContentVersion() });
}

export async function POST(request: Request) {
  if (rateLimited(`course:${clientIp(request)}`, 10, 60_000)) {
    return Response.json({ error: "Too many uploads. Slow down." }, { status: 429 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = uploadMaterialSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid material upload.", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  const topic = addTopic(parsed.data);
  return Response.json({ topic, topics: listTopics(), version: getContentVersion() }, { status: 201 });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  if (!/^[a-z0-9-]{3,64}$/i.test(id)) {
    return Response.json({ error: "Valid topic id required." }, { status: 400 });
  }
  const ok = deleteTopic(id);
  if (!ok) return Response.json({ error: "Topic not found." }, { status: 404 });
  return Response.json({ topics: listTopics(), version: getContentVersion() });
}
