"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import MapGrid from "@/components/map-grid";
import { loadStudent, saveStudent, submitAnswer } from "@/lib/store";
import { applyResult, getMapGrid } from "@/lib/world";
import type { DiagnoseResult } from "@/lib/types";
import bank from "@/lib/bank.json";

const STUDENT_ID = "demo-student";

const MILESTONES = [
  { title: "Midterm Sprint — Fractions", due: "Week 6", detail: "Master Common Denominator through Decimal Bridge." },
  { title: "Algebra Gates — Midterms", due: "Week 8", detail: "Clear Sign Switch Forest through Balance Boss." },
  { title: "Biology Realm — Finals Prep", due: "Week 10", detail: "Finish Light Eater Grove through Cell City." },
];

export default function JourneyPage() {
  const [student, setStudent] = useState(() => loadStudent(STUDENT_ID));
  const [picked, setPicked] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [feedback, setFeedback] = useState<DiagnoseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [shakeId, setShakeId] = useState<string | null>(null);
  const [popId, setPopId] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStudent(loadStudent(STUDENT_ID));
  }, []);

  const nodes = useMemo(() => getMapGrid(student), [student]);
  const quizzes = bank.quizzes as { id: string; lessonId: string; prompt: string }[];

  const selected = useMemo(() => {
    const open = nodes.find((n) => n.status === "open");
    const fallback = open ?? nodes.find((n) => n.status === "mastered") ?? nodes[0];
    return (
      (picked ? nodes.find((n) => n.lessonId === picked && n.status !== "locked") : undefined) ??
      fallback
    );
  }, [nodes, picked]);

  const selectedQuiz = quizzes.find((q) => q.lessonId === selected.lessonId) ?? quizzes[0];
  const mastered = nodes.filter((n) => n.status === "mastered");
  const openNodes = nodes.filter((n) => n.status === "open");
  const locked = nodes.filter((n) => n.status === "locked");

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
      if (!result.correct) {
        setShakeId(selectedQuiz.lessonId);
        setTimeout(() => setShakeId(null), 700);
      } else {
        const wasOpen = (student.mastery[selectedQuiz.lessonId] ?? 0) < 0.8;
        if (wasOpen && (next.mastery[selectedQuiz.lessonId] ?? 0) >= 0.8) {
          setPopId(selectedQuiz.lessonId);
          setTimeout(() => setPopId(null), 600);
        }
        setAnswer("");
        setReasoning("");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="jf-portal min-h-screen">
      <main className="mx-auto w-full max-w-[1100px] space-y-6 p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-outline">Quest Map · Journey</p>
            <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">Learning Path Realms</h1>
            <p className="mt-1 text-sm text-on-surface-variant">
              {mastered.length} realms cleared · {openNodes.length} active · {locked.length} upcoming ·{" "}
              {student.xp} XP
            </p>
          </div>
          <Link
            href="/student"
            className="rounded-xl bg-surface-container-lowest px-4 py-2.5 text-sm font-bold text-primary shadow-sm transition-all hover:-translate-y-0.5"
          >
            ← Back to Dashboard
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Node map */}
          <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-6 shadow-sm lg:col-span-7">
            <h2 className="text-lg font-bold text-on-surface">Interactive Node Map</h2>
            <p className="mb-4 text-xs text-on-surface-variant">Tap an open node to target it below.</p>
            <MapGrid
              nodes={nodes}
              activeId={selected.lessonId}
              shakeId={shakeId}
              popId={popId}
              onSelect={(id) => {
                setPicked(id);
                setFeedback(null);
              }}
            />
          </section>

          {/* Realm detail + trial */}
          <section className="flex flex-col gap-4 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-6 shadow-sm lg:col-span-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-outline">Targeted Realm</p>
              <h2 className="text-xl font-bold text-on-surface">{selected.title}</h2>
              <p className="text-sm text-on-surface-variant">{selectedQuiz.prompt}</p>
            </div>
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
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
                rows={3}
                className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-on-primary shadow-sm hover:opacity-95 active:scale-95 disabled:opacity-60"
              >
                {busy ? "Grading…" : "Submit Realm Trial →"}
              </button>
            </form>
            {feedback && (
              <p
                className={`rounded-xl p-3 text-sm font-semibold ${
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
        </div>

        {/* Realms + milestones */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-6 shadow-sm lg:col-span-7">
            <h2 className="mb-3 text-lg font-bold text-on-surface">Completed Topic Realms</h2>
            {mastered.length === 0 ? (
              <p className="text-sm text-on-surface-variant">
                No realms cleared yet — master an open node to claim your first realm.
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
