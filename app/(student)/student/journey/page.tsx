"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { loadStudent, saveStudent, submitAnswer } from "@/lib/store";
import { applyResult, getMapGrid } from "@/lib/world";
import type { DiagnoseResult, MapNode } from "@/lib/types";
import bank from "@/lib/bank.json";

const STUDENT_ID = "demo-student";

const MILESTONES = [
  { title: "Midterm Sprint — Fractions", due: "Week 6", detail: "Master Common Denominator through Decimal Bridge.", realm: "frac-1" },
  { title: "Algebra Gates — Midterms", due: "Week 8", detail: "Clear Sign Switch Forest through Balance Boss.", realm: "alg-1" },
  { title: "Biology Realm — Finals Prep", due: "Week 10", detail: "Finish Light Eater Grove through Cell City.", realm: "bio-1" },
];

const DOMAIN_OF: Record<string, { label: string; icon: string; tint: string; text: string }> = {
  frac: { label: "Domain · Number Realms", icon: "◈", tint: "bg-orange-100", text: "text-orange-800" },
  alg: { label: "Domain · Symbol Realms", icon: "⬡", tint: "bg-amber-100", text: "text-amber-800" },
  bio: { label: "Domain · Life Realms", icon: "❀", tint: "bg-emerald-100", text: "text-emerald-800" },
};

function domainOf(lessonId: string) {
  const key = lessonId.split("-")[0];
  return DOMAIN_OF[key] ?? { label: "Domain · Realm", icon: "◆", tint: "bg-stone-200", text: "text-stone-700" };
}

