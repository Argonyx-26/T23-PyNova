"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { loadStudent, saveStudent } from "@/lib/store";
import { getLessons } from "@/lib/world";
import type { StudentState } from "@/lib/types";
import {
  loadFamily,
  saveFamily,
  pushFeed,
  timeAgo,
  type ApprovalStatus,
  type FamilyState,
  type GuardianRole,
} from "@/lib/family";

const STUDENT_ID = "demo-student";

type ParentView = "digest" | "reports" | "approvals" | "settings";
type Range = "week" | "month" | "all";

function barClass(m: number): string {
  if (m >= 0.8) return "bg-emerald-500";
  if (m >= 0.5) return "bg-amber-500";
  return "bg-rose-500";
}

function levelBadge(pct: number): { label: string; cls: string } {
  if (pct >= 80) return { label: "Advanced", cls: "bg-emerald-100 text-emerald-800" };
  if (pct >= 60) return { label: "Developing", cls: "bg-amber-100 text-amber-800" };
  if (pct >= 40) return { label: "Emerging", cls: "bg-orange-100 text-orange-800" };
  return { label: "Starting", cls: "bg-stone-200 text-stone-700" };
}

const FEED_ICON: Record<string, string> = {
  quiz: "quiz",
  xp: "bolt",
  ai: "smart_toy",
  approval: "approval",
  reward: "redeem",
};

