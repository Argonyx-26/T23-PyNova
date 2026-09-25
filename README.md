# JustFormi — Multi-Agent Learning Hub

One shared game world, three role portals, and a single Gemini reasoning call per answer.
Built for hackathon demo presentation.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

Optional — live LLM diagnostics (the demo works fully without it):

```bash
cp .env.example .env.local
# paste your key into GEMINI_API_KEY
```

Without a key, the deterministic keyword fallback diagnoses misconceptions locally — same
verdicts, zero cost, zero network.

## The 60-second demo flow

1. **Teacher Command Deck** (`/teacher`) → click **Reset demo**. Six students simulate a
   `frac-add` misconception spike; the heatmap table glows red with real aggregated data.
2. **Student Arcade** (`/student`) → open the quest map, play **Bubble Arcade**
   (click bubbles or keys 1–4), then submit the Boss Trial. Preset buttons fill a wrong
   answer (`2/5`, "add top bottom straight") — watch the map shake.
3. **Live multi-agent reaction** — flip back to `/teacher`. The heatmap, KPI cards and
   Cognitive Misconception Analysis update **sub-second over SSE**, no refresh.
4. **Retry & mastery** — submit the correct reasoning (`5/6`, common denominator). The node
   locks green; the next realm unlocks on the quest map.
5. **Parent Audit** (`/parent`) — verified mastery report, live class pulse, printable
   cost/mastery summary (the Print button produces a clean report).

## Architecture

| Route | Role | Highlights |
| --- | --- | --- |
| `/student` | Quest arcade | Pomodoro Focus Deck, Bubble Arcade canvas game, boss reasoning trials, localStorage progress |
| `/teacher` | Diagnostic command deck | SSE live heatmap, **course portions upload**, misconception aggregation, CSV export, intervention dispatch |
| `/parent` | Family transparency | Mastery report, live class pulse, cost audit, print stylesheet |
| `/api/diagnose` | Reasoning grader | 1 Gemini call per answer, grades against the teacher's uploaded portions, 3s timeout, deterministic fallback |
| `/api/class-state` | Shared world state | GET snapshot, SSE stream, POST events, DELETE reset |
| `/api/course-content` | Teacher material | Upload/list/delete class portions (validated, rate-limited) |
| `/api/quiz-from-material` | Portions quiz generator | Derives playable MCQs + expected answers from the uploaded material |

### Teacher-uploaded portions → student quizzes

The teacher uploads class notes/portions in the Course Portions panel on `/teacher`.
Everything downstream obeys that material:

- The student dashboard shows a **"From your teacher"** card with the uploaded portions.
- The Boss Trial pulls its question from a generator that derives MCQs and worked
  expected answers directly from the uploaded text (fraction equations in the notes
  become numeric problems; key facts become statement questions).
- Grading anchors to the material: the expected reasoning from the notes is sent with
  the diagnosis request (strict LLM grading when a Gemini key is present; token-match
  grading in the offline fallback), so feedback quotes the taught method.
- Baseline class notes are seeded automatically when nothing has been uploaded yet.

## Security posture

- **Zod validation on every API input** with strict ID allowlists (lessons, quizzes,
  misconceptions) derived from the content bank — unknown IDs are rejected before touching
  shared state or an LLM prompt.
- **Input length caps** (answers ≤200 chars, reasoning ≤2000 chars) bound prompt cost.
- **Per-IP rate limiting** on class-state events (30/min) protects the live demo from
  flooding; the map self-cleans.
- **Security headers** on all routes: CSP, X-Frame-Options DENY, nosniff,
  Referrer-Policy, Permissions-Policy; `x-powered-by` disabled.
- **Secrets stay server-side** — `GEMINI_API_KEY` is only read in the API route; Gemini
  responses are schema-validated before use, with silent fallback on any deviation.
- **No PII** — demo uses synthetic student IDs; progress lives in the browser's
  localStorage only.

## Tech

Next.js 16 (App Router, Turbopack) · React 19 · Tailwind CSS v4 (token-based theming with
scoped `.tq-theme` overrides for the teacher palette) · TypeScript · Zod · Gemini 2.0 Flash.