export default function JourneyPage() {
  const [student, setStudent] = useState(() => loadStudent(STUDENT_ID));
  const [picked, setPicked] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [feedback, setFeedback] = useState<DiagnoseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [query, setQuery] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStudent(loadStudent(STUDENT_ID));
  }, []);

  const nodes = useMemo(() => getMapGrid(student), [student]);
  const quizzes = bank.quizzes as { id: string; lessonId: string; prompt: string }[];

  const selected: MapNode =
    (picked ? nodes.find((n) => n.lessonId === picked && n.status !== "locked") : undefined) ??
    nodes.find((n) => n.status === "open") ??
    nodes.find((n) => n.status === "mastered") ??
    nodes[0];

  const selectedQuiz = quizzes.find((q) => q.lessonId === selected.lessonId) ?? quizzes[0];
  const mastered = nodes.filter((n) => n.status === "mastered");
  const openNodes = nodes.filter((n) => n.status === "open");
  const locked = nodes.filter((n) => n.status === "locked");

  const q = query.toLowerCase().trim();
  const matches = (n: MapNode) => !q || n.title.toLowerCase().includes(q) || n.lessonId.includes(q);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { result } = await submitAnswer({
        answer,
        reasoning,
        lessonId: selectedQuiz.lessonId,
        quizId: selectedQuiz.id,
        studentId: STUDENT_ID,
      });
      setFeedback(result);
      const next = applyResult(student, selectedQuiz.lessonId, result.correct);
      setStudent(next);
      saveStudent(next);
      if (result.correct) {
        setAnswer("");
        setReasoning("");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="jf-portal min-h-screen">
      <main className="mx-auto w-full max-w-[1100px] space-y-5 p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-outline">Quest Map · Journey</p>
            <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">Learning Path Realms</h1>
            <p className="mt-1 text-sm text-on-surface-variant">
              {mastered.length} realms cleared · {openNodes.length} active · {locked.length} upcoming ·{" "}
              {student.xp} XP
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search realms…"
                className="w-52 rounded-full border border-outline-variant/50 bg-surface-container-lowest py-1.5 pl-8 pr-8 text-xs text-on-surface placeholder:text-outline focus:border-primary focus:outline-none"
              />
              <span className="material-symbols-outlined pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-outline">
                search
              </span>
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-outline hover:text-on-surface"
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
            <Link
              href="/student"
              className="rounded-xl bg-surface-container-lowest px-4 py-2 text-sm font-bold text-primary shadow-sm transition-all hover:-translate-y-0.5"
            >
              ← Dashboard
            </Link>
          </div>
        </div>

        {/* Archipelago viewport */}
        <section
          className="relative aspect-[16/10] min-h-[540px] w-full overflow-hidden rounded-3xl border-4 border-white/80 shadow-2xl"
          style={{
            background:
              "radial-gradient(1000px 420px at 20% -10%, #fde68a 0%, transparent 55%), radial-gradient(900px 500px at 85% 0%, #fed7aa 0%, transparent 55%), linear-gradient(180deg, #fef3c7 0%, #fde9c8 34%, #f3e2c7 55%, #e7d3ae 100%)",
          }}
          aria-label="Realm archipelago map"
        >
          {/* Sea shimmer */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(700px 260px at 30% 78%, rgba(21,128,61,0.12), transparent 60%), radial-gradient(600px 240px at 75% 82%, rgba(194,65,12,0.10), transparent 60%)",
            }}
          />
          {/* Zoomable island layer */}
          <div
            className="absolute inset-0 transition-transform duration-300"
            style={{ transform: `scale(${zoom})` }}
          >
            {nodes.map((n) => {
              const d = domainOf(n.lessonId);
              const pct = Math.round((student.mastery[n.lessonId] ?? 0) * 100);
              const hit = matches(n);
              const lockedNode = n.status === "locked";
              const active = selected.lessonId === n.lessonId;
              return (
                <button
                  key={n.lessonId}
                  disabled={lockedNode}
                  onClick={() => {
                    setPicked(n.lessonId);
                    setFeedback(null);
                  }}
                  title={`${n.title} (${n.status}${lockedNode ? "" : ` · ${pct}%`})`}
                  className={`group absolute w-[168px] rounded-2xl border bg-white/95 p-2.5 text-left shadow-lg backdrop-blur-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl ${
                    active
                      ? "z-20 -translate-y-1 border-2 border-primary shadow-[0_0_0_3px_#fdba74,0_12px_30px_rgba(194,65,12,0.4)]"
                      : lockedNode
                        ? "border-stone-200 opacity-50 grayscale-[35%]"
                        : n.status === "mastered"
                          ? "border-emerald-600/60 hover:border-emerald-600"
                          : "border-orange-300/80 hover:border-primary"
                  } ${hit ? "" : "opacity-30 grayscale"}`}
                  style={{ left: `${6 + n.x * 29}%`, top: `${7 + n.y * 21}%` }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black ${d.tint} ${d.text}`}>
                      {lockedNode ? "🔒" : n.status === "mastered" ? "★" : d.icon}
                    </span>
                    <span className={`text-[9px] font-black uppercase tracking-wider ${d.text}`}>{d.label}</span>
                  </div>
                  <p className="mt-1 truncate text-xs font-bold text-stone-800">{n.title}</p>
                  <div className="mt-1.5 flex items-center justify-between border-t border-stone-100 pt-1 text-[10px] font-semibold text-stone-500">
                    {lockedNode ? (
                      <span>Locked realm</span>
                    ) : (
                      <>
                        <span className={n.status === "mastered" ? "text-emerald-700" : "text-orange-700"}>
                          {n.status === "mastered" ? "✓ Cleared" : `${pct}% · Open`}
                        </span>
                        <span>{n.status === "mastered" ? "100 XP" : "Tap →"}</span>
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Zoom controls */}
          <div className="absolute left-3 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-2">
            {[
              { label: "+", title: "Zoom in", fn: () => setZoom((z) => Math.min(1.4, +(z + 0.15).toFixed(2))) },
              { label: "−", title: "Zoom out", fn: () => setZoom((z) => Math.max(0.85, +(z - 0.15).toFixed(2))) },
              { label: "◎", title: "Recenter", fn: () => setZoom(1) },
            ].map((b) => (
              <button
                key={b.title}
                onClick={b.fn}
                title={b.title}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-stone-200 bg-white/90 text-lg font-black text-stone-700 shadow-lg backdrop-blur-md transition hover:bg-white active:scale-90"
              >
                {b.label}
              </button>
            ))}
          </div>
        </section>

        {/* Targeted realm trial */}
        <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-outline">Targeted Realm Trial</p>
              <h2 className="text-xl font-bold text-on-surface">{selected.title}</h2>
              <p className="text-sm text-on-surface-variant">{selectedQuiz.prompt}</p>
            </div>
          </div>
          <form onSubmit={onSubmit} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Final answer, e.g. 5/6"
              required
              className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
            />
            <textarea
              value={reasoning}
              onChange={(e) => setReasoning(e.target.value)}
              placeholder="Reasoning steps…"
              required
              rows={2}
              className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none md:col-span-1"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-on-primary shadow-sm hover:opacity-95 active:scale-95 disabled:opacity-60 md:col-span-2"
            >
              {busy ? "Grading…" : "Submit Realm Trial →"}
            </button>
          </form>
          {feedback && (
            <p
              className={`mt-3 rounded-xl p-3 text-sm font-semibold ${
                feedback.correct
                  ? "bg-emerald-100 text-emerald-900"
                  : "bg-error-container text-on-error-container"
              }`}
            >
              {feedback.correct ? "✓ " : "↻ "}
              {feedback.feedback_20_words}
            </p>
          )}
        </section>

        {/* Realms + milestones */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-6 shadow-sm lg:col-span-7">
            <h2 className="mb-3 text-lg font-bold text-on-surface">Completed Topic Realms</h2>
            {mastered.length === 0 ? (
              <p className="text-sm text-on-surface-variant">
                No realms cleared yet — master an open island to claim your first realm.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {mastered.map((n) => (
                  <span
                    key={n.lessonId}
                    className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-900"
                  >
                    ✓ {n.title}
                  </span>
                ))}
              </div>
            )}
            <h2 className="mb-3 mt-6 text-lg font-bold text-on-surface">Active Challenges</h2>
            <div className="flex flex-col gap-2">
              {openNodes.map((n) => (
                <button
                  key={n.lessonId}
                  onClick={() => setPicked(n.lessonId)}
                  className="flex items-center justify-between rounded-xl bg-surface-container-low px-4 py-3 text-left transition-colors hover:bg-surface-container"
                >
                  <span className="text-sm font-semibold text-on-surface">▶ {n.title}</span>
                  <span className="text-xs font-bold text-primary">
                    {Math.round((student.mastery[n.lessonId] ?? 0) * 100)}%
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-6 shadow-sm lg:col-span-5">
            <h2 className="mb-3 text-lg font-bold text-on-surface">Upcoming Midterm Milestones</h2>
            <div className="flex flex-col gap-3">
              {MILESTONES.map((m) => (
                <div key={m.title} className="rounded-xl bg-surface-container-low p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-on-surface">{m.title}</p>
                    <span className="shrink-0 rounded-full bg-primary-fixed px-2 py-0.5 text-xs font-bold text-on-primary-fixed">
                      {m.due}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-on-surface-variant">{m.detail}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
