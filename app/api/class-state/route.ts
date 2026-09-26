import { getClassState, recordEvent, resetClassState } from "@/lib/class-store";
import { classEventSchema } from "@/lib/schemas";
import { clientIp, rateLimited } from "@/lib/rate-limit";

// ---- Rate limiting (per IP, shared limiter) ----
// Protects the shared demo state from accidental or malicious flooding
// during a live presentation. Not a substitute for real infra limits.
const RATE_LIMIT = 30; // events
const RATE_WINDOW_MS = 60_000;

function rateLimitedEvent(req: Request): boolean {
  return rateLimited(`classevent:${clientIp(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("stream") !== "sse") {
    return Response.json(getClassState());
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let lastSent = -1;
      const send = (state: ReturnType<typeof getClassState>) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(state)}\n\n`));
      };
      send(getClassState());
      lastSent = getClassState().version;
      const timer = setInterval(() => {
        try {
          const state = getClassState();
          if (state.version !== lastSent) {
            lastSent = state.version;
            send(state);
          } else {
            controller.enqueue(enc.encode(`: ping\n\n`));
          }
        } catch {
          clearInterval(timer);
        }
      }, 1000);
      // Close after 5 minutes to avoid leaked connections.
      setTimeout(() => {
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          // already closed
        }
      }, 5 * 60 * 1000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export async function POST(request: Request) {
  if (rateLimitedEvent(request)) {
    return Response.json({ error: "Too many events. Slow down." }, { status: 429 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = classEventSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid event.", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  const { studentId, lessonId, misconceptionId, correct } = parsed.data;
  recordEvent({
    studentId: studentId ?? "anon",
    lessonId,
    misconceptionId: misconceptionId ?? null,
    correct,
  });
  return Response.json(getClassState());
}

export async function DELETE(request: Request) {
  // Unauthenticated global wipe exists for the demo reset button —
  // rate-limit it so one client can't flap shared state forever.
  if (rateLimited(`classreset:${clientIp(request)}`, 10, 60_000)) {
    return Response.json({ error: "Too many resets. Slow down." }, { status: 429 });
  }
  resetClassState();
  return Response.json(getClassState());
}