export default function ParentPage() {
  const [student, setStudent] = useState<StudentState | null>(null);
  const [family, setFamily] = useState<FamilyState>(() => loadFamily());
  const [view, setView] = useState<ParentView>("digest");
  const [range, setRange] = useState<Range>("week");
  const [newReward, setNewReward] = useState({ label: "", cost: "" });
  const [editCost, setEditCost] = useState<Record<string, string>>({});
  const [invite, setInvite] = useState({ email: "", role: "Co-Parent" as GuardianRole });
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStudent(loadStudent(STUDENT_ID));
  }, []);

  const lessons = getLessons();

  const update = (fn: (s: FamilyState) => FamilyState, msg?: string) => {
    setFamily((prev) => {
      const next = fn(prev);
      saveFamily(next);
      return next;
    });
    if (msg) {
      setNotice(msg);
      setTimeout(() => setNotice(null), 3500);
    }
  };

  const grantXp = (points: number) => {
    setStudent((prev) => {
      if (!prev) return prev;
      const next = { ...prev, xp: prev.xp + points };
      saveStudent(next);
      return next;
    });
  };

  const mastered = useMemo(
    () => (student ? lessons.filter((l) => (student.mastery[l.id] ?? 0) >= 0.8) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [student],
  );
  const avg = student
    ? Math.round((lessons.reduce((s, l) => s + (student.mastery[l.id] ?? 0), 0) / lessons.length) * 100)
    : 0;
  const studyHours = student ? (student.xp * 0.06 + mastered.length * 0.4).toFixed(1) : "0.0";
  const focusMin = student ? Math.round(student.xp * 1.2 + mastered.length * 12) : 0;

  const subjects = useMemo(() => {
    if (!student) return [];
    const avgOf = (ids: string[]) => {
      const vs = ids.map((id) => student.mastery[id] ?? 0);
      return Math.round((vs.reduce((a, b) => a + b, 0) / vs.length) * 100);
    };
    return [
      { name: "Math", pct: avgOf(lessons.filter((l) => l.id.startsWith("frac") || l.id.startsWith("alg")).map((l) => l.id)), note: "Fractions + Algebra realms" },
      { name: "Science", pct: avgOf(lessons.filter((l) => l.id.startsWith("bio")).map((l) => l.id)), note: "Biology realms" },
      { name: "Coding", pct: Math.min(96, 58 + mastered.length * 4), note: "Linked practice app" },
      { name: "Reading", pct: Math.min(96, 66 + mastered.length * 3), note: "Linked practice app" },
    ];
  }, [student, lessons, mastered.length]);

  const rangeMult = range === "week" ? 1 : range === "month" ? 3.2 : 9.5;
  const trend = useMemo(() => {
    const base = Math.max(avg, 12);
    return Array.from({ length: 12 }, (_, i) => {
      const wobble = ((i * 37 + base * 13) % 23) - 11;
      return Math.max(8, Math.min(100, Math.round(base * (0.55 + i * 0.045) + wobble)));
    });
  }, [avg]);

  const insights = useMemo(() => {
    if (!student) return { strengths: [] as string[], practice: [] as string[], next: "—" };
    const strengths = lessons.filter((l) => (student.mastery[l.id] ?? 0) >= 0.8).map((l) => l.title);
    const practice = lessons
      .filter((l) => student.unlockedLessonIds.includes(l.id) && (student.mastery[l.id] ?? 0) < 0.5)
      .map((l) => l.title);
    const next =
      lessons.find((l) => student.unlockedLessonIds.includes(l.id) && (student.mastery[l.id] ?? 0) < 0.8)?.title ??
      "All realms cleared — enable Stretch difficulty in Settings.";
    return { strengths, practice, next };
  }, [student, lessons]);

  const pending = family.approvals.filter((a) => a.status === "pending");

  function decideApproval(id: string, status: ApprovalStatus) {
    const ap = family.approvals.find((a) => a.id === id);
    if (!ap || ap.status !== "pending") return;
    if (status === "approved") grantXp(ap.points);
    update(
      (s) =>
        pushFeed(
          { ...s, approvals: s.approvals.map((a) => (a.id === id ? { ...a, status } : a)) },
          {
            kind: "approval",
            text: `${status === "approved" ? "Approved" : status === "rejected" ? "Rejected" : "Revision requested"} — ${ap.questTitle}`,
            detail: status === "approved" ? `+${ap.points} XP granted` : "No XP change",
          },
        ),
      status === "approved" ? `Approved! +${ap.points} XP added.` : "Review recorded.",
    );
  }

  function fulfillReward(id: string) {
    const r = family.rewards.find((x) => x.id === id);
    if (!r || !student || student.xp < r.cost) return;
    grantXp(-r.cost);
    update(
      (s) =>
        pushFeed(
          { ...s, rewards: s.rewards.map((x) => (x.id === id ? { ...x, fulfilled: x.fulfilled + 1 } : x)) },
          { kind: "reward", text: `Reward fulfilled — ${r.label}`, detail: `${r.cost} pts redeemed` },
        ),
      `Fulfilled “${r.label}”. ${r.cost} pts redeemed.`,
    );
  }

  const tabs: { id: ParentView; icon: string; label: string; badge?: string }[] = [
    { id: "digest", icon: "summary", label: "Summary Digest" },
    { id: "reports", icon: "fact_check", label: "Progress / Reports" },
    { id: "approvals", icon: "approval", label: "Quest Approvals", badge: pending.length > 0 ? String(pending.length) : undefined },
    { id: "settings", icon: "tune", label: "Settings" },
  ];

  return (
    <div className="min-h-screen bg-surface font-body-md text-on-surface antialiased">
      <header className="sticky top-0 z-40 bg-surface-container-lowest/90 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
          <div className="flex items-center gap-3">
            <Image src="/logo.jpg" alt="JustFormi" width={120} height={120} priority className="h-9 w-auto object-contain" />
            <div>
              <p className="font-label-md text-label-md leading-tight text-on-surface">Family Progress Portal</p>
              <p className="font-label-sm text-label-sm text-on-surface-variant">JustFormi · Parent View</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/" className="rounded-lg bg-surface-container-low px-3 py-2 font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-container">
              All Portals
            </Link>
            <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 font-label-md text-label-md font-semibold text-on-primary shadow-sm transition-all hover:opacity-90">
              <span className="material-symbols-outlined text-[18px]">print</span>
              <span className="hidden sm:inline">Print report</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        <nav className="mb-6 flex flex-wrap items-center gap-2 print:hidden">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              aria-current={view === t.id ? "page" : undefined}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 font-label-md text-label-md shadow-sm transition-all ${
                view === t.id ? "bg-primary font-semibold text-on-primary" : "bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-[20px]" style={view === t.id ? { fontVariationSettings: "'FILL' 1" } : undefined}>
                {t.icon}
              </span>
              <span>{t.label}</span>
              {t.badge && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1 text-[11px] font-bold text-on-error">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {notice && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-100 px-4 py-3 font-label-md text-label-md text-emerald-900 print:hidden">
            <span className="material-symbols-outlined text-[20px] text-emerald-600">check_circle</span>
            <span>{notice}</span>
          </div>
        )}

        {!student ? (
          <p className="font-body-lg text-body-lg text-on-surface-variant">Loading report…</p>
        ) : (
          <>
            {view === "digest" && (
              <div className="flex flex-col gap-6">
                <div className="flex flex-col justify-between gap-4 rounded-xl bg-surface-container-lowest p-6 shadow-sm md:flex-row md:items-center">
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-fixed px-2.5 py-0.5 font-label-sm text-label-sm uppercase tracking-wider text-on-primary-fixed">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                      Verified Weekly Report
                    </span>
                    <h1 className="mt-1 font-headline-lg text-headline-lg tracking-tight text-on-surface">
                      Alex Chen — Mastery &amp; Progress
                    </h1>
                    <p className="max-w-2xl font-body-md text-body-md text-on-surface-variant">
                      Every point below was earned by passing a reasoning check — not by watching videos.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl bg-surface-container-low px-4 py-2.5">
                    <span className="material-symbols-outlined text-[20px] text-tertiary">local_fire_department</span>
                    <div>
                      <p className="font-label-md text-label-md font-bold text-on-surface">{student.streak}-day streak</p>
                      <p className="font-label-sm text-label-sm text-on-surface-variant">{student.xp} XP earned</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                  {[
                    { icon: "schedule", label: "Total Study Hours", value: studyHours, sub: "hrs this period", tint: "bg-primary-fixed text-primary" },
                    { icon: "military_tech", label: "Quests Completed", value: String(mastered.length), sub: `of ${lessons.length} realms`, tint: "bg-secondary-fixed text-secondary" },
                    { icon: "verified", label: "Mastery Score", value: `${avg}%`, sub: "reasoning-verified", tint: "bg-tertiary-fixed text-tertiary" },
                    { icon: "stars", label: "Reward Points", value: String(student.xp), sub: "spendable in store", tint: "bg-amber-100 text-amber-800" },
                  ].map((k) => (
                    <div key={k.label} className="rounded-xl bg-surface-container-lowest p-4 shadow-sm transition-shadow hover:shadow-md">
                      <div className="flex items-center justify-between">
                        <p className="font-label-sm text-label-sm uppercase tracking-wider text-outline">{k.label}</p>
                        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${k.tint}`}>
                          <span className="material-symbols-outlined text-[20px]">{k.icon}</span>
                        </span>
                      </div>
                      <p className="mt-1 font-headline-lg text-headline-lg text-on-surface">{k.value}</p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">{k.sub}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                  <section className="rounded-xl bg-surface-container-lowest p-6 shadow-sm lg:col-span-7">
                    <div className="mb-4 flex items-center gap-2">
                      <span className="material-symbols-outlined text-[22px] text-primary">bar_chart</span>
                      <h2 className="font-headline-sm text-headline-sm text-on-surface">Progress Breakdown by Subject</h2>
                    </div>
                    <div className="flex flex-col gap-4">
                      {subjects.map((s) => {
                        const b = levelBadge(s.pct);
                        return (
                          <div key={s.name}>
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <p className="font-label-md text-label-md text-on-surface">
                                {s.name} <span className="font-body-sm text-body-sm font-normal text-outline">· {s.note}</span>
                              </p>
                              <span className={`rounded-full px-2 py-0.5 font-label-sm text-label-sm font-bold ${b.cls}`}>
                                {b.label} · {s.pct}%
                              </span>
                            </div>
                            <div className="h-2.5 overflow-hidden rounded-full bg-surface-container-highest">
                              <div className={`h-full rounded-full ${barClass(s.pct / 100)}`} style={{ width: `${s.pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <section className="rounded-xl bg-surface-container-lowest p-6 shadow-sm lg:col-span-5">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="material-symbols-outlined text-[22px] text-secondary">stream</span>
                      <h2 className="font-headline-sm text-headline-sm text-on-surface">Live Activity Feed</h2>
                    </div>
                    <ul className="flex max-h-[380px] flex-col gap-2 overflow-y-auto pr-1">
                      {family.feed.map((f) => (
                        <li key={f.id} className="flex items-start gap-2.5 rounded-xl bg-surface-container-low px-3 py-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-container-lowest text-primary">
                            <span className="material-symbols-outlined text-[18px]">{FEED_ICON[f.kind] ?? "info"}</span>
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-label-md text-label-md text-on-surface">{f.text}</span>
                            <span className="block truncate font-body-sm text-body-sm text-on-surface-variant">{f.detail}</span>
                            <span className="block font-label-sm text-label-sm text-outline">{timeAgo(f.at)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>
              </div>
            )}

            {view === "reports" && (
              <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-container-lowest p-4 shadow-sm">
                  <h1 className="font-headline-md text-headline-md text-on-surface">Learning Trends</h1>
                  <div className="flex items-center gap-1 rounded-xl bg-surface-container-low p-1">
                    {(["week", "month", "all"] as Range[]).map((r) => (
                      <button
                        key={r}
                        onClick={() => setRange(r)}
                        className={`rounded-lg px-3 py-1.5 font-label-sm text-label-sm ${
                          range === r ? "bg-surface-container-lowest font-bold text-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
                        }`}
                      >
                        {r === "week" ? "This Week" : r === "month" ? "This Month" : "All Time"}
                      </button>
                    ))}
                  </div>
                </div>

                <section className="rounded-xl bg-surface-container-lowest p-6 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="font-headline-sm text-headline-sm text-on-surface">Mastery Trend</h2>
                    <span className="font-label-sm text-label-sm text-on-surface-variant">
                      {range === "week" ? "Daily" : range === "month" ? "Every 3 days" : "Monthly"} · scaled ×{rangeMult}
                    </span>
                  </div>
                  <div className="flex h-36 items-end gap-1.5">
                    {trend.map((v, i) => (
                      <div key={i} className="flex flex-1 flex-col items-center gap-1" title={`${v}%`}>
                        <div className="flex w-full flex-1 items-end rounded bg-surface-container-low">
                          <div className="w-full rounded bg-gradient-to-t from-primary to-secondary-container" style={{ height: `${v}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex justify-between font-label-sm text-label-sm text-outline">
                    <span>{range === "week" ? "Mon" : range === "month" ? "Week 1" : "Jan"}</span>
                    <span>Now</span>
                  </div>
                </section>

                <section className="rounded-xl border-l-4 border-l-secondary bg-surface-container-lowest p-6 shadow-sm">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[22px] text-secondary">smart_toy</span>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface">Agent Insights — AI Summary</h2>
                    <span className="rounded-full bg-secondary-fixed px-2 py-0.5 font-label-sm text-label-sm font-bold text-on-secondary-fixed">
                      Socrates
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="rounded-xl bg-emerald-50 p-4">
                      <p className="font-label-md text-label-md font-bold text-emerald-800">✓ Areas of Strength</p>
                      <p className="mt-1 font-body-sm text-body-sm text-emerald-900">
                        {insights.strengths.length > 0 ? insights.strengths.slice(0, 3).join(" · ") : "No mastered realms yet — first wins are close."}
                      </p>
                    </div>
                    <div className="rounded-xl bg-amber-50 p-4">
                      <p className="font-label-md text-label-md font-bold text-amber-800">◐ Needs Practice</p>
                      <p className="mt-1 font-body-sm text-body-sm text-amber-900">
                        {insights.practice.length > 0 ? insights.practice.slice(0, 3).join(" · ") : "Nothing flagged — all unlocked work is on track."}
                      </p>
                    </div>
                    <div className="rounded-xl bg-surface-container-low p-4">
                      <p className="font-label-md text-label-md font-bold text-primary">→ Recommended Next Step</p>
                      <p className="mt-1 font-body-sm text-body-sm text-on-surface">{insights.next}</p>
                    </div>
                  </div>
                </section>

                <section className="rounded-xl bg-surface-container-lowest p-6 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[22px] text-tertiary">local_fire_department</span>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface">Learning Habit Analytics</h2>
                  </div>
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    {[
                      { icon: "local_fire_department", label: "Day Streak", value: `${student.streak}🔥`, sub: "consecutive active days" },
                      { icon: "schedule", label: "Focus Hours", value: `${studyHours}h`, sub: "estimated time on task" },
                      { icon: "bolt", label: "Focus Minutes", value: String(focusMin), sub: "deep-work equivalent" },
                      { icon: "military_tech", label: "Realms Cleared", value: `${mastered.length}/${lessons.length}`, sub: "quest map completion" },
                    ].map((h) => (
                      <div key={h.label} className="rounded-xl bg-surface-container-low p-4">
                        <span className="material-symbols-outlined text-[22px] text-primary">{h.icon}</span>
                        <p className="mt-1 font-headline-md text-headline-md text-on-surface">{h.value}</p>
                        <p className="font-label-sm text-label-sm uppercase tracking-wider text-outline">{h.label}</p>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">{h.sub}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-xl bg-surface-container-lowest p-6 shadow-sm">
                  <h2 className="mb-3 font-headline-sm text-headline-sm text-on-surface">Mastery by Quest Node</h2>
                  <div className="flex flex-col gap-2.5">
                    {lessons.map((l) => {
                      const m = student.mastery[l.id] ?? 0;
                      const pct = Math.round(m * 100);
                      return (
                        <div key={l.id} className="flex items-center gap-3">
                          <p className="w-44 shrink-0 truncate font-label-md text-label-md text-on-surface">{l.title}</p>
                          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-container-highest">
                            <div className={`h-full rounded-full ${barClass(m)}`} style={{ width: `${Math.max(pct, pct > 0 ? 4 : 0)}%` }} />
                          </div>
                          <span className="w-12 shrink-0 text-right font-label-sm text-label-sm font-bold text-on-surface">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            )}

            {view === "approvals" && (
              <div className="flex flex-col gap-6">
                <section className="rounded-xl bg-surface-container-lowest p-6 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[22px] text-primary">approval</span>
                      <h2 className="font-headline-sm text-headline-sm text-on-surface">Pending Approvals</h2>
                    </div>
                    <span className="rounded-full bg-error-container px-2.5 py-0.5 font-label-sm text-label-sm font-bold text-on-error-container">
                      {pending.length} awaiting review
                    </span>
                  </div>
                  {pending.length === 0 ? (
                    <p className="font-body-md text-body-md text-on-surface-variant">
                      All caught up — new quest submissions from your child will appear here.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {pending.map((a) => (
                        <div key={a.id} className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-4">
                          <p className="font-label-md text-label-md font-bold text-on-surface">{a.questTitle}</p>
                          <p className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">“{a.proof}”</p>
                          <p className="mt-1 font-label-sm text-label-sm text-outline">
                            Submitted {timeAgo(a.submittedAt)} · <strong className="text-secondary">+{a.points} pts</strong>
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button onClick={() => decideApproval(a.id, "approved")} className="rounded-lg bg-emerald-600 px-3 py-1.5 font-label-sm text-label-sm font-bold text-white hover:opacity-90">
                              ✓ Approve (+{a.points} XP)
                            </button>
                            <button onClick={() => decideApproval(a.id, "revision")} className="rounded-lg bg-surface-container-high px-3 py-1.5 font-label-sm text-label-sm font-bold text-on-surface hover:bg-surface-variant">
                              Request Revision
                            </button>
                            <button onClick={() => decideApproval(a.id, "rejected")} className="rounded-lg bg-error-container px-3 py-1.5 font-label-sm text-label-sm font-bold text-on-error-container hover:opacity-90">
                              Reject
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {family.approvals.some((a) => a.status !== "pending") && (
                    <div className="mt-4 border-t border-outline-variant/30 pt-3">
                      <p className="mb-2 font-label-sm text-label-sm uppercase tracking-wider text-outline">Reviewed</p>
                      <ul className="flex flex-col gap-1">
                        {family.approvals.filter((a) => a.status !== "pending").slice(0, 5).map((a) => (
                          <li key={a.id} className="flex items-center justify-between gap-2 font-body-sm text-body-sm text-on-surface-variant">
                            <span className="truncate">{a.questTitle}</span>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 font-label-sm text-label-sm font-bold ${
                              a.status === "approved" ? "bg-emerald-100 text-emerald-800" : a.status === "revision" ? "bg-amber-100 text-amber-800" : "bg-stone-200 text-stone-700"
                            }`}>
                              {a.status === "revision" ? "revision" : a.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>

                <section className="rounded-xl bg-surface-container-lowest p-6 shadow-sm">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[22px] text-tertiary">redeem</span>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface">Custom Incentive Store</h2>
                  </div>
                  <p className="mb-3 font-body-sm text-body-sm text-on-surface-variant">
                    Balance: <strong className="text-secondary">{student.xp} pts</strong> · fulfilling deducts points instantly.
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {family.rewards.map((r) => {
                      const afford = student.xp >= r.cost;
                      return (
                        <div key={r.id} className="flex flex-col justify-between gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-low p-4">
                          <div>
                            <p className="font-label-md text-label-md font-bold text-on-surface">{r.label}</p>
                            <p className="font-body-sm text-body-sm text-on-surface-variant">
                              <strong className="text-secondary">{r.cost} pts</strong> · fulfilled {r.fulfilled}×
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              aria-label={`Edit cost for ${r.label}`}
                              value={editCost[r.id] ?? String(r.cost)}
                              onChange={(e) => setEditCost((p) => ({ ...p, [r.id]: e.target.value.replace(/[^0-9]/g, "").slice(0, 5) }))}
                              onBlur={() => {
                                const v = parseInt(editCost[r.id] ?? "", 10);
                                if (Number.isFinite(v) && v > 0 && v <= 10000) {
                                  update((s) => ({ ...s, rewards: s.rewards.map((x) => (x.id === r.id ? { ...x, cost: v } : x)) }));
                                }
                                setEditCost((p) => {
                                  const n = { ...p };
                                  delete n[r.id];
                                  return n;
                                });
                              }}
                              className="w-20 rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-2 py-1.5 font-label-md text-label-md text-on-surface"
                            />
                            <button
                              onClick={() => fulfillReward(r.id)}
                              disabled={!afford}
                              className="flex-1 rounded-lg bg-primary px-2 py-1.5 font-label-sm text-label-sm font-bold text-on-primary hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {afford ? "Fulfill" : "Need pts"}
                            </button>
                            <button
                              onClick={() => update((s) => ({ ...s, rewards: s.rewards.filter((x) => x.id !== r.id) }), "Reward removed.")}
                              aria-label={`Remove ${r.label}`}
                              className="rounded-lg px-2 py-1.5 font-label-sm text-label-sm text-error hover:bg-error-container"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex flex-col justify-between gap-2 rounded-xl border border-dashed border-outline-variant/60 p-4">
                      <p className="font-label-md text-label-md font-bold text-on-surface">+ New incentive</p>
                      <input
                        value={newReward.label}
                        onChange={(e) => setNewReward((p) => ({ ...p, label: e.target.value.slice(0, 60) }))}
                        placeholder="e.g. Park trip Saturday"
                        className="rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-2 py-1.5 font-body-sm text-body-sm text-on-surface placeholder:text-outline"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          value={newReward.cost}
                          onChange={(e) => setNewReward((p) => ({ ...p, cost: e.target.value.replace(/[^0-9]/g, "").slice(0, 5) }))}
                          placeholder="Points"
                          inputMode="numeric"
                          className="w-24 rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-2 py-1.5 font-body-sm text-body-sm text-on-surface placeholder:text-outline"
                        />
                        <button
                          onClick={() => {
                            const cost = parseInt(newReward.cost, 10);
                            if (!newReward.label.trim() || !Number.isFinite(cost) || cost <= 0) return;
                            const label = newReward.label.trim();
                            update(
                              (s) => ({ ...s, rewards: [...s.rewards, { id: `rw-${Date.now()}`, label, cost, fulfilled: 0 }] }),
                              `Added “${label}” for ${cost} pts.`,
                            );
                            setNewReward({ label: "", cost: "" });
                          }}
                          className="flex-1 rounded-lg bg-secondary px-2 py-1.5 font-label-sm text-label-sm font-bold text-on-secondary hover:opacity-90"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {view === "settings" && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <section className="rounded-xl bg-surface-container-lowest p-6 shadow-sm lg:col-span-6">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[22px] text-primary">notifications</span>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface">Notification Controls</h2>
                  </div>
                  <div className="flex flex-col gap-3">
                    {([
                      ["dailyDigest", "Daily digest email", "Mastery snapshot every evening"],
                      ["weeklyDigest", "Weekly digest email", "Full report every Sunday"],
                      ["approvalAlerts", "Instant approval alerts", "Ping when a quest needs review"],
                      ["lowActivity", "Low-activity warnings", "Nudge if no practice for 2 days"],
                    ] as const).map(([key, label, sub]) => (
                      <button
                        key={key}
                        onClick={() => update((s) => ({ ...s, prefs: { ...s.prefs, [key]: !s.prefs[key] } }))}
                        aria-pressed={family.prefs[key]}
                        className="flex items-center justify-between gap-3 rounded-xl bg-surface-container-low px-4 py-3 text-left"
                      >
                        <span>
                          <span className="block font-label-md text-label-md font-bold text-on-surface">{label}</span>
                          <span className="block font-body-sm text-body-sm text-on-surface-variant">{sub}</span>
                        </span>
                        <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${family.prefs[key] ? "bg-emerald-500" : "bg-stone-300"}`}>
                          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${family.prefs[key] ? "left-[22px]" : "left-0.5"}`} />
                        </span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="rounded-xl bg-surface-container-lowest p-6 shadow-sm lg:col-span-6">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[22px] text-secondary">group</span>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface">Family &amp; Tutor Access</h2>
                  </div>
                  <ul className="mb-3 flex flex-col gap-2">
                    {family.guardians.map((g) => (
                      <li key={g.id} className="flex items-center justify-between gap-2 rounded-xl bg-surface-container-low px-3 py-2.5">
                        <span className="min-w-0">
                          <span className="block truncate font-label-md text-label-md text-on-surface">{g.email}</span>
                          <span className="font-label-sm text-label-sm text-on-surface-variant">{g.role}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          {(["Admin", "Co-Parent", "Tutor"] as GuardianRole[]).map((r) => (
                            <button
                              key={r}
                              onClick={() => update((s) => ({ ...s, guardians: s.guardians.map((x) => (x.id === g.id ? { ...x, role: r } : x)) }))}
                              className={`rounded-lg px-2 py-1 font-label-sm text-label-sm ${g.role === r ? "bg-primary font-bold text-on-primary" : "text-on-surface-variant hover:bg-surface-container"}`}
                            >
                              {r === "Admin" ? "Adm" : r === "Co-Parent" ? "Co" : "Tut"}
                            </button>
                          ))}
                          <button
                            onClick={() => {
                              if (family.guardians.filter((x) => x.role === "Admin").length === 1 && g.role === "Admin") {
                                setNotice("Keep at least one Admin guardian.");
                                setTimeout(() => setNotice(null), 3500);
                                return;
                              }
                              update((s) => ({ ...s, guardians: s.guardians.filter((x) => x.id !== g.id) }), "Guardian removed.");
                            }}
                            aria-label={`Remove ${g.email}`}
                            className="rounded-lg px-2 py-1 font-label-sm text-label-sm text-error hover:bg-error-container"
                          >
                            ✕
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2">
                    <input
                      value={invite.email}
                      onChange={(e) => setInvite((p) => ({ ...p, email: e.target.value.slice(0, 80) }))}
                      placeholder="guardian@email.com"
                      inputMode="email"
                      className="min-w-0 flex-1 rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 font-body-sm text-body-sm text-on-surface placeholder:text-outline"
                    />
                    <select
                      value={invite.role}
                      onChange={(e) => setInvite((p) => ({ ...p, role: e.target.value as GuardianRole }))}
                      className="rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-2 py-2 font-body-sm text-body-sm text-on-surface"
                    >
                      <option>Co-Parent</option>
                      <option>Admin</option>
                      <option>Tutor</option>
                    </select>
                    <button
                      onClick={() => {
                        const email = invite.email.trim();
                        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                          setNotice("Enter a valid email to invite.");
                          setTimeout(() => setNotice(null), 3500);
                          return;
                        }
                        update(
                          (s) => ({ ...s, guardians: [...s.guardians, { id: `g-${Date.now()}`, email, role: invite.role }] }),
                          `Invited ${email} as ${invite.role}.`,
                        );
                        setInvite({ email: "", role: "Co-Parent" });
                      }}
                      className="shrink-0 rounded-lg bg-primary px-3 py-2 font-label-sm text-label-sm font-bold text-on-primary hover:opacity-90"
                    >
                      Invite
                    </button>
                  </div>
                </section>

                <section className="rounded-xl bg-surface-container-lowest p-6 shadow-sm lg:col-span-12">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[22px] text-tertiary">tune</span>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface">Multi-Agent Learning Parameters</h2>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <label className="flex flex-col gap-1.5 rounded-xl bg-surface-container-low p-4">
                      <span className="font-label-md text-label-md font-bold text-on-surface">Diagnostic Difficulty</span>
                      <select
                        value={family.params.difficulty}
                        onChange={(e) => update((s) => ({ ...s, params: { ...s.params, difficulty: e.target.value as FamilyState["params"]["difficulty"] } }))}
                        className="rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 font-body-md text-body-md text-on-surface"
                      >
                        <option>Gentle</option>
                        <option>Standard</option>
                        <option>Stretch</option>
                      </select>
                      <span className="font-body-sm text-body-sm text-on-surface-variant">Sets how hard quests push before hints.</span>
                    </label>
                    <label className="flex flex-col gap-1.5 rounded-xl bg-surface-container-low p-4">
                      <span className="font-label-md text-label-md font-bold text-on-surface">Daily Study Goal (min)</span>
                      <input
                        type="number"
                        min={5}
                        max={240}
                        value={family.params.dailyGoalMin}
                        onChange={(e) => {
                          const v = Math.max(5, Math.min(240, parseInt(e.target.value || "0", 10) || 5));
                          update((s) => ({ ...s, params: { ...s.params, dailyGoalMin: v } }));
                        }}
                        className="rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 font-body-md text-body-md text-on-surface"
                      />
                      <span className="font-body-sm text-body-sm text-on-surface-variant">
                        Current pace ≈ {focusMin} min equivalent.
                      </span>
                    </label>
                    <label className="flex flex-col gap-1.5 rounded-xl bg-surface-container-low p-4">
                      <span className="font-label-md text-label-md font-bold text-on-surface">Screen Time Cap (min)</span>
                      <input
                        type="number"
                        min={10}
                        max={480}
                        value={family.params.screenTimeMin}
                        onChange={(e) => {
                          const v = Math.max(10, Math.min(480, parseInt(e.target.value || "0", 10) || 10));
                          update((s) => ({ ...s, params: { ...s.params, screenTimeMin: v } }));
                        }}
                        className="rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 font-body-md text-body-md text-on-surface"
                      />
                      <span className="font-body-sm text-body-sm text-on-surface-variant">Rewards pause past this cap.</span>
                    </label>
                  </div>
                </section>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
