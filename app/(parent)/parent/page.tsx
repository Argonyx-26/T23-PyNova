"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import Link from "next/link";
import { loadStudent } from "@/lib/store";
import { getLessons } from "@/lib/world";
import type { StudentState } from "@/lib/types";
import type { ClassState } from "@/lib/class-store";

const STUDENT_ID = "demo-student";

type ParentView = "digest" | "reports" | "approvals" | "settings";

function masteryClass(m: number): string {
  if (m >= 0.8) return "bg-emerald-100 text-emerald-800";
  if (m >= 0.5) return "bg-amber-100 text-amber-800";
  return "bg-rose-100 text-rose-800";
}

export default function ParentPage() {
  const [student, setStudent] = useState<StudentState | null>(null);
  const [klass, setKlass] = useState<ClassState | null>(null);
  const [view, setView] = useState<ParentView>("digest");

  // Same hydration pattern as student view: server has no
  // localStorage, so sync persisted state after mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStudent(loadStudent(STUDENT_ID));
    let alive = true;
    fetch("/api/class-state", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (alive && s) setKlass(s as ClassState);
      })
      .catch(() => {
        // class pulse best-effort; local report still renders
      });
    const timer = setInterval(() => {
      fetch("/api/class-state", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((s) => {
          if (alive && s) setKlass(s as ClassState);
        })
        .catch(() => {});
    }, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const lessons = getLessons();
  const mastered = student ? lessons.filter((l) => (student.mastery[l.id] ?? 0) >= 0.8).length : 0;
  const avg = student
    ? Math.round(
        (lessons.reduce((s, l) => s + (student.mastery[l.id] ?? 0), 0) / lessons.length) * 100,
      )
    : 0;
  const next = student
    ? lessons.find((l) => student.unlockedLessonIds.includes(l.id) && (student.mastery[l.id] ?? 0) < 0.8)
    : undefined;

  const tabs: { id: ParentView; icon: string; label: string }[] = [
    { id: "digest", icon: "summary", label: "Summary Digest" },
    { id: "reports", icon: "fact_check", label: "Progress / Reports" },
    { id: "approvals", icon: "approval", label: "Quest Approvals" },
    { id: "settings", icon: "tune", label: "Settings" },
  ];

  return (
    <div className="min-h-screen bg-surface font-body-md text-on-surface antialiased">
      {/* ==================== TOP HEADER ==================== */}
      <header className="sticky top-0 z-40 bg-surface-container-lowest/90 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-space-md px-space-lg">
          <div className="flex items-center gap-space-sm">
            <Image src="/logo.jpg" alt="JustFormi" width={120} height={120} priority className="h-9 w-auto object-contain" />
            <div>
              <p className="font-label-md text-label-md leading-tight text-on-surface">Family Progress Portal</p>
              <p className="font-label-sm text-label-sm text-on-surface-variant">JustFormi · Parent View</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-lg bg-surface-container-low px-3 py-2 font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-container"
            >
              All Portals
            </Link>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 font-label-md text-label-md font-semibold text-on-primary shadow-sm transition-all hover:opacity-90"
            >
              <span className="material-symbols-outlined text-[18px]">print</span>
              <span>Print report</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-space-lg py-space-lg print:max-w-none">
        {/* ==================== SECTION TABS ==================== */}
        <nav className="mb-space-lg flex flex-wrap items-center gap-2 print:hidden">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              aria-current={view === t.id ? "page" : undefined}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 font-label-md text-label-md shadow-sm transition-all ${
                view === t.id
                  ? "bg-primary font-semibold text-on-primary"
                  : "bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
              }`}
            >
              <span
                className="material-symbols-outlined text-[20px]"
                style={view === t.id ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {t.icon}
              </span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        {!student ? (
          <div className="flex flex-col gap-2 rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
            <p className="font-body-lg text-body-lg text-on-surface-variant">Loading report…</p>
          </div>
        ) : (
          <>
            {/* ==================== SUMMARY DIGEST VIEW ==================== */}
            {view === "digest" && (
              <>
                {/* Report header */}
                <div className="flex flex-col justify-between gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm md:flex-row md:items-center">
                  <div className="flex flex-col gap-1">
                    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary-fixed px-2.5 py-0.5 font-label-sm text-label-sm uppercase tracking-wider text-on-primary-fixed">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                      Verified Weekly Report
                    </span>
                    <h1 className="font-headline-lg text-headline-lg tracking-tight text-on-surface">
                      Alex Chen — Mastery &amp; Progress
                    </h1>
                    <p className="max-w-2xl font-body-md text-body-md text-on-surface-variant">
                      AI-verified mastery evidence from the adventure quest map. Every point below was earned by passing
                      a reasoning check — not by watching videos.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl bg-surface-container-low px-space-md py-2.5">
                    <span className="material-symbols-outlined text-[20px] text-tertiary">local_fire_department</span>
                    <div>
                      <p className="font-label-md text-label-md font-bold text-on-surface">{student.streak}-day streak</p>
                      <p className="font-label-sm text-label-sm text-on-surface-variant">{student.xp} XP earned</p>
                    </div>
                  </div>
                </div>

                {/* 4 KPI cards */}
                <div className="mt-space-lg grid grid-cols-2 gap-space-md xl:grid-cols-4">
                  <div className="flex flex-col justify-between rounded-xl bg-surface-container-lowest p-space-md shadow-sm">
                    <p className="font-label-sm text-label-sm uppercase tracking-wider text-outline">Average Mastery</p>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="font-metric-display text-metric-display text-on-surface">{avg}%</span>
                      <span className="font-label-md text-label-md font-bold text-emerald-600">verified</span>
                    </div>
                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-container-highest">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary-container to-secondary-container"
                        style={{ width: `${avg}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col justify-between rounded-xl bg-surface-container-lowest p-space-md shadow-sm">
                    <p className="font-label-sm text-label-sm uppercase tracking-wider text-outline">Nodes Mastered</p>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="font-metric-display text-metric-display text-on-surface">
                        {mastered}
                        <span className="text-on-surface-variant">/{lessons.length}</span>
                      </span>
                    </div>
                    <p className="mt-3 font-body-sm text-body-sm text-on-surface-variant">
                      quest map completion
                    </p>
                  </div>
                  <div className="flex flex-col justify-between rounded-xl bg-surface-container-lowest p-space-md shadow-sm">
                    <p className="font-label-sm text-label-sm uppercase tracking-wider text-outline">Learning Streak</p>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="font-metric-display text-metric-display text-on-surface">{student.streak}🔥</span>
                    </div>
                    <p className="mt-3 font-body-sm text-body-sm text-on-surface-variant">consecutive active days</p>
                  </div>
                  <div className="flex flex-col justify-between rounded-xl bg-surface-container-lowest p-space-md shadow-sm">
                    <p className="font-label-sm text-label-sm uppercase tracking-wider text-outline">Experience Points</p>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="font-metric-display text-metric-display text-on-surface">{student.xp}</span>
                      <span className="font-label-md text-label-md font-bold text-secondary">XP</span>
                    </div>
                    <p className="mt-3 font-body-sm text-body-sm text-on-surface-variant">lifetime earned</p>
                  </div>
                </div>
              </>
            )}

            {/* ==================== PROGRESS / REPORTS VIEW ==================== */}
            {view === "reports" && (
              <div className="flex flex-col gap-space-lg">
                {/* Mastery breakdown */}
                <div className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
                  <div className="mb-space-md flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[22px] text-primary">fact_check</span>
                      <h2 className="font-headline-sm text-headline-sm text-on-surface">
                        Mastery by Quest Node
                      </h2>
                    </div>
                    {next ? (
                      <span className="rounded-full bg-secondary-fixed px-2.5 py-0.5 font-label-sm text-label-sm font-bold text-on-secondary-fixed">
                        Next: {next.title}
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 font-label-sm text-label-sm font-bold text-emerald-800">
                        All complete — graduate 🎓
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-2.5">
                    {lessons.map((l) => {
                      const m = student.mastery[l.id] ?? 0;
                      const pct = Math.round(m * 100);
                      return (
                        <div key={l.id} className="flex items-center gap-3">
                          <div className="w-44 min-w-0 shrink-0">
                            <p className="truncate font-label-md text-label-md text-on-surface">{l.title}</p>
                            <p className="truncate font-label-sm text-label-sm text-outline">
                              {l.content}
                            </p>
                          </div>
                          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-container-highest">
                            <div
                              className={`h-full rounded-full ${
                                m >= 0.8
                                  ? "bg-emerald-500"
                                  : m >= 0.5
                                    ? "bg-amber-500"
                                    : pct > 0
                                      ? "bg-rose-500"
                                      : "bg-surface-container-highest"
                              }`}
                              style={{ width: `${Math.max(pct, pct > 0 ? 4 : 0)}%` }}
                            />
                          </div>
                          <span
                            className={`w-12 shrink-0 rounded px-1.5 py-0.5 text-center font-label-sm text-label-sm font-bold shadow-xs ${masteryClass(m)}`}
                          >
                            {pct}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Live class pulse */}
                {klass && Object.keys(klass.lessons).length > 0 && (
                  <div className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="material-symbols-outlined text-[20px] text-tertiary">podium</span>
                      <h2 className="font-headline-sm text-headline-sm text-on-surface">Live class pulse</h2>
                      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                      <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                        updates every 5s
                      </span>
                    </div>
                    {(() => {
                      const entries = Object.entries(klass.lessons);
                      const total = entries.reduce((s, [, l]) => s + l.attempts, 0);
                      const wrong = entries.reduce((s, [, l]) => s + l.wrong, 0);
                      const top = entries
                        .flatMap(([lid, l]) =>
                          Object.entries(l.misconceptions).map(([mid, c]) => ({ lid, mid, c })),
                        )
                        .sort((a, b) => b.c - a.c)[0];
                      return (
                        <p className="font-body-md text-body-md text-on-surface-variant">
                          Class attempts <strong className="text-on-surface">{total}</strong> · struggling{" "}
                          <strong className="text-error">{wrong}</strong>
                          {top && (
                            <span>
                              {" "}
                              · top misconception{" "}
                              <code className="rounded bg-error-container px-1.5 py-0.5 font-label-sm text-label-sm font-bold text-on-error-container">
                                {top.mid}
                              </code>{" "}
                              ({top.c}× in {top.lid})
                            </span>
                          )}
                        </p>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* ==================== QUEST APPROVALS VIEW ==================== */}
            {view === "approvals" && (
              <div className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm print:hidden">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[22px] text-primary">approval</span>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface">Quest Approvals</h2>
                </div>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  Quests unlocked by the teacher will appear here for parent sign-off. Nothing is awaiting approval
                  right now — check back after your child completes their next diagnostic check.
                </p>
              </div>
            )}

            {/* ==================== SETTINGS VIEW ==================== */}
            {view === "settings" && (
              <div className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm print:hidden">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[22px] text-primary">tune</span>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface">Settings</h2>
                </div>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  Notification preferences, report frequency, and connected guardians will be configurable here.
                </p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
