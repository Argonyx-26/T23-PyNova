"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { ClassState, StudentStats } from "@/lib/class-store";
import type { CourseTopic } from "@/lib/course-store";
import { seedDemoClient } from "@/lib/seed";
import bank from "@/lib/bank.json";

async function fetchSnapshot(): Promise<ClassState> {
  const res = await fetch("/api/class-state", { cache: "no-store" });
  if (!res.ok) throw new Error(`Snapshot failed: ${res.status}`);
  return (await res.json()) as ClassState;
}

const SUBJECTS = ["Fractions", "Algebra", "Biology"] as const;
type Subject = (typeof SUBJECTS)[number];

const lessonSubject = (lessonId: string): Subject =>
  lessonId.startsWith("frac") ? "Fractions" : lessonId.startsWith("alg") ? "Algebra" : "Biology";

const prettyName = (id: string) => {
  const n = id.split("-").slice(1).join(" ");
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : id;
};

const initials = (id: string) =>
  prettyName(id)
    .split(" ")
    .map((p) => p.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

const misconceptions = bank.misconceptions as { id: string; title: string; lessonId: string }[];
const misconceptionTitle = (id: string | null) =>
  id ? misconceptions.find((m) => m.id === id)?.title ?? id : null;

function accuracyClass(acc: number | null): string {
  if (acc === null) return "bg-surface-container-high text-on-surface-variant";
  if (acc >= 80) return "bg-emerald-100 text-emerald-800";
  if (acc >= 60) return "bg-amber-100 text-amber-800";
  return "bg-rose-100 text-rose-800";
}

function subjectAccuracy(s: StudentStats, subject: Subject): number | null {
  let attempts = 0;
  let wrong = 0;
  for (const [lessonId, ls] of Object.entries(s.lessons)) {
    if (lessonSubject(lessonId) !== subject) continue;
    attempts += ls.attempts;
    wrong += ls.wrong;
  }
  if (attempts === 0) return null;
  return Math.round(((attempts - wrong) / attempts) * 100);
}

export default function TeacherPage() {
  const [state, setState] = useState<ClassState | null>(null);
  const [mode, setMode] = useState<"sse" | "polling">("sse");
  const [pickedStudent, setPickedStudent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [topics, setTopics] = useState<CourseTopic[]>([]);
  const [matTitle, setMatTitle] = useState("");
  const [matSubject, setMatSubject] = useState<CourseTopic["subject"]>("Fractions");
  const [matBody, setMatBody] = useState("");
  const [matFile, setMatFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [storageMode, setStorageMode] = useState<string>("");
  const esRef = useRef<EventSource | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };

  const triggerIntervention = (msg: string) => showToast(msg);

  async function onReset() {
    setSeeding(true);
    try {
      await seedDemoClient();
      setState(await fetchSnapshot());
      showToast("Demo class reseeded — frac-add spike is live.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Reset failed.");
    } finally {
      setSeeding(false);
    }
  }

  async function onUploadMaterial(e: React.FormEvent) {
    e.preventDefault();
    const hasFile = matFile && matFile.size > 0;
    if (matTitle.trim().length < 3 || (!hasFile && matBody.trim().length < 20)) {
      showToast("Title needs 3+ chars; paste material (20+ chars) or attach a PDF.");
      return;
    }
    setUploading(true);
    try {
      let res: Response;
      if (hasFile) {
        // PDF path: multipart upload → server extracts text, chunks, embeds.
        const fd = new FormData();
        fd.set("title", matTitle);
        fd.set("subject", matSubject);
        fd.set("file", matFile as File);
        res = await fetch("/api/materials", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/materials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: matTitle, subject: matSubject, material: matBody }),
        });
      }
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? "upload failed");
      }
      const d = (await res.json()) as {
        mode: string;
        material: { title: string; chunks: number };
      };
      setStorageMode(d.mode);
      setMatTitle("");
      setMatBody("");
      setMatFile(null);
      const fileInput = document.getElementById("material-pdf") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";
      await refreshMaterials();
      showToast(
        `"${d.material.title}" uploaded (${d.material.chunks} chunks embedded${d.mode === "supabase" ? " · stored in Supabase pgvector" : " · demo store"}).`,
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Upload failed — try again.");
    } finally {
      setUploading(false);
    }
  }

  async function refreshMaterials() {
    try {
      const res = await fetch("/api/materials", { cache: "no-store" });
      if (!res.ok) return;
      const d = (await res.json()) as {
        mode: string;
        materials: { id: string; title: string; subject: string; char_count: number }[];
      };
      setStorageMode(d.mode);
      setTopics(
        d.materials.map((m) => ({
          id: m.id,
          title: m.title,
          subject: m.subject as CourseTopic["subject"],
          material: " ".repeat(Math.min(m.char_count, 20000)),
          createdAt: 0,
        })),
      );
    } catch {
      // keep previous list
    }
  }

  async function onSync() {
    try {
      setState(await fetchSnapshot());
      showToast("Multi-agent state synced ✓");
    } catch {
      showToast("Sync failed — check connection.");
    }
  }

  function exportCsv() {
    if (!state) return;
    const rows = [
      ["Student", ...SUBJECTS, "Attempts", "Wrong", "Streak", "Diagnosed Barrier"],
      ...Object.entries(state.students).map(([id, s]) => [
        prettyName(id),
        ...SUBJECTS.map((sub) => subjectAccuracy(s, sub) ?? "—"),
        String(s.attempts),
        String(s.wrong),
        String(s.streak),
        misconceptionTitle(s.lastMisconception) ?? "—",
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "diagnostic-report.csv";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Diagnostic report exported.");
  }

  useEffect(() => {
    let poll: ReturnType<typeof setInterval> | null = null;
    let alive = true;
    fetchSnapshot()
      .then((s) => alive && setState(s))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : "Load failed."));

    // Load uploaded portions
    fetch("/api/materials", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d?.materials) {
          setStorageMode(d.mode ?? "");
          setTopics(
            (d.materials as { id: string; title: string; subject: string; char_count: number }[]).map((m) => ({
              id: m.id,
              title: m.title,
              subject: m.subject as CourseTopic["subject"],
              material: " ".repeat(Math.min(m.char_count, 20000)),
              createdAt: 0,
            })),
          );
        }
      })
      .catch(() => {});

    const connect = () => {
      const es = new EventSource("/api/class-state?stream=sse");
      esRef.current = es;
      es.onmessage = (ev) => {
        try {
          setState(JSON.parse(ev.data as string) as ClassState);
        } catch {
          // keep last state on malformed frame
        }
      };
      es.onerror = () => {
        es.close();
        if (!alive) return;
        setMode("polling");
        poll = setInterval(() => {
          fetchSnapshot()
            .then((s) => alive && setState(s))
            .catch(() => {
              // stay on last state during WiFi drops
            });
        }, 2000);
      };
    };
    connect();
    return () => {
      alive = false;
      esRef.current?.close();
      if (poll) clearInterval(poll);
    };
  }, []);

  // ---- Derived live metrics ----
  const students = Object.entries(state?.students ?? {}).sort(
    (a, b) => b[1].wrong - a[1].wrong || b[1].attempts - a[1].attempts,
  );
  const totals = students.reduce(
    (acc, [, s]) => {
      acc.attempts += s.attempts;
      acc.correct += s.attempts - s.wrong;
      return acc;
    },
    { attempts: 0, correct: 0 },
  );
  const masteryPct = totals.attempts > 0 ? Math.round((totals.correct / totals.attempts) * 100) : 0;
  const urgent = students.filter(([, s]) => s.wrong >= 2 && s.lastMisconception).length;
  const moderate = students.filter(([, s]) => s.wrong > 0 && !(s.wrong >= 2 && s.lastMisconception)).length;
  const wrongEvents = (state?.recent ?? []).filter((e) => !e.correct);
  const catchPct =
    wrongEvents.length > 0
      ? Math.round((wrongEvents.filter((e) => e.misconceptionId).length / wrongEvents.length) * 1000) / 10
      : 0;
  const redFlagLessons = Object.entries(state?.lessons ?? {}).filter(([, l]) => l.wrong >= 2);

  // Aggregate misconceptions across lessons for the analysis panel
  const misconceptionCounts = new Map<string, { count: number; lessonId: string }>();
  for (const [lessonId, stats] of Object.entries(state?.lessons ?? {})) {
    for (const [id, count] of Object.entries(stats.misconceptions)) {
      const cur = misconceptionCounts.get(id);
      if (cur) cur.count += count;
      else misconceptionCounts.set(id, { count, lessonId });
    }
  }
  const topMisconceptions = [...misconceptionCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 2)
    .map(([id, { count, lessonId }]) => {
      const meta = misconceptions.find((m) => m.id === id);
      const affected = students
        .filter(([, s]) => s.lastMisconception === id)
        .map(([id2]) => prettyName(id2));
      return { id, count, lessonId, title: meta?.title ?? id, affected, urgent: count >= 3 };
    });

  const lessons = bank.lessons as { id: string; title: string; content: string }[];
  const navItems = [
    { icon: "dashboard", label: "Overview" },
    { icon: "grid_view", label: "Class Heatmap", active: true },
    { icon: "group", label: "Students & Diagnosis" },
    { icon: "psychology", label: "Topics & Misconceptions" },
    { icon: "military_tech", label: "Gamified Quests" },
    { icon: "query_stats", label: "Analytics & Reports" },
  ];

  const featuredLesson = topMisconceptions[0]?.lessonId ?? redFlagLessons[0]?.[0] ?? "frac-1";
  const featuredAffected = topMisconceptions[0]?.affected.length ?? urgent;

  return (
    <div className="tq-theme min-h-screen bg-surface font-body-md text-on-surface antialiased">
      {/* ==================== TOP HEADER ==================== */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-surface/90 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl">
        <div className="flex h-16 w-full items-center justify-between gap-space-md px-gutter">
          <div className="flex items-center gap-space-lg">
            <div className="flex items-center gap-space-sm">
              <Image src="/logo.jpg" alt="JustFormi" width={120} height={120} priority className="h-9 w-auto object-contain" />
            </div>
            <div className="h-6 w-px bg-outline-variant/40"></div>
            <div className="flex items-center gap-space-xs rounded-lg bg-surface-container-low px-space-sm py-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <span className="material-symbols-outlined text-[18px] text-primary">school</span>
              <span className="font-label-md text-label-md text-on-surface">Class 10 - A (Maths)</span>
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">expand_more</span>
            </div>
          </div>

          <div className="mx-space-md hidden max-w-xl flex-1 md:block">
            <div className="relative flex w-full items-center">
              <span className="material-symbols-outlined absolute left-3 text-[18px] text-outline">search</span>
              <input
                className="h-9 w-full rounded-lg border border-outline-variant/60 bg-surface-container-lowest pl-9 pr-4 font-body-sm text-body-sm text-on-surface shadow-sm placeholder:text-outline focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Search diagnostic patterns, learners, concepts..."
                type="text"
              />
            </div>
          </div>

          <div className="flex items-center gap-space-md">
            <div className="flex items-center gap-space-xs rounded-full border border-outline-variant/40 bg-surface-container-lowest px-space-sm py-1 shadow-sm">
              <span
                className={`h-2 w-2 animate-pulse rounded-full ${mode === "sse" ? "bg-emerald-500" : "bg-amber-500"}`}
              ></span>
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                {mode === "sse" ? "Live Sync" : "Polling 2s"}
              </span>
            </div>
            <button
              onClick={onReset}
              disabled={seeding}
              className="flex items-center gap-1.5 rounded-lg bg-surface-container-high px-3 py-2 font-label-md text-label-md text-on-surface transition-all hover:bg-surface-variant disabled:opacity-60"
              title="Reset demo data with misconception spike"
            >
              <span className="material-symbols-outlined text-[18px]">restart_alt</span>
              <span>{seeding ? "Seeding…" : "Reset demo"}</span>
            </button>
            <button
              aria-label="Notifications"
              className="relative rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
            >
              <span className="material-symbols-outlined text-[20px]">notifications</span>
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-error"></span>
            </button>
            <div className="flex items-center gap-space-sm pl-space-xs">
              <div className="hidden text-right sm:block">
                <p className="font-label-md text-label-md leading-tight text-on-surface">Maria Sanchez</p>
                <p className="font-label-sm text-label-sm text-on-surface-variant">Grade 10 Math Lead</p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary font-label-md text-label-md font-bold text-on-primary shadow-sm">
                MS
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ==================== SIDEBAR ==================== */}
      <aside className="fixed bottom-0 left-0 top-16 z-40 flex w-64 flex-col justify-between bg-surface-container-lowest py-space-md shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col gap-space-xs px-space-sm">
          <div className="px-space-sm pb-space-xs">
            <p className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-outline">
              Diagnostic Suite
            </p>
          </div>
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => (
              <a
                key={item.label}
                href="#"
                onClick={(e) => e.preventDefault()}
                aria-current={item.active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-space-sm py-2 font-label-md text-label-md transition-all ${
                  item.active
                    ? "bg-primary-container font-semibold text-on-primary-container shadow-sm"
                    : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                <span>{item.label}</span>
              </a>
            ))}
          </nav>
        </div>
        <div className="flex flex-col gap-space-xs px-space-sm">
          <div className="mx-space-xs mb-space-xs h-px bg-outline-variant/30"></div>
          <nav className="flex flex-col gap-1">
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="flex items-center gap-3 rounded-lg px-space-sm py-2 font-label-md text-label-md text-on-surface-variant transition-all hover:bg-surface-container hover:text-on-surface"
            >
              <span className="material-symbols-outlined text-[20px]">tune</span>
              <span>Portal Settings</span>
            </a>
          </nav>
        </div>
      </aside>

      {/* ==================== MAIN ==================== */}
      <div className="pl-64">
        <main className="min-h-[calc(100vh-4rem)] w-full bg-surface px-gutter py-space-lg pt-16">
          {error && (
            <div className="mb-space-md rounded-lg bg-error-container px-4 py-3 font-label-md text-label-md text-on-error-container">
              {error}
            </div>
          )}
          <div className="flex w-full flex-col gap-space-lg">
            {/* TOP HEADER & CONTROLS BAR */}
            <div className="flex flex-col justify-between gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm xl:flex-row xl:items-center">
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-space-sm">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-fixed px-2.5 py-0.5 font-label-sm text-label-sm uppercase tracking-wider text-on-primary-fixed">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary"></span>
                    Teacher Command View
                  </span>
                  <span className="text-outline-variant">•</span>
                  <span className="inline-flex items-center gap-1.5 font-label-sm text-label-sm text-tertiary">
                    <span className="material-symbols-outlined text-[16px] text-tertiary">psychology</span>
                    Gemini Multi-Agent Diagnostics Active
                  </span>
                  {state && (
                    <span className="font-label-sm text-label-sm text-outline">
                      · v{state.version}
                    </span>
                  )}
                </div>
                <h1 className="font-headline-lg text-headline-lg tracking-tight text-on-surface">
                  Class-Wide Learning &amp; Diagnostic Heatmap
                </h1>
                <p className="max-w-3xl font-body-md text-body-md text-on-surface-variant">
                  AI Multi-Agent Cognitive Layer • Diagnosing fundamental reasoning stalls and procedural
                  misconceptions, not just right or wrong answers.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-space-sm">
                <div className="flex items-center gap-2 rounded-lg bg-surface-container-low px-3 py-2 text-on-surface">
                  <span className="material-symbols-outlined text-[18px] text-primary">groups</span>
                  <select
                    className="cursor-pointer bg-transparent font-label-md text-label-md text-on-surface focus:outline-none"
                    defaultValue="c1"
                  >
                    <option value="c1">Class 10 - A (CBSE / State)</option>
                    <option value="c2">Class 10 - B (CBSE / State)</option>
                    <option value="c3">Class 9 - Honors Math</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-surface-container-low px-3 py-2 text-on-surface">
                  <span className="material-symbols-outlined text-[18px] text-secondary">functions</span>
                  <select
                    className="cursor-pointer bg-transparent font-label-md text-label-md text-on-surface focus:outline-none"
                    defaultValue="m1"
                  >
                    <option value="m1">Mathematics (Term 2)</option>
                    <option value="m2">Physics Foundations</option>
                  </select>
                </div>
                <button
                  onClick={exportCsv}
                  className="flex items-center gap-1.5 rounded-lg bg-surface-container-high px-3 py-2 font-label-md text-label-md text-on-surface transition-all hover:bg-surface-variant"
                >
                  <span className="material-symbols-outlined text-[18px]">download</span>
                  <span>Export Diagnostic Report</span>
                </button>
                <button
                  onClick={onSync}
                  className="flex items-center gap-2 rounded-lg bg-primary-container px-3 py-2 font-label-md text-label-md text-on-primary shadow-sm transition-all hover:opacity-95"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-surface-bright opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-surface-bright"></span>
                  </span>
                  <span>Sync Real-Time State</span>
                </button>
              </div>
            </div>

            {/* 4-COLUMN KPI CARDS */}
            <div className="grid grid-cols-1 gap-space-md md:grid-cols-2 xl:grid-cols-4">
              {/* KPI 1 */}
              <div className="relative flex flex-col justify-between overflow-hidden rounded-xl bg-surface-container-lowest p-space-md shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                      Concept Mastery Diagnosis
                    </p>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="font-metric-display text-metric-display text-on-surface">
                        {masteryPct}%
                      </span>
                      <span className="flex items-center font-label-md text-label-md font-bold text-tertiary">
                        <span className="material-symbols-outlined text-[16px]">trending_up</span>
                        live
                      </span>
                    </div>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container-high text-primary">
                    <span className="material-symbols-outlined text-[22px]">insights</span>
                  </div>
                </div>
                <div className="-mx-4 -mb-4 mt-4 flex items-center justify-between bg-surface-container-low/50 px-4 pt-3 pb-2">
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    {totals.correct}✓ / {totals.attempts} attempts tracked
                  </span>
                  <svg className="h-5 w-20 text-primary" fill="none" viewBox="0 0 100 25">
                    <path
                      d="M0 20 Q 25 15, 50 18 T 100 4"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeWidth="2.5"
                    ></path>
                  </svg>
                </div>
              </div>

              {/* KPI 2 */}
              <div className="relative flex flex-col justify-between overflow-hidden rounded-xl bg-surface-container-lowest p-space-md shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                      Diagnosed Learning Stalls
                    </p>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="font-metric-display text-metric-display text-error">
                        {urgent} Urgent
                      </span>
                      <span className="font-label-md text-label-md font-medium text-on-surface-variant">
                        {moderate} Moderate
                      </span>
                    </div>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-error-container text-error">
                    <span className="material-symbols-outlined text-[22px]">warning</span>
                  </div>
                </div>
                <div className="-mx-4 -mb-4 mt-4 flex items-center justify-between bg-surface-container-low/50 px-4 pt-3 pb-2">
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    {students.length} active students tracked
                  </span>
                  {urgent > 0 && (
                    <span className="rounded-full bg-error-container px-2 py-0.5 font-label-sm text-label-sm font-bold text-error">
                      Action Needed
                    </span>
                  )}
                </div>
              </div>

              {/* KPI 3 */}
              <div className="relative flex flex-col justify-between overflow-hidden rounded-xl bg-surface-container-lowest p-space-md shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                      Reasoning Step Catch Rate
                    </p>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="font-metric-display text-metric-display text-secondary">
                        {catchPct}%
                      </span>
                      <span className="font-label-md text-label-md font-bold text-secondary">Procedural</span>
                    </div>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary-fixed text-secondary">
                    <span className="material-symbols-outlined text-[22px]">account_tree</span>
                  </div>
                </div>
                <div className="-mx-4 -mb-4 mt-4 flex items-center justify-between bg-surface-container-low/50 px-4 pt-3 pb-2">
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    Gemini reasoning agent active
                  </span>
                  <span className="rounded-full bg-secondary-fixed px-2 py-0.5 font-label-sm text-label-sm font-bold text-secondary">
                    1 call / turn
                  </span>
                </div>
              </div>

              {/* KPI 4 */}
              <div className="relative flex flex-col justify-between overflow-hidden rounded-xl bg-surface-container-lowest p-space-md shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                      Gamified Interventions
                    </p>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="font-metric-display text-metric-display text-primary">
                        {redFlagLessons.length} Quests
                      </span>
                      <span className="font-label-md text-label-md font-medium text-on-surface-variant">Ready</span>
                    </div>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-fixed text-primary">
                    <span className="material-symbols-outlined text-[22px]">sports_esports</span>
                  </div>
                </div>
                <div className="-mx-4 -mb-4 mt-4 flex items-center justify-between bg-surface-container-low/50 px-4 pt-3 pb-2">
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    Push bridge quests to map
                  </span>
                  <span className="rounded-full bg-primary-fixed px-2 py-0.5 font-label-sm text-label-sm font-bold text-primary">
                    Precomputed
                  </span>
                </div>
              </div>
            </div>

            {/* MAIN 2-COLUMN BALANCED DESKTOP GRID */}
            <div className="grid grid-cols-1 items-start gap-space-lg xl:grid-cols-12">
              {/* LEFT COLUMN: CLASS HEATMAP TABLE */}
              <div className="flex flex-col gap-space-md xl:col-span-7">
                <div className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
                  {/* Matrix Header & Legend */}
                  <div className="flex flex-col justify-between gap-space-sm pb-space-sm sm:flex-row sm:items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[22px] text-primary">grid_on</span>
                        <h2 className="font-headline-sm text-headline-sm text-on-surface">
                          Class Performance Heatmap
                        </h2>
                      </div>
                      <p className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">
                        Multi-agent reasoning diagnosis mapped by curriculum realm &amp; student — updates live
                        over SSE
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1.5 rounded-md bg-surface-container-low px-2 py-1 font-label-sm text-label-sm text-on-surface">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
                        <span>≥80% High</span>
                      </div>
                      <div className="flex items-center gap-1.5 rounded-md bg-surface-container-low px-2 py-1 font-label-sm text-label-sm text-on-surface">
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-500"></span>
                        <span>60-79% Mod</span>
                      </div>
                      <div className="flex items-center gap-1.5 rounded-md bg-surface-container-low px-2 py-1 font-label-sm text-label-sm text-on-surface">
                        <span className="h-2.5 w-2.5 rounded-full bg-rose-500"></span>
                        <span>&lt;60% Barrier</span>
                      </div>
                    </div>
                  </div>

                  {/* Heatmap Table — responsive, no horizontal scrollbar */}
                  <div className="w-full max-w-full">
                    <table className="w-full table-fixed text-left font-body-sm text-body-sm">
                      <thead>
                        <tr className="bg-surface-container-low font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                          <th className="w-[24%] rounded-l-lg py-3 pl-3 pr-2 font-bold">Student Learner</th>
                          {SUBJECTS.map((sub) => (
                            <th key={sub} className="w-[10%] px-1 py-3 text-center font-bold">
                              {sub}
                            </th>
                          ))}
                          <th className="w-[24%] px-2 py-3 font-bold">Diagnosed Barrier</th>
                          <th className="w-[12%] rounded-r-lg px-2 py-3 text-right font-bold">Adaptive Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {students.length === 0 && (
                          <tr>
                            <td
                              colSpan={6}
                              className="py-8 text-center font-body-md text-body-md text-on-surface-variant"
                            >
                              No student activity yet. Submit from Student view or hit Reset demo.
                            </td>
                          </tr>
                        )}
                        {students.map(([id, s]) => {
                          const urgentRow = s.wrong >= 2 && s.lastMisconception;
                          const barrier = misconceptionTitle(s.lastMisconception);
                          return (
                            <tr
                              key={id}
                              className={`group transition-colors hover:bg-surface-container-low/60 ${
                                urgentRow ? "bg-error-container/20" : ""
                              }`}
                            >
                              <td className="py-2.5 pl-3 pr-2">
                                <button
                                  onClick={() => setPickedStudent(pickedStudent === id ? null : id)}
                                  className="flex items-center gap-2.5 text-left"
                                >
                                  <span
                                    className={`flex h-8 w-8 items-center justify-center rounded-full font-label-md text-label-md font-bold shadow-xs ${
                                      urgentRow ? "bg-error text-on-error" : "bg-primary-fixed text-on-primary-fixed"
                                    }`}
                                  >
                                    {initials(id)}
                                  </span>
                                  <span>
                                    <span
                                      className={`block font-label-md text-label-md leading-tight text-on-surface ${
                                        urgentRow ? "font-semibold" : ""
                                      }`}
                                    >
                                      {prettyName(id)}
                                    </span>
                                    <span
                                      className={`block font-label-sm text-label-sm ${
                                        urgentRow ? "text-error" : "text-outline"
                                      }`}
                                    >
                                      {urgentRow
                                        ? "Stalled in Quest Gate"
                                        : `${SUBJECTS.filter((sub) => (subjectAccuracy(s, sub) ?? 0) >= 80).length}/3 Realms Cleared`}
                                    </span>
                                  </span>
                                </button>
                              </td>
                              {SUBJECTS.map((sub) => {
                                const acc = subjectAccuracy(s, sub);
                                return (
                                  <td key={sub} className="px-2 py-2.5 text-center">
                                    <span
                                      className={`inline-block w-full max-w-12 rounded py-1 font-label-sm text-label-sm font-bold shadow-xs ${accuracyClass(acc)}`}
                                    >
                                      {acc === null ? "—" : `${acc}%`}
                                    </span>
                                  </td>
                                );
                              })}
                              <td className="px-3 py-2.5">
                                <span
                                  className={`inline-flex items-center gap-1 font-label-sm text-label-sm ${
                                    urgentRow ? "font-semibold text-error" : "font-medium text-on-surface-variant"
                                  }`}
                                >
                                  {urgentRow && (
                                    <span className="material-symbols-outlined text-[14px]">error</span>
                                  )}
                                  {barrier ?? "No barrier detected"}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <button
                                  onClick={() =>
                                    triggerIntervention(
                                      `Remedial drill broadcast to ${prettyName(id)} for "${barrier ?? "practice"}"!`,
                                    )
                                  }
                                  className={`rounded px-2.5 py-1 font-label-sm text-label-sm shadow-xs transition-all ${
                                    urgentRow
                                      ? "bg-primary font-semibold text-on-primary hover:bg-primary-container"
                                      : "bg-surface-container-high text-on-surface hover:bg-primary hover:text-on-primary"
                                  }`}
                                >
                                  {urgentRow ? "Deploy Quest" : "Push Hint"}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Per-student drill-down */}
                  {pickedStudent &&
                    (() => {
                      const s = state?.students[pickedStudent];
                      if (!s) return null;
                      return (
                        <div className="rounded-xl bg-surface-container-low p-space-md">
                          <div className="mb-2 flex items-center justify-between">
                            <h4 className="font-title-md text-title-md text-on-surface">
                              {prettyName(pickedStudent)} — per-lesson breakdown
                            </h4>
                            <button
                              onClick={() => setPickedStudent(null)}
                              className="rounded-lg bg-surface-container-high px-2 py-1 font-label-sm text-label-sm text-on-surface hover:bg-surface-variant"
                            >
                              Close
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(s.lessons).map(([lid, ls]) => (
                              <span
                                key={lid}
                                className={`rounded-lg px-2.5 py-1.5 font-label-sm text-label-sm shadow-xs ${
                                  ls.wrong > 0 ? "bg-error-container text-on-error-container" : "bg-emerald-100 text-emerald-800"
                                }`}
                              >
                                {lessons.find((l) => l.id === lid)?.title ?? lid}: {ls.attempts - ls.wrong}✓ / {ls.wrong}✕
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                  {/* Table Footer */}
                  <div className="-mx-space-lg -mb-space-lg flex flex-col justify-between gap-space-sm rounded-b-xl bg-surface-container-low/40 px-space-lg py-3 pt-space-sm sm:flex-row sm:items-center">
                    <p className="font-label-sm text-label-sm text-on-surface-variant">
                      Showing {students.length} of {students.length} mapped students • Prioritized by Misconception
                      Urgency
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const firstRed = students.find(([, s]) => s.wrong >= 2 && s.lastMisconception);
                          if (firstRed) setPickedStudent(firstRed[0]);
                        }}
                        className="rounded-lg bg-surface-container-high px-3 py-1.5 font-label-sm text-label-sm text-on-surface transition-colors hover:bg-surface-variant"
                      >
                        Filter by Red Flags ({urgent})
                      </button>
                    </div>
                  </div>
                </div>

                {/* Gamified Realm Map Snapshot */}
                <div className="flex flex-col items-center gap-space-md rounded-xl bg-surface-container-lowest p-space-md shadow-sm md:flex-row">
                  <div className="relative flex h-28 w-full shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-primary-container to-secondary md:w-44">
                    <span className="material-symbols-outlined text-[48px] text-white/90">castle</span>
                    <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 via-transparent to-transparent p-2">
                      <span className="font-label-sm text-label-sm font-bold text-white">Class Realm Map</span>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-title-md text-title-md text-on-surface">
                        Shared World State: Student • Teacher • Parent
                      </h3>
                      <span className="font-label-sm text-label-sm font-bold text-primary">1 Shared Model</span>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      When you deploy a remediation quest here, it instantly modifies the locked bridges in the
                      student&apos;s adventure map, turning classroom weak spots into tangible quest gates.
                    </p>
                    <div className="mt-1 flex items-center gap-4 font-label-sm text-label-sm text-on-surface-variant">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[16px] text-primary">videogame_asset</span>
                        {students.length} Active Explorers
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[16px] text-secondary">lock_open</span>
                        {totals.correct} Gates Cleared
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: AI REASONING DIAGNOSIS & INTERVENTION HUB */}
              <div className="flex flex-col gap-space-md xl:col-span-5">
                {/* PANEL 0: COURSE PORTIONS & MATERIAL UPLOAD */}
                <div className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[22px] text-tertiary">upload_file</span>
                      <h2 className="font-headline-sm text-headline-sm text-on-surface">
                        Course Portions &amp; Material
                      </h2>
                    </div>
                    <span className="rounded-full bg-tertiary-fixed px-2.5 py-0.5 font-label-sm text-label-sm font-bold text-on-tertiary-fixed">
                      {topics.length} uploaded
                    </span>
                  </div>
                  <p className="-mt-2 font-body-sm text-body-sm text-on-surface-variant">
                    Upload PDFs or notes — they&apos;re chunked, embedded (Gemini) and stored
                    {storageMode === "supabase" ? " in Supabase pgvector" : " (demo store)"} for retrieval-grounded
                    quizzes.
                  </p>

                  <form onSubmit={onUploadMaterial} className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <input
                        value={matTitle}
                        onChange={(e) => setMatTitle(e.target.value)}
                        placeholder="Portion title, e.g. Adding Fractions"
                        required
                        className="min-w-0 flex-1 rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-3 py-2 font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-container/40"
                      />
                      <select
                        value={matSubject}
                        onChange={(e) => setMatSubject(e.target.value as CourseTopic["subject"])}
                        className="rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-2 py-2 font-body-sm text-body-sm text-on-surface focus:border-primary focus:outline-none"
                      >
                        {(["Fractions", "Algebra", "Biology", "General"] as const).map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    <textarea
                      value={matBody}
                      onChange={(e) => setMatBody(e.target.value)}
                      placeholder={
                        "Paste the portion / notes here (or attach a PDF below)…\ne.g. To add 1/2 + 1/3, find the common denominator: 3/6 + 2/6 = 5/6."
                      }
                      rows={4}
                      className="rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-3 py-2 font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-container/40"
                    />
                    <label
                      htmlFor="material-pdf"
                      className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-outline-variant/60 bg-surface-container-low/50 px-3 py-2.5 font-body-sm text-body-sm text-on-surface-variant transition-colors hover:bg-surface-container-low"
                    >
                      <span className="material-symbols-outlined text-[18px] text-tertiary">picture_as_pdf</span>
                      <span>{matFile ? matFile.name : "Attach a PDF (lecture notes, workbook chapters…)"}</span>
                      <input
                        id="material-pdf"
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={(e) => setMatFile(e.target.files?.[0] ?? null)}
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={uploading}
                      className="flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 font-label-md text-label-md font-semibold text-on-primary shadow-sm transition-all hover:opacity-90 disabled:opacity-60"
                    >
                      <span
                        className={`material-symbols-outlined text-[18px] ${uploading ? "animate-spin" : ""}`}
                      >
                        {uploading ? "progress_activity" : "cloud_upload"}
                      </span>
                      <span>{uploading ? "Extracting · chunking · embedding…" : "Upload & embed — powers student quizzes"}</span>
                    </button>
                  </form>

                  {topics.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {topics.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between gap-2 rounded-lg bg-surface-container-low px-2.5 py-1.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-label-md text-label-md font-semibold text-on-surface">
                              {t.title}
                            </p>
                            <p className="truncate font-label-sm text-label-sm text-outline">
                              {t.subject} · {t.material.trim().length} chars · embedded
                            </p>
                          </div>
                          <span
                            className="shrink-0 rounded-lg p-1.5 text-outline"
                            title="Managed via Supabase — deletions coming to the dashboard"
                          >
                            <span className="material-symbols-outlined text-[16px]">database</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* PANEL A: COGNITIVE DIAGNOSIS CARDS */}
                <div className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[22px] text-secondary">psychology_alt</span>
                      <h2 className="font-headline-sm text-headline-sm text-on-surface">
                        Cognitive Misconception Analysis
                      </h2>
                    </div>
                    <span className="rounded-full bg-secondary-fixed px-2 py-0.5 font-label-sm text-label-sm font-bold uppercase text-on-secondary-fixed">
                      AI Agent Socrates
                    </span>
                  </div>
                  <p className="-mt-2 font-body-sm text-body-sm text-on-surface-variant">
                    Classifies responses against student reasoning models rather than simple answer accuracy.
                  </p>

                  {topMisconceptions.length === 0 && (
                    <p className="rounded-xl bg-surface-container-low p-space-md font-body-sm text-body-sm text-on-surface-variant">
                      No misconceptions recorded yet. Reset the demo or submit attempts from the Student portal.
                    </p>
                  )}

                  {topMisconceptions.map((m, idx) => (
                    <div
                      key={m.id}
                      className={`relative flex flex-col gap-space-xs overflow-hidden rounded-xl p-space-md ${
                        m.urgent ? "bg-error-container/30" : "bg-amber-500/10"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <span
                          className={`rounded-full px-2.5 py-0.5 font-label-sm text-label-sm font-bold uppercase tracking-wider ${
                            m.urgent ? "bg-error text-on-error" : "bg-amber-500 text-white"
                          }`}
                        >
                          {m.urgent ? "Urgent Friction" : `Step Barrier`} • {m.count} Triggers
                        </span>
                        <span
                          className={`font-label-sm text-label-sm font-semibold ${
                            m.urgent ? "text-error" : "text-amber-900"
                          }`}
                        >
                          {lessonSubject(m.lessonId)} Domain
                        </span>
                      </div>
                      <h4 className="mt-1 font-title-md text-title-md text-on-surface">{m.title}</h4>
                      <div className="my-1 flex flex-col gap-1.5 rounded-lg bg-surface-container-lowest/80 p-space-sm">
                        <div className="flex items-center gap-1.5 font-label-sm text-label-sm font-bold text-primary">
                          <span className="material-symbols-outlined text-[16px]">
                            {idx === 0 ? "smart_toy" : "psychology"}
                          </span>
                          <span>{idx === 0 ? "Gemini Reasoning Classifier Trace" : "Cognitive Load Diagnostic"}</span>
                        </div>
                        <p className="font-body-sm text-body-sm text-on-surface">
                          {lessons.find((l) => l.id === m.lessonId)?.content ?? "Diagnostic trace pending."} Affected
                          students froze at this gate across {m.count} logged attempts.
                        </p>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant">
                          <span
                            className={`material-symbols-outlined text-[16px] ${
                              m.urgent ? "text-error" : "text-amber-700"
                            }`}
                          >
                            {m.urgent ? "group_remove" : "group"}
                          </span>
                          {m.affected.length > 0
                            ? `${m.affected.slice(0, 3).join(", ")}${m.affected.length > 3 ? ` +${m.affected.length - 3} others` : ""}`
                            : "No students currently flagged"}
                        </span>
                        <span
                          className={`font-label-sm text-label-sm font-bold ${
                            m.urgent ? "text-error" : "text-amber-800"
                          }`}
                        >
                          Gate: {lessons.find((l) => l.id === m.lessonId)?.title ?? m.lessonId}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* PANEL B: GAMIFIED REMEDIATION & INTERVENTION ACTION DECK */}
                <div className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[22px] text-primary">rocket_launch</span>
                      <h2 className="font-headline-sm text-headline-sm text-on-surface">
                        Adaptive Gamified Interventions
                      </h2>
                    </div>
                    <span className="rounded-full bg-primary-fixed px-2.5 py-0.5 font-label-sm text-label-sm font-bold text-on-primary-fixed">
                      Instant Dispatch
                    </span>
                  </div>
                  <p className="-mt-2 font-body-sm text-body-sm text-on-surface-variant">
                    One-click push to convert diagnosed cognitive traps into bridge-building gameplay.
                  </p>

                  {/* Action 1: Deploy Side-Quest */}
                  <div className="flex flex-col gap-space-sm rounded-xl bg-gradient-to-br from-primary-container to-primary p-space-md text-on-primary shadow-md transition-transform hover:scale-[1.01]">
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-white/20 px-2 py-0.5 font-label-sm text-label-sm font-bold uppercase text-white">
                        Featured Remediation
                      </span>
                      <span className="font-label-sm text-label-sm text-white/90">Estimated: 3-5 Mins</span>
                    </div>
                    <div>
                      <h4 className="font-title-lg text-title-lg font-bold leading-snug text-white">
                        Quest: &quot;{lessons.find((l) => l.id === featuredLesson)?.title ?? "Bridge Builder"}&quot;
                      </h4>
                      <p className="mt-1 font-body-sm text-body-sm text-white/90">
                        Deploys an interactive side-quest targeting the {featuredAffected} students currently tripping
                        on the top diagnosed barrier.
                      </p>
                    </div>
                    <button
                      disabled={deploying}
                      onClick={() => {
                        setDeploying(true);
                        setTimeout(() => {
                          setDeploying(false);
                          triggerIntervention(
                            `Adaptive Quest "${lessons.find((l) => l.id === featuredLesson)?.title}" pushed to ${featuredAffected} student game realms!`,
                          );
                        }, 1000);
                      }}
                      className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-white py-2.5 px-4 font-label-md text-label-md font-bold text-primary shadow-sm transition-colors hover:bg-surface-bright disabled:opacity-70"
                    >
                      <span className={`material-symbols-outlined text-[20px] ${deploying ? "animate-spin" : ""}`}>
                        {deploying ? "sync" : "send"}
                      </span>
                      <span>
                        {deploying
                          ? "Syncing with Game World..."
                          : `Deploy Adaptive Quest to ${featuredAffected} Students`}
                      </span>
                    </button>
                  </div>

                  {/* Action Grid: Micro-actions */}
                  <div className="grid grid-cols-1 gap-space-sm sm:grid-cols-2">
                    {[
                      {
                        icon: "play_circle",
                        iconCls: "bg-secondary-fixed text-on-secondary-fixed",
                        title: "2-Min Micro-Lesson",
                        desc: "Targeted visual concept refresher on the weakest quest gate.",
                        btn: "Broadcast Video",
                        hover: "group-hover:bg-secondary group-hover:text-on-secondary",
                        msg: "Micro-lesson video broadcasted to the class HUD!",
                      },
                      {
                        icon: "lightbulb",
                        iconCls: "bg-tertiary-fixed text-on-tertiary-fixed",
                        title: "Interactive Visual Hint",
                        desc: "In-app HUD diagram showing the correct reasoning steps.",
                        btn: "Push HUD Clue",
                        hover: "group-hover:bg-tertiary group-hover:text-on-tertiary",
                        msg: "Visual hint pushed to student HUDs!",
                      },
                      {
                        icon: "castle",
                        iconCls: "bg-primary-fixed text-on-primary-fixed",
                        title: "Unlock Kingdom Gate",
                        desc: "Eases the pass barrier condition for stalled explorers.",
                        btn: "Modify Gate Barrier",
                        hover: "group-hover:bg-primary group-hover:text-on-primary",
                        msg: "Gate barrier eased for stalled explorers!",
                      },
                      {
                        icon: "mail",
                        iconCls: "bg-error-container text-error",
                        title: "Notify Parents",
                        desc: "Sends an empathetic diagnostic summary to parent dashboards.",
                        btn: "Send Digest",
                        hover: "group-hover:bg-error group-hover:text-on-error",
                        msg: "Diagnostic digest sent to parent dashboards!",
                      },
                    ].map((a) => (
                      <div
                        key={a.title}
                        className="group flex cursor-pointer flex-col justify-between gap-space-xs rounded-xl bg-surface-container-low p-space-sm transition-colors hover:bg-surface-container"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${a.iconCls}`}
                          >
                            <span className="material-symbols-outlined text-[18px]">{a.icon}</span>
                          </div>
                          <p className="font-label-md text-label-md font-semibold leading-tight text-on-surface">
                            {a.title}
                          </p>
                        </div>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">{a.desc}</p>
                        <button
                          onClick={() => triggerIntervention(a.msg)}
                          className={`w-full rounded bg-surface-container-lowest px-2 py-1.5 text-center font-label-sm text-label-sm font-bold text-on-surface transition-colors ${a.hover}`}
                        >
                          {a.btn}
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Success Toast */}
                  {toast && (
                    <div className="flex items-center gap-2 rounded-lg bg-emerald-100 p-3 font-label-md text-label-md text-emerald-900">
                      <span className="material-symbols-outlined text-[20px] text-emerald-600">check_circle</span>
                      <span>{toast}</span>
                    </div>
                  )}
                </div>

                {/* Live feed */}
                {state && state.recent.length > 0 && (
                  <div className="flex flex-col gap-2 rounded-xl bg-surface-container-lowest p-space-md shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px] text-tertiary">stream</span>
                        <h3 className="font-title-md text-title-md text-on-surface">Live feed — latest attempts</h3>
                      </div>
                      <span className="font-label-sm text-label-sm text-outline">v{state.version}</span>
                    </div>
                    <ul className="flex flex-col gap-1">
                      {state.recent.slice(0, 6).map((e, i) => (
                        <li
                          key={`${e.at}-${i}`}
                          className="flex items-center gap-2 rounded-lg bg-surface-container-low px-2.5 py-1.5 font-label-sm text-label-sm text-on-surface"
                        >
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded-full font-bold ${
                              e.correct ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                            }`}
                          >
                            {e.correct ? "✓" : "✕"}
                          </span>
                          <span className="font-semibold">{prettyName(e.studentId)}</span>
                          <span className="text-on-surface-variant">
                            {lessons.find((l) => l.id === e.lessonId)?.title ?? e.lessonId}
                          </span>
                          {!e.correct && e.misconceptionId && (
                            <span className="ml-auto truncate rounded bg-error-container px-1.5 py-0.5 text-[10px] font-bold text-on-error-container">
                              {e.misconceptionId}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
