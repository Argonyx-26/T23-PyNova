"use client";

import Image from "next/image";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import BubbleArcade from "@/components/bubble-arcade";
import MapGrid from "@/components/map-grid";
import { loadStudent, saveStudent, submitAnswer } from "@/lib/store";
import { applyResult, getMapGrid } from "@/lib/world";
import { getPack } from "@/lib/game-bank";
import type { DiagnoseResult } from "@/lib/types";
import bank from "@/lib/bank.json";

const STUDENT_ID = "demo-student";

export default function StudentPortalPage() {
  // Student & Backend Quest state
  const [student, setStudent] = useState(() => loadStudent(STUDENT_ID));
  const [answer, setAnswer] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [feedback, setFeedback] = useState<DiagnoseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [latency, setLatency] = useState<{ ms: number; cached: boolean } | null>(null);
  const [shakeId, setShakeId] = useState<string | null>(null);
  const [popId, setPopId] = useState<string | null>(null);
  const [showQuestModal, setShowQuestModal] = useState(false);
  const [inGame, setInGame] = useState(false);
  const [activeTab, setActiveTab] = useState<"journey" | "quiz" | "goals" | "improvement" | "settings">("journey");

  // Pomodoro Timer State
  const [initialSeconds, setInitialSeconds] = useState(25 * 60);
  const [totalSeconds, setTotalSeconds] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [timerMode, setTimerMode] = useState<"pomodoro" | "short" | "deep">("pomodoro");
  const [soundMode, setSoundMode] = useState("Lo-Fi");
  const [isLoFiActive, setIsLoFiActive] = useState(true);

  // Quest Navigation
  const nodes = useMemo(() => getMapGrid(student), [student]);
  const [picked, setPicked] = useState<string | null>(null);

  const currentQuiz = useMemo(() => {
    const quizzes = bank.quizzes as { id: string; lessonId: string; prompt: string }[];
    const open = nodes.find((n) => n.status === "open");
    const fallback = open ?? nodes.find((n) => n.status === "mastered") ?? nodes[0];
    const target =
      (picked ? nodes.find((n) => n.lessonId === picked && n.status !== "locked") : undefined) ??
      fallback;
    return quizzes.find((q) => q.lessonId === target.lessonId) ?? quizzes[0];
  }, [nodes, picked]);

  const pack = useMemo(() => getPack(currentQuiz.lessonId), [currentQuiz.lessonId]);

  // ---- Teacher-uploaded course material (RAG) ----
  interface MaterialTopic {
    id: string;
    title: string;
    subject: string;
    material: string;
  }
  const [topics, setTopics] = useState<MaterialTopic[]>([]);
  const [materialQuiz, setMaterialQuiz] = useState<{
    q: string;
    options: [string, string, string, string];
    answer: number;
    citation: string;
  } | null>(null);
  const [quizSources, setQuizSources] = useState<string[]>([]);
  const [expected, setExpected] = useState<string | undefined>(undefined);

  // Sync stored student on mount + load teacher portions
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStudent(loadStudent(STUDENT_ID));
    fetch("/api/materials", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.materials) {
          setTopics(
            (d.materials as { id: string; title: string; subject: string; char_count: number }[]).map((m) => ({
              id: m.id,
              title: m.title,
              subject: m.subject,
              material: " ".repeat(Math.min(m.char_count, 20000)),
            })),
          );
        }
      })
      .catch(() => {
        // material panel best-effort
      });
  }, []);

  // Fetch a retrieval-grounded quiz whenever the quest modal opens
  useEffect(() => {
    if (!showQuestModal) return;
    fetch("/api/quiz/rag?count=3", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.questions?.length) {
          const q = d.questions[0];
          setMaterialQuiz({
            q: q.q,
            options: q.options,
            answer: q.answer,
            citation: q.citation ?? "class material",
          });
          setQuizSources(d.sources ?? []);
          setExpected(q.expectedReasoning);
        } else {
          setMaterialQuiz(null);
          setQuizSources([]);
          setExpected(undefined);
        }
      })
      .catch(() => {});
  }, [showQuestModal]);

  // Timer Tick
  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => {
      setTotalSeconds((s) => {
        if (s <= 1) {
          setIsRunning(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isRunning]);

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const timeFormatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const circumference = 2 * Math.PI * 82; // ~515.22
  const progressRatio = totalSeconds / initialSeconds;
  const strokeOffset = circumference * (1 - progressRatio);

  const setTimerDuration = (mins: number, mode: "pomodoro" | "short" | "deep") => {
    setIsRunning(false);
    const secs = mins * 60;
    setInitialSeconds(secs);
    setTotalSeconds(secs);
    setTimerMode(mode);
  };

  const handleGameFinish = (summary: { score: number; hits: number; misses: number }) => {
    setInGame(false);
    const bonusXp = Math.round(summary.score / 20);
    const updated = { ...student, xp: student.xp + bonusXp };
    setStudent(updated);
    saveStudent(updated);
  };

  async function handleDiagnoseSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { result, ms, cached } = await submitAnswer({
        answer,
        reasoning,
        lessonId: currentQuiz.lessonId,
        quizId: currentQuiz.id,
        studentId: STUDENT_ID,
        expected,
      });
      setFeedback(result);
      setLatency({ ms, cached });
      const next = applyResult(student, currentQuiz.lessonId, result.correct);
      setStudent(next);
      saveStudent(next);
      if (!result.correct) {
        setShakeId(currentQuiz.lessonId);
        setTimeout(() => setShakeId(null), 700);
      } else {
        const wasOpen = (student.mastery[currentQuiz.lessonId] ?? 0) < 0.8;
        if (wasOpen && (next.mastery[currentQuiz.lessonId] ?? 0) >= 0.8) {
          setPopId(currentQuiz.lessonId);
          setTimeout(() => setPopId(null), 600);
        }
        setAnswer("");
        setReasoning("");
      }
    } catch {
      // ignore, feedback remains visible
    } finally {
      setBusy(false);
    }
  }

  const fillPreset = (kind: "correct" | "wrong") => {
    if (currentQuiz.lessonId === "frac-1") {
      if (kind === "wrong") {
        setAnswer("2/5");
        setReasoning("I added the numerators and denominators straight across: 1+1=2, 2+3=5.");
      } else {
        setAnswer("5/6");
        setReasoning("Common denominator is 6: 1/2 is 3/6 and 1/3 is 2/6, so 3/6 + 2/6 = 5/6.");
      }
    } else {
      if (kind === "wrong") {
        setAnswer("1/8");
        setReasoning("Because 8 is a bigger number than 4, so 1/8 must be bigger.");
      } else {
        setAnswer("1/4");
        setReasoning("Cutting into 4 pieces gives larger portions than cutting into 8 pieces.");
      }
    }
  };

  return (
    <div className="jf-portal flex min-h-screen">
      {/* ==================== SHARED COMPONENT: SideNavBar ==================== */}
      <aside className="fixed top-0 left-0 h-screen w-64 flex flex-col justify-between p-4 bg-surface-container-lowest shadow-sm z-30 shrink-0 border-r border-outline-variant/30">
        <div className="flex flex-col gap-5">
          {/* Brand Logo / Product Identity */}
          <div className="flex items-center justify-between px-2 pt-2 pb-1">
            <div className="flex items-center gap-2">
              <Image src="/logo.jpg" alt="JustFormi" width={140} height={140} priority className="h-10 w-auto object-contain" />
            </div>
            <Link
              href="/"
              className="text-caption font-caption px-2 py-0.5 rounded-lg bg-surface-container-low text-primary hover:bg-surface-container font-semibold transition-colors"
              title="Return to main portal launcher"
            >
              Portals
            </Link>
          </div>

          {/* Student Mini Profile Card */}
          <div className="p-3 rounded-xl bg-surface-container-low flex items-center gap-3 border border-outline-variant/30">
            <div className="relative">
              <div className="w-11 h-11 rounded-xl bg-primary-container/30 text-primary flex items-center justify-center font-bold text-lg ring-2 ring-primary-container/40">
                AC
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center text-[9px] font-bold">
                11
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h4 className="text-label-md font-label-md text-on-surface truncate font-semibold">Alex Chen</h4>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-caption font-caption bg-secondary-fixed text-on-secondary-fixed font-bold">
                  Lvl 8
                </span>
              </div>
              <p className="text-caption font-caption text-on-surface-variant truncate">Computer Science &amp; Design</p>
            </div>
          </div>

          {/* Main Navigation Tabs — grouped: primary learning vs utilities */}
          <nav className="flex flex-col gap-1.5">
            {/* ===== PRIMARY: Core learning pages ===== */}
            <p className="px-4 pb-1 text-caption font-caption text-outline uppercase tracking-wider font-semibold">
              Learn
            </p>

            {/* 1. Journey (Quest Map) */}
            <button
              onClick={() => {
                setActiveTab("journey");
                setShowQuestModal(true);
              }}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl font-label-md text-label-md transition-colors duration-150 text-left w-full ${
                activeTab === "journey"
                  ? "bg-primary-container text-on-primary-container shadow-sm font-bold"
                  : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined" data-icon="explore" style={{ fontVariationSettings: "'FILL' 1" }}>
                explore
              </span>
              <span className="flex-1 font-bold">Journey (Quest Map)</span>
              <span className="w-2 h-2 rounded-full bg-on-primary-container"></span>
            </button>

            {/* 2. Goals */}
            <button
              onClick={() => setActiveTab("goals")}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl font-label-md text-label-md transition-colors duration-150 text-left w-full ${
                activeTab === "goals"
                  ? "bg-primary-container text-on-primary-container shadow-sm font-bold"
                  : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined" data-icon="flag">flag</span>
              <span className="flex-1">Goals</span>
              <span className="text-caption font-caption text-outline">4 Active</span>
            </button>

            {/* 3. Improvement Board */}
            <button
              onClick={() => setActiveTab("improvement")}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl font-label-md text-label-md transition-colors duration-150 text-left w-full ${
                activeTab === "improvement"
                  ? "bg-primary-container text-on-primary-container shadow-sm font-bold"
                  : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined" data-icon="trending_up">trending_up</span>
              <span className="flex-1">Improvement Board</span>
            </button>

            {/* Group divider */}
            <div className="mx-3 my-2 h-px bg-outline-variant/40" aria-hidden />

            {/* ===== SECONDARY: Practice & utilities ===== */}
            <p className="px-4 pb-1 text-caption font-caption text-outline uppercase tracking-wider font-semibold">
              Practice &amp; Tools
            </p>

            {/* 4. Quick Quiz */}
            <button
              onClick={() => {
                setActiveTab("quiz");
                setShowQuestModal(true);
              }}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl font-label-md text-label-md transition-colors duration-150 text-left w-full ${
                activeTab === "quiz"
                  ? "bg-primary-container text-on-primary-container shadow-sm font-bold"
                  : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined" data-icon="quiz">quiz</span>
              <span className="flex-1">Quick Quiz</span>
              <span className="text-caption font-caption px-2 py-0.5 rounded-full bg-secondary-container/40 text-on-secondary-container font-bold">
                3 New
              </span>
            </button>

            {/* 5. Arcade Game */}
            <button
              onClick={() => {
                setShowQuestModal(true);
                setInGame(true);
              }}
              className="flex items-center gap-3 px-4 py-3 rounded-xl font-label-md text-label-md text-secondary hover:bg-secondary-fixed/40 transition-colors duration-150 text-left w-full font-bold"
            >
              <span className="material-symbols-outlined" data-icon="sports_esports">sports_esports</span>
              <span className="flex-1">Bubble Arcade</span>
              <span className="text-caption font-caption px-1.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed">
                PLAY
              </span>
            </button>

            {/* 6. Lo-Fi Focus Sound Toggle (moved from top header) */}
            <button
              onClick={() => setIsLoFiActive(!isLoFiActive)}
              className="flex items-center gap-3 px-4 py-3 rounded-xl font-label-md text-label-md text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors duration-150 text-left w-full"
              title="Focus Lo-Fi Player"
            >
              <span className="material-symbols-outlined text-secondary" data-icon="headphones">headphones</span>
              <span className="flex-1">Lo-Fi Chill</span>
              <span className={`w-2 h-2 rounded-full ${isLoFiActive ? "bg-primary animate-pulse" : "bg-outline"}`}></span>
            </button>
          </nav>
        </div>

        {/* Bottom Actions & Footer Navigation */}
        <div className="flex flex-col gap-3 pt-3 border-t border-outline-variant/30">
          {/* CTA Button */}
          <button
            onClick={() => {
              setShowQuestModal(true);
              setInGame(true);
            }}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-primary-container to-secondary-container text-on-primary-container font-label-md text-label-md shadow-sm hover:opacity-95 active:scale-95 transition-all duration-200 font-bold"
          >
            <span className="material-symbols-outlined text-body-lg" data-icon="timer">timer</span>
            <span>New Study Session</span>
          </button>

          {/* Footer Tabs */}
          <div className="flex flex-col gap-1">
            <Link
              href="/"
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-on-surface-variant font-label-md text-label-md hover:bg-surface-container-low transition-colors duration-150"
            >
              <span className="material-symbols-outlined text-body-lg" data-icon="hub">hub</span>
              <span>All Portals</span>
            </Link>
            <button
              onClick={() => alert("JustFormi Student Portal v2.4 (Argonyx Edition)")}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-on-surface-variant font-label-md text-label-md hover:bg-surface-container-low transition-colors duration-150 text-left"
            >
              <span className="material-symbols-outlined text-body-lg" data-icon="help">help</span>
              <span>Support</span>
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl font-label-md text-label-md transition-colors duration-150 text-left ${
                activeTab === "settings"
                  ? "bg-primary-container text-on-primary-container shadow-sm font-bold"
                  : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-body-lg" data-icon="settings">settings</span>
              <span>Settings</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ==================== MAIN CONTENT WRAPPER ==================== */}
      <div className="ml-64 flex-1 flex flex-col min-w-0 bg-[#f9f9ff]">
        {/* ==================== SHARED COMPONENT: TopNavBar ==================== */}
        <header className="top-0 sticky z-20 bg-surface-container-lowest/90 backdrop-blur-md shadow-sm border-b border-outline-variant/20">
          <div className="flex justify-between items-center px-8 py-3.5 w-full">
            {/* Search Bar */}
            <div className="relative w-96 max-w-md">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-outline" data-icon="search">
                search
              </span>
              <input
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface placeholder:text-outline text-body-sm font-body-sm focus:outline-none focus:ring-2 focus:ring-primary-container focus:border-transparent transition-all"
                placeholder="Search courses, notes, or quiz topics..."
                type="text"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-caption font-caption text-outline bg-surface-container-lowest rounded border border-outline-variant/50">
                ⌘K
              </span>
            </div>

            {/* Trailing Actions & Student Profile Badge */}
            <div className="flex items-center gap-4">
              {/* Streak Badge */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary-fixed text-on-secondary-fixed font-label-md text-label-md shadow-sm">
                <span className="material-symbols-outlined text-error" data-icon="local_fire_department" style={{ fontVariationSettings: "'FILL' 1" }}>
                  local_fire_department
                </span>
                <span className="font-bold">Streak: {student.streak > 0 ? student.streak : 12} Days</span>
              </div>

              {/* Notification Bell */}
              <button aria-label="Notifications" className="relative p-2 rounded-xl text-on-surface-variant hover:bg-surface-container-low transition-colors">
                <span className="material-symbols-outlined text-headline-sm" data-icon="notifications">
                  notifications
                </span>
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-error ring-2 ring-surface-container-lowest"></span>
              </button>

              {/* User Profile Avatar */}
              <div className="flex items-center gap-2 pl-2 border-l border-outline-variant/40">
                <div className="w-9 h-9 rounded-xl bg-secondary-fixed text-secondary flex items-center justify-center font-bold text-sm ring-2 ring-primary-container/30">
                  AC
                </div>
                <div className="hidden xl:block text-left">
                  <span className="block text-label-sm font-label-sm text-on-surface font-semibold">Alex Chen</span>
                  <span className="block text-caption font-caption text-secondary">Student Honor Roll ({student.xp} XP)</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* ==================== DASHBOARD CANVAS ==================== */}
        <main className="p-8 space-y-6 max-w-[1440px] mx-auto w-full">
          {/* Welcoming Greeting Banner */}
          {(activeTab === "journey") && (
<section className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-surface-container-low via-surface-container to-secondary-fixed/40 border border-outline-variant/30 pastel-card-shadow">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-on-surface tracking-tight">Good afternoon, Alex! ✨</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs bg-primary-container text-on-primary-container font-semibold">
                  Semester II
                </span>
              </div>
              <p className="text-sm text-on-surface-variant">
                You&apos;re on track for your weekly goals! Keep this steady rhythm going for midterms.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                <div className="w-8 h-8 rounded-full bg-primary-fixed flex items-center justify-center text-on-primary-fixed text-xs font-bold border-2 border-surface-container-lowest">
                  CS
                </div>
                <div className="w-8 h-8 rounded-full bg-secondary-fixed flex items-center justify-center text-on-secondary-fixed text-xs font-bold border-2 border-surface-container-lowest">
                  AP
                </div>
                <div className="w-8 h-8 rounded-full bg-tertiary-fixed flex items-center justify-center text-on-tertiary-fixed text-xs font-bold border-2 border-surface-container-lowest">
                  PH
                </div>
              </div>
              <div className="text-left text-xs text-on-surface-variant">
                <span className="font-bold text-on-surface block">3 Active Study Pods</span>
                <span>Next session in 2h</span>
              </div>
            </div>
          </section>
)}

          {/* TEACHER'S UPLOADED PORTIONS */}
          {topics.length > 0 && activeTab === "journey" && (
<section className="p-5 rounded-2xl bg-gradient-to-r from-tertiary-fixed/60 via-surface-container-low to-surface-container-lowest border border-outline-variant/30 pastel-card-shadow">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-9 h-9 rounded-xl bg-tertiary-fixed text-tertiary flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-headline-sm" data-icon="menu_book">menu_book</span>
                  </span>
                  <div className="min-w-0">
                    <p className="text-label-sm font-label-sm text-outline uppercase tracking-wider">
                      From your teacher — this week&apos;s portions
                    </p>
                    <p className="text-label-md font-label-md text-on-surface font-bold truncate">
                      {topics.map((t) => t.title).join(" · ")}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowQuestModal(true);
                    setActiveTab("quiz");
                  }}
                  className="px-3 py-2 rounded-xl bg-primary text-on-primary font-label-sm text-label-sm font-bold shadow-sm hover:opacity-90 active:scale-95 transition-all shrink-0"
                >
                  Practice these portions
                </button>
              </div>
              <p className="text-caption font-caption text-on-surface-variant mt-2">
                Quizzes, grading and arcade packs are generated from these portions — {topics.length} uploaded.
              </p>
            </section>
          )}

          {/* 1. TOP METRICS / QUICK STATS (BENTO ROW) */}
          {(activeTab === "journey") && (
<section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Metric 1: Study Hours this week */}
            <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 pastel-card-shadow card-hover-fx relative overflow-hidden">
              <div className="absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-primary-fixed/20 pointer-events-none"></div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-on-surface-variant">Weekly Study Hours</span>
                <div className="w-9 h-9 rounded-xl bg-primary-container/20 text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-lg" data-icon="schedule">schedule</span>
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-on-surface tracking-tight">18.5</span>
                <span className="text-xs text-on-surface-variant font-medium">hrs</span>
              </div>
              <div className="mt-2.5 flex items-center gap-1.5 text-xs text-primary font-bold">
                <span className="material-symbols-outlined text-sm" data-icon="arrow_upward">arrow_upward</span>
                <span>+12% from last week</span>
              </div>
            </div>

            {/* Metric 2: Completed Quizzes */}
            <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 pastel-card-shadow card-hover-fx relative overflow-hidden">
              <div className="absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-secondary-fixed/30 pointer-events-none"></div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-on-surface-variant">Quest XP Points</span>
                <div className="w-9 h-9 rounded-xl bg-secondary-fixed text-secondary flex items-center justify-center">
                  <span className="material-symbols-outlined text-lg" data-icon="task_alt">task_alt</span>
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-on-surface tracking-tight">{student.xp}</span>
                <span className="text-xs text-on-surface-variant">XP points</span>
              </div>
              <div className="mt-2.5 flex items-center gap-1.5 text-xs text-secondary font-bold">
                <span className="material-symbols-outlined text-sm" data-icon="verified">verified</span>
                <span>Streak {student.streak} 🔥 Active</span>
              </div>
            </div>

            {/* Metric 3: Active Goals */}
            <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 pastel-card-shadow card-hover-fx relative overflow-hidden">
              <div className="absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-surface-container pointer-events-none"></div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-on-surface-variant">Active Goals</span>
                <div className="w-9 h-9 rounded-xl bg-surface-container text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-lg" data-icon="flag">flag</span>
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-on-surface tracking-tight">4</span>
                <span className="text-xs text-on-surface-variant">in progress</span>
              </div>
              <div className="mt-2.5 flex items-center gap-1.5 text-xs text-outline font-medium">
                <span className="material-symbols-outlined text-sm text-error" data-icon="priority_high">priority_high</span>
                <span className="text-error font-semibold">2 deadlines this week</span>
              </div>
            </div>

            {/* Metric 4: Focus Rating */}
            <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 pastel-card-shadow card-hover-fx relative overflow-hidden">
              <div className="absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-tertiary-fixed/30 pointer-events-none"></div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-on-surface-variant">Focus Efficiency</span>
                <div className="w-9 h-9 rounded-xl bg-tertiary-fixed text-tertiary flex items-center justify-center">
                  <span className="material-symbols-outlined text-lg" data-icon="bolt">bolt</span>
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-on-surface tracking-tight">98%</span>
                <span className="text-xs text-secondary font-semibold">Optimal</span>
              </div>
              <div className="mt-2.5 flex items-center gap-1.5 text-xs text-tertiary font-bold">
                <span className="material-symbols-outlined text-sm" data-icon="auto_awesome">auto_awesome</span>
                <span>+3 pts above personal avg</span>
              </div>
            </div>
          </section>
)}

                    {/* ==================== SECTION: FOCUS & TOOLS ==================== */}
          {(activeTab === "journey") && (
<section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="col-span-full flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-lg" data-icon="bolt">bolt</span>
                <h2 className="text-caption font-caption text-outline uppercase tracking-widest font-bold">Focus & Tools</h2>
                <div className="flex-1 h-px bg-outline-variant/30" />
              </div>
{/* CARD 1: Interactive Pomodoro Study Timer (5 cols) */}
            <div className="lg:col-span-7 p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 pastel-card-shadow flex flex-col justify-between space-y-6">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-xl" data-icon="hourglass_top">
                      hourglass_top
                    </span>
                    <h3 className="text-lg text-on-surface font-bold">Focus Deck</h3>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs bg-secondary-fixed text-on-secondary-fixed font-bold tracking-wide">
                    4 / 6 Sessions Done
                  </span>
                </div>

                {/* Mode Tabs */}
                <div className="flex items-center p-1 rounded-xl bg-surface-container-low border border-outline-variant/30">
                  <button
                    className={`flex-1 py-1.5 text-center rounded-lg text-xs transition-all ${
                      timerMode === "pomodoro"
                        ? "bg-surface-container-lowest text-primary font-bold shadow-sm"
                        : "text-on-surface-variant hover:text-on-surface"
                    }`}
                    onClick={() => setTimerDuration(25, "pomodoro")}
                  >
                    Pomodoro (25m)
                  </button>
                  <button
                    className={`flex-1 py-1.5 text-center rounded-lg text-xs transition-all ${
                      timerMode === "short"
                        ? "bg-surface-container-lowest text-primary font-bold shadow-sm"
                        : "text-on-surface-variant hover:text-on-surface"
                    }`}
                    onClick={() => setTimerDuration(5, "short")}
                  >
                    Short Break (5m)
                  </button>
                  <button
                    className={`flex-1 py-1.5 text-center rounded-lg text-xs transition-all ${
                      timerMode === "deep"
                        ? "bg-surface-container-lowest text-primary font-bold shadow-sm"
                        : "text-on-surface-variant hover:text-on-surface"
                    }`}
                    onClick={() => setTimerDuration(50, "deep")}
                  >
                    Deep Focus (50m)
                  </button>
                </div>
              </div>

              {/* Circular Progress & Timer Display */}
              <div className="flex flex-col items-center justify-center my-2">
                <div className="relative w-56 h-56 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 200 200">
                    <circle cx="100" cy="100" fill="transparent" r="82" stroke="#EBF2FF" strokeWidth="12"></circle>
                    <defs>
                      <linearGradient id="timerGradient" x1="0%" x2="100%" y1="0%" y2="100%">
                        <stop offset="0%" stopColor="#6BA4FF"></stop>
                        <stop offset="100%" stopColor="#9D8DF1"></stop>
                      </linearGradient>
                    </defs>
                    <circle
                      className="transition-all duration-1000 ease-linear"
                      cx="100"
                      cy="100"
                      fill="transparent"
                      r="82"
                      stroke="url(#timerGradient)"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeOffset}
                      strokeLinecap="round"
                      strokeWidth="12"
                    ></circle>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-[44px] leading-tight font-extrabold text-on-surface tracking-tight">
                      {timeFormatted}
                    </span>
                    <span className="text-xs text-secondary font-semibold uppercase tracking-wider mt-1">
                      {isRunning ? "Focusing" : "Paused"}
                    </span>
                  </div>
                </div>

                {/* Current Task Pill */}
                <div className="mt-4 px-4 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 flex items-center gap-2 max-w-full">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary-container animate-pulse"></span>
                  <span className="text-xs text-on-surface truncate font-semibold">
                    AP Computer Science: Data Structures Review
                  </span>
                </div>
              </div>

              {/* Control Buttons */}
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-3">
                  <button
                    className="w-11 h-11 rounded-xl bg-surface-container text-on-surface-variant hover:bg-surface-container-high flex items-center justify-center transition-colors"
                    onClick={() => {
                      setIsRunning(false);
                      setTotalSeconds(initialSeconds);
                    }}
                    title="Reset Session"
                  >
                    <span className="material-symbols-outlined" data-icon="replay">replay</span>
                  </button>
                  <button
                    className="px-8 py-3 rounded-xl bg-gradient-to-r from-primary-container to-secondary-container text-on-primary-container text-sm font-bold shadow-md hover:opacity-95 active:scale-95 transition-all flex items-center gap-2"
                    onClick={() => setIsRunning(!isRunning)}
                  >
                    <span className="material-symbols-outlined" data-icon={isRunning ? "pause" : "play_arrow"} style={{ fontVariationSettings: "'FILL' 1" }}>
                      {isRunning ? "pause" : "play_arrow"}
                    </span>
                    <span>{isRunning ? "Pause" : "Start"}</span>
                  </button>
                  <button
                    className="w-11 h-11 rounded-xl bg-surface-container text-on-surface-variant hover:bg-surface-container-high flex items-center justify-center transition-colors"
                    onClick={() => setTotalSeconds(0)}
                    title="Skip Step"
                  >
                    <span className="material-symbols-outlined" data-icon="skip_next">skip_next</span>
                  </button>
                </div>

                {/* Ambient Sound Selector */}
                <div className="pt-3 border-t border-outline-variant/30 flex items-center justify-between text-xs text-on-surface-variant">
                  <span>Ambient Sound:</span>
                  <div className="flex items-center gap-1.5">
                    {["Lo-Fi", "Gentle Rain", "Library"].map((s) => (
                      <button
                        key={s}
                        onClick={() => setSoundMode(s)}
                        className={`px-2 py-1 rounded-lg text-xs font-semibold ${
                          soundMode === s
                            ? "bg-surface-container text-primary"
                            : "bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

                        {/* CARD: Session Tools (5 cols) */}
            <div className="lg:col-span-5 p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 pastel-card-shadow flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-xl" data-icon="construction">construction</span>
                  <h3 className="text-lg text-on-surface font-bold">Session Tools</h3>
                </div>
                <span className="px-3 py-1 rounded-full text-caption font-caption bg-secondary-fixed text-on-secondary-fixed font-bold tracking-wide">
                  4 / 6 Sessions Done
                </span>
              </div>

              <div className="flex flex-col gap-3 flex-1">
                <button
                  onClick={() => {
                    setShowQuestModal(true);
                    setActiveTab("journey");
                  }}
                  className="w-full p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 flex items-center justify-between gap-3 card-hover-fx text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-xl bg-primary-container/20 text-primary flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined" data-icon="map">map</span>
                    </span>
                    <div>
                      <p className="text-label-md font-label-md text-on-surface font-semibold">Launch Quest Map</p>
                      <p className="text-caption font-caption text-on-surface-variant">Practice any open realm</p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-outline" data-icon="chevron_right">chevron_right</span>
                </button>

                <button
                  onClick={() => {
                    setShowQuestModal(true);
                    setInGame(true);
                  }}
                  className="w-full p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 flex items-center justify-between gap-3 card-hover-fx text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-xl bg-secondary-fixed text-secondary flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined" data-icon="sports_esports">sports_esports</span>
                    </span>
                    <div>
                      <p className="text-label-md font-label-md text-on-surface font-semibold">New Study Session</p>
                      <p className="text-caption font-caption text-on-surface-variant">Warm up in the Bubble Arcade</p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-outline" data-icon="chevron_right">chevron_right</span>
                </button>

                <button
                  onClick={() => {
                    setShowQuestModal(true);
                    setActiveTab("quiz");
                  }}
                  className="w-full p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 flex items-center justify-between gap-3 card-hover-fx text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-xl bg-tertiary-fixed text-tertiary flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined" data-icon="menu_book">menu_book</span>
                    </span>
                    <div>
                      <p className="text-label-md font-label-md text-on-surface font-semibold">Practice Teacher Portions</p>
                      <p className="text-caption font-caption text-on-surface-variant">Quizzes from this week&apos;s material</p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-outline" data-icon="chevron_right">chevron_right</span>
                </button>
              </div>

              <p className="text-caption font-caption text-outline mt-4 pt-3 border-t border-outline-variant/30">
                Tip: pair a 25-minute Focus Deck run with a Quick Quiz for maximum retention.
              </p>
            </div>
          </section>
)}

          {/* ==================== SECTION: IMPROVEMENT & INSIGHTS ==================== */}
          {(activeTab === "improvement") && (
<section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="col-span-full flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-lg" data-icon="insights">insights</span>
                <h2 className="text-caption font-caption text-outline uppercase tracking-widest font-bold">Improvement & Insights</h2>
                <div className="flex-1 h-px bg-outline-variant/30" />
              </div>
{/* CARD 2: Class Attendance & Study Intensity Heatmap (7 cols) */}
            <div className="lg:col-span-7 p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 pastel-card-shadow flex flex-col justify-between">
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-secondary text-xl" data-icon="calendar_month">
                        calendar_month
                      </span>
                      <h3 className="text-lg text-on-surface font-bold">Class Attendance &amp; Study Intensity</h3>
                    </div>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      Continuous visual tracking across subjects and study intervals
                    </p>
                  </div>
                  <div className="flex items-center bg-surface-container-low p-1 rounded-xl border border-outline-variant/30 self-start sm:self-auto">
                    <button className="px-3 py-1 rounded-lg text-xs bg-surface-container-lowest text-secondary font-bold shadow-sm">
                      Last 30 Days
                    </button>
                    <button className="px-3 py-1 rounded-lg text-xs text-on-surface-variant hover:text-on-surface">
                      Current Semester
                    </button>
                  </div>
                </div>

                {/* Heatmap Grid Matrix — fully responsive, no horizontal scroll */}
                <div className="w-full max-w-full">
                  <div className="flex text-xs text-outline mb-2 pl-9 justify-between pr-2">
                    <span>Week 1</span>
                    <span>Week 2</span>
                    <span>Week 3</span>
                    <span>Week 4</span>
                    <span>Week 5</span>
                    <span>Current</span>
                  </div>
                  <div className="flex gap-2 w-full max-w-full">
                    <div className="flex flex-col justify-between text-xs text-outline pr-2 py-0.5 shrink-0">
                      <span>Mon</span>
                      <span>Tue</span>
                      <span>Wed</span>
                      <span>Thu</span>
                      <span>Fri</span>
                      <span>Sat</span>
                      <span>Sun</span>
                    </div>
                    <div className="flex-1 min-w-0 grid grid-cols-6 gap-2 w-full">
                        {/* Week 1 */}
                        <div className="flex flex-col gap-2 min-w-0">
                          <div className="h-6 rounded-md bg-[#EBF2FF] hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Mon: 2.1 hrs"></div>
                          <div className="h-6 rounded-md bg-[#A0C4FF] hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Tue: 3.5 hrs, 2 classes"></div>
                          <div className="h-6 rounded-md bg-[#6BA4FF] hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Wed: 4.8 hrs, 3 classes"></div>
                          <div className="h-6 rounded-md bg-[#9D8DF1] hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Thu: 5.2 hrs, 4 classes"></div>
                          <div className="h-6 rounded-md bg-[#C8B6FF] hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Fri: 3.0 hrs, 2 classes"></div>
                          <div className="h-6 rounded-md bg-[#EBF2FF] hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Sat: 1.5 hrs"></div>
                          <div className="h-6 rounded-md bg-surface-container-low hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Sun: Rest Day"></div>
                        </div>
                        {/* Week 2 */}
                        <div className="flex flex-col gap-2">
                          <div className="h-6 rounded-md bg-[#A0C4FF] hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Mon: 3.2 hrs"></div>
                          <div className="h-6 rounded-md bg-[#6BA4FF] hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Tue: 4.0 hrs"></div>
                          <div className="h-6 rounded-md bg-[#9D8DF1] hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Wed: 5.1 hrs"></div>
                          <div className="h-6 rounded-md bg-secondary hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Thu: 6.0 hrs"></div>
                          <div className="h-6 rounded-md bg-[#C8B6FF] hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Fri: 4.2 hrs"></div>
                          <div className="h-6 rounded-md bg-[#A0C4FF] hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Sat: 2.5 hrs"></div>
                          <div className="h-6 rounded-md bg-[#EBF2FF] hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Sun: 1.0 hrs"></div>
                        </div>
                        {/* Week 3 */}
                        <div className="flex flex-col gap-2">
                          <div className="h-6 rounded-md bg-[#6BA4FF] hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Mon: 4.1 hrs"></div>
                          <div className="h-6 rounded-md bg-[#9D8DF1] hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Tue: 4.5 hrs"></div>
                          <div className="h-6 rounded-md bg-[#A0C4FF] hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Wed: 3.0 hrs"></div>
                          <div className="h-6 rounded-md bg-secondary hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Thu: 5.8 hrs"></div>
                          <div className="h-6 rounded-md bg-[#C8B6FF] hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Fri: 2.8 hrs"></div>
                          <div className="h-6 rounded-md bg-[#A0C4FF] hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Sat: 3.0 hrs"></div>
                          <div className="h-6 rounded-md bg-surface-container-low hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Sun: Rest Day"></div>
                        </div>
                        {/* Week 4 */}
                        <div className="flex flex-col gap-2">
                          <div className="h-6 rounded-md bg-[#A0C4FF] hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Mon: 3.5 hrs"></div>
                          <div className="h-6 rounded-md bg-[#9D8DF1] hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Tue: 5.0 hrs"></div>
                          <div className="h-6 rounded-md bg-[#6BA4FF] hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Wed: 4.6 hrs"></div>
                          <div className="h-6 rounded-md bg-secondary hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Thu: 6.2 hrs"></div>
                          <div className="h-6 rounded-md bg-[#C8B6FF] hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Fri: 4.0 hrs"></div>
                          <div className="h-6 rounded-md bg-[#EBF2FF] hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Sat: 1.8 hrs"></div>
                          <div className="h-6 rounded-md bg-[#EBF2FF] hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Sun: 2.0 hrs"></div>
                        </div>
                        {/* Week 5 */}
                        <div className="flex flex-col gap-2">
                          <div className="h-6 rounded-md bg-[#6BA4FF] hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Mon: 4.5 hrs"></div>
                          <div className="h-6 rounded-md bg-[#9D8DF1] ring-2 ring-secondary/50 hover:ring-primary cursor-pointer transition-all relative" title="Tue: 4.2 hrs attended">
                            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-secondary"></span>
                          </div>
                          <div className="h-6 rounded-md bg-[#A0C4FF] hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Wed: 3.9 hrs"></div>
                          <div className="h-6 rounded-md bg-secondary hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Thu: 5.5 hrs"></div>
                          <div className="h-6 rounded-md bg-[#C8B6FF] hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Fri: 4.5 hrs"></div>
                          <div className="h-6 rounded-md bg-[#A0C4FF] hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Sat: 2.2 hrs"></div>
                          <div className="h-6 rounded-md bg-[#EBF2FF] hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Sun: 1.5 hrs"></div>
                        </div>
                        {/* Current Week */}
                        <div className="flex flex-col gap-2">
                          <div className="h-6 rounded-md bg-[#6BA4FF] hover:ring-2 hover:ring-primary cursor-pointer transition-all" title="Mon: 4.0 hrs"></div>
                          <div className="h-6 rounded-md bg-primary-container ring-2 ring-primary cursor-pointer transition-all" title="Tue: 4.2 hrs (TODAY)"></div>
                          <div className="h-6 rounded-md bg-surface-container-low border border-dashed border-outline-variant cursor-pointer" title="Wed: Upcoming"></div>
                          <div className="h-6 rounded-md bg-surface-container-low border border-dashed border-outline-variant cursor-pointer" title="Thu: Scheduled"></div>
                          <div className="h-6 rounded-md bg-surface-container-low border border-dashed border-outline-variant cursor-pointer" title="Fri: Scheduled"></div>
                          <div className="h-6 rounded-md bg-surface-container-low border border-dashed border-outline-variant cursor-pointer" title="Sat: Scheduled"></div>
                          <div className="h-6 rounded-md bg-surface-container-low border border-dashed border-outline-variant cursor-pointer" title="Sun: Scheduled"></div>
                        </div>
                      </div>
                    </div>

                    {/* Legend */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-4 mt-2 border-t border-outline-variant/30 text-xs text-on-surface-variant">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-primary" data-icon="info">info</span>
                        <span>Highlighted: <strong>Tuesday: 4.2 hrs study, 2 classes attended</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span>Less active</span>
                        <span className="w-3.5 h-3.5 rounded bg-[#EBF2FF]"></span>
                        <span className="w-3.5 h-3.5 rounded bg-[#A0C4FF]"></span>
                        <span className="w-3.5 h-3.5 rounded bg-[#6BA4FF]"></span>
                        <span className="w-3.5 h-3.5 rounded bg-[#9D8DF1]"></span>
                        <span className="w-3.5 h-3.5 rounded bg-secondary"></span>
                        <span>Highly active</span>
                      </div>
                    </div>
                  </div>
                </div>

              {/* Summary Stats Beneath Heatmap */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-outline-variant/30">
                <div className="p-3 rounded-xl bg-surface-container-low">
                  <span className="text-xs text-on-surface-variant block">Most Productive Day</span>
                  <span className="text-sm font-bold text-on-surface">Thursdays (5.6 hrs avg)</span>
                </div>
                <div className="p-3 rounded-xl bg-surface-container-low">
                  <span className="text-xs text-on-surface-variant block">Peak Study Window</span>
                  <span className="text-sm font-bold text-secondary">2:00 PM – 5:00 PM</span>
                </div>
                <div className="p-3 rounded-xl bg-surface-container-low">
                  <span className="text-xs text-on-surface-variant block">Class Attendance Rate</span>
                  <span className="text-sm font-bold text-primary">96% On-Time Record</span>
                </div>
              </div>
            </div>

          {/* Left: Improvement Board Quick Insights (6 cols) */}
            <div className="lg:col-span-5 p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 pastel-card-shadow space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-xl" data-icon="trending_up">
                    trending_up
                  </span>
                  <h3 className="text-lg text-on-surface font-bold">Improvement Board</h3>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-xs bg-surface-container text-primary font-semibold">
                  AI Multi-Agent Insights
                </span>
              </div>

              {/* Recommended Focus Areas */}
              <div className="space-y-3">
                <span className="text-xs text-outline uppercase tracking-wider block font-semibold">
                  Recommended Focus Areas
                </span>

                {/* Focus Topic 1 */}
                <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30 flex items-center justify-between gap-3 card-hover-fx">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-xs bg-error-container text-on-error-container font-semibold">
                        Priority
                      </span>
                      <h4 className="text-sm font-semibold text-on-surface">Common Denominator &amp; Fraction Addition</h4>
                    </div>
                    <p className="text-xs text-on-surface-variant">Class Heatmap Flag: 4 students trapped on straight addition misconception</p>
                  </div>
                  <button
                    onClick={() => {
                      setPicked("frac-1");
                      setShowQuestModal(true);
                      setInGame(true);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-primary text-on-primary text-xs font-bold shadow-sm hover:opacity-90 active:scale-95 transition-all shrink-0"
                  >
                    Quick Practice
                  </button>
                </div>

                {/* Focus Topic 2 */}
                <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30 flex items-center justify-between gap-3 card-hover-fx">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-xs bg-surface-container-high text-primary font-semibold">
                        Review
                      </span>
                      <h4 className="text-sm font-semibold text-on-surface">Fraction Denominator Size Sense</h4>
                    </div>
                    <p className="text-xs text-on-surface-variant">Swamp trial: Smaller denominator gives larger slices</p>
                  </div>
                  <button
                    onClick={() => {
                      setPicked("frac-2");
                      setShowQuestModal(true);
                      setInGame(true);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-secondary text-on-secondary text-xs font-bold shadow-sm hover:opacity-90 active:scale-95 transition-all shrink-0"
                  >
                    Quick Practice
                  </button>
                </div>
              </div>
            </div>
          </section>
)}

          {/* ==================== SECTION: GOALS & MILESTONES ==================== */}
          {(activeTab === "goals") && (
<section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pb-8">
              <div className="col-span-full flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-lg" data-icon="flag">flag</span>
                <h2 className="text-caption font-caption text-outline uppercase tracking-widest font-bold">Goals & Milestones</h2>
                <div className="flex-1 h-px bg-outline-variant/30" />
              </div>
{/* Right: Student Portfolio & Upcoming Deadlines (6 cols) */}
            <div className="lg:col-span-8 p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 pastel-card-shadow space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary text-xl" data-icon="explore">
                    explore
                  </span>
                  <h3 className="text-lg text-on-surface font-bold">Journey Milestones &amp; Deadlines</h3>
                </div>
                <button
                  onClick={() => setShowQuestModal(true)}
                  className="text-xs text-primary hover:underline font-semibold flex items-center gap-1"
                >
                  <span>Launch Quest Map</span>
                  <span className="material-symbols-outlined text-xs" data-icon="arrow_forward">arrow_forward</span>
                </button>
              </div>

              {/* Milestones List */}
              <div className="space-y-4">
                {/* Milestone Item 1 */}
                <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-xs bg-secondary-fixed text-on-secondary-fixed font-bold">
                          CS Portfolio
                        </span>
                        <span className="text-xs text-error font-bold flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs" data-icon="alarm">alarm</span>
                          3 days left
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-on-surface">Final Project Portfolio Submission</h4>
                    </div>
                    <span className="text-sm font-bold text-primary">85%</span>
                  </div>
                  <div className="w-full bg-surface-container-highest h-2 rounded-full overflow-hidden">
                    <div className="bg-gradient-to-r from-primary-container to-secondary-container h-full rounded-full" style={{ width: "85%" }}></div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-on-surface-variant pt-1">
                    <span>Deliverables: Codebase, Video Demo, Readme</span>
                    <span className="text-secondary font-semibold">Milestone 4 of 5</span>
                  </div>
                </div>

                {/* Milestone Item 2 */}
                <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-xs bg-primary-fixed text-on-primary-fixed font-bold">
                          Calculus BC
                        </span>
                        <span className="text-xs text-primary font-bold flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs" data-icon="event">event</span>
                          Tomorrow 10:00 AM
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-on-surface">Calculus Mock Quiz &amp; Integration Drill</h4>
                    </div>
                    <span className="text-sm font-bold text-secondary">Ready</span>
                  </div>
                  <div className="w-full bg-surface-container-highest h-2 rounded-full overflow-hidden">
                    <div className="bg-secondary-container h-full rounded-full" style={{ width: "100%" }}></div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-on-surface-variant pt-1">
                    <span>Target: Score &gt; 90% for Badge Unlock</span>
                    <span className="text-primary font-semibold">12 practice tests reviewed</span>
                  </div>
                </div>
              </div>

              {/* Mini Certifications & Badges Preview */}
              <div className="flex items-center justify-between pt-2 border-t border-outline-variant/30">
                <span className="text-xs text-on-surface-variant font-medium">Earned Certifications &amp; Badges:</span>
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-surface-container text-primary flex items-center justify-center text-sm font-bold shadow-xs" title="Algorithm Master">
                    <span className="material-symbols-outlined text-sm" data-icon="military_tech" style={{ fontVariationSettings: "'FILL' 1" }}>
                      military_tech
                    </span>
                  </span>
                  <span className="w-7 h-7 rounded-lg bg-secondary-fixed text-secondary flex items-center justify-center text-sm font-bold shadow-xs" title="10-Day Streak">
                    <span className="material-symbols-outlined text-sm" data-icon="hotel_class" style={{ fontVariationSettings: "'FILL' 1" }}>
                      hotel_class
                    </span>
                  </span>
                  <span className="w-7 h-7 rounded-lg bg-tertiary-fixed text-tertiary flex items-center justify-center text-sm font-bold shadow-xs" title="Top Contributor">
                    <span className="material-symbols-outlined text-sm" data-icon="workspace_premium" style={{ fontVariationSettings: "'FILL' 1" }}>
                      workspace_premium
                    </span>
                  </span>
                </div>
              </div>
            </div>

            {/* CARD: Mastered Topics (4 cols) */}
            <div className="lg:col-span-4 p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 pastel-card-shadow flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-xl" data-icon="verified">verified</span>
                  <h3 className="text-lg text-on-surface font-bold">Mastered Topics</h3>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-caption font-caption bg-surface-container text-primary font-bold">
                  5 locked in
                </span>
              </div>

{/* Mastered Topics Pills */}
              <div className="space-y-2">
                <span className="text-xs text-outline uppercase tracking-wider block font-semibold">
                  Recently Mastered Topics
                </span>
                <div className="flex flex-wrap gap-2 pt-1">
                  {["Common Fractions", "Multiplication Peaks", "Equation Balancing", "Recursion", "Photosynthesis"].map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container text-on-primary-container text-xs font-medium border border-outline-variant/20"
                    >
                      <span className="material-symbols-outlined text-sm text-primary" data-icon="check_circle" style={{ fontVariationSettings: "'FILL' 1" }}>
                        check_circle
                      </span>
                      <span>{t}</span>
                    </span>
                  ))}
                </div>
              </div>

              <p className="text-caption font-caption text-on-surface-variant mt-auto pt-4">
                New portions appear here as your teacher uploads them — keep the streak going.
              </p>
            </div>
          </section>
)}
          {activeTab === "quiz" && !showQuestModal && (
            <section className="p-8 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 pastel-card-shadow flex flex-col items-center text-center gap-3">
              <span className="w-14 h-14 rounded-2xl bg-secondary-fixed text-secondary flex items-center justify-center">
                <span className="material-symbols-outlined text-[32px]" data-icon="quiz">quiz</span>
              </span>
              <h2 className="text-title-md font-title-md font-bold text-on-surface">Quick Quiz</h2>
              <p className="text-body-md font-body-md text-on-surface-variant max-w-md">
                Portion-grounded quizzes launch from your quest map. Open the map to start a check generated
                from your teacher&apos;s latest material.
              </p>
              <button
                onClick={() => setShowQuestModal(true)}
                className="mt-1 px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary-container to-secondary-container text-on-primary-container font-label-md text-label-md font-bold shadow-sm hover:opacity-95 active:scale-95 transition-all"
              >
                Open Quest Map
              </button>
            </section>
          )}

          {activeTab === "settings" && (
            <section className="p-8 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 pastel-card-shadow flex flex-col gap-3">
              <h2 className="text-title-md font-title-md font-bold text-on-surface">Settings</h2>
              <p className="text-body-md font-body-md text-on-surface-variant">
                Sound themes, avatar preferences, and notification settings will be configurable here.
              </p>
            </section>
          )}
        </main>
      </div>

      {/* ==================== QUEST & BUBBLE ARCADE MODAL ==================== */}
      {showQuestModal && (
        <div className="fixed inset-0 z-50 bg-on-surface/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest text-on-surface border border-outline-variant/30 rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto p-6 shadow-2xl relative">
            <button
              onClick={() => {
                setShowQuestModal(false);
                setInGame(false);
              }}
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface-variant flex items-center justify-center text-sm font-bold transition-colors"
            >
              ✕
            </button>

            {inGame && pack ? (
              <BubbleArcade pack={pack} onFinish={handleGameFinish} onExit={() => setInGame(false)} />
            ) : (
              <>
                <div className="flex justify-between items-center mb-4 pr-8">
                  <div>
                    <span className="text-xs font-bold text-primary tracking-wider">JUSTFORMI ARENA · MULTI-AGENT TRIAL</span>
                    <h2 className="font-headline-md text-headline-md font-bold text-on-surface mt-1 tracking-tight">Interactive Map &amp; Boss Trial</h2>
                  </div>
                  {pack && (
                    <button
                      onClick={() => setInGame(true)}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-primary-container to-secondary-container text-on-primary-container font-extrabold text-xs shadow-sm hover:opacity-95 active:scale-95 transition-all flex items-center gap-1.5"
                    >
                      <span>🎮 Play Bubble Arcade</span>
                    </button>
                  )}
                </div>

                <p className="text-xs text-on-surface-variant mb-3">
                  Select any open realm to target practice, play the bubble arcade, or challenge the Boss Reasoning Trial!
                </p>

                <MapGrid
                  nodes={nodes}
                  activeId={currentQuiz.lessonId}
                  shakeId={shakeId}
                  popId={popId}
                  onSelect={(id) => {
                    setPicked(id);
                    setFeedback(null);
                  }}
                />

                {/* Boss Reasoning Trial Form */}
                <div className="mt-5 p-4 rounded-xl bg-surface-container-low border border-outline-variant/30">
                  <div className="flex justify-between items-start mb-2 gap-2">
                    {materialQuiz ? (
                      <div className="min-w-0">
                        <span className="inline-flex items-center gap-1 rounded-full bg-tertiary-fixed px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-on-tertiary-fixed">
                          <span className="material-symbols-outlined text-[12px]">history_edu</span>
                          Grounded in: {materialQuiz.citation}
                        </span>
                        <h3 className="font-bold text-base text-on-surface mt-1">{materialQuiz.q}</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-2">
                          {materialQuiz.options.map((o, i) => (
                            <span
                              key={i}
                              className="rounded-lg bg-surface-container-lowest border border-outline-variant/30 px-2.5 py-1.5 text-xs text-on-surface"
                            >
                              <strong className="text-primary">{String.fromCharCode(65 + i)}.</strong> {o}
                            </span>
                          ))}
                        </div>
                        {quizSources.length > 0 && (
                          <p className="text-[10px] text-outline mt-2">
                            Sources: {quizSources.join(" · ")}
                          </p>
                        )}
                      </div>
                    ) : (
                      <h3 className="font-bold text-base text-on-surface">{currentQuiz.prompt}</h3>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => fillPreset("wrong")}
                        className="px-2.5 py-1 rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors"
                      >
                        ⚡ Preset: Wrong
                      </button>
                      <button
                        type="button"
                        onClick={() => fillPreset("correct")}
                        className="px-2.5 py-1 rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors"
                      >
                        ⚡ Preset: Correct
                      </button>
                    </div>
                  </div>

                  <form onSubmit={handleDiagnoseSubmit} className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-on-surface-variant mb-1">Final Answer</label>
                      <input
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        placeholder="e.g. 5/6"
                        required
                        className="w-full px-3 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant/50 text-on-surface text-sm placeholder:text-outline focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary-container/40"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-on-surface-variant mb-1">Reasoning Steps</label>
                      <textarea
                        value={reasoning}
                        onChange={(e) => setReasoning(e.target.value)}
                        placeholder="Explain steps, e.g. I found common denominator 6…"
                        required
                        rows={2}
                        className="w-full px-3 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant/50 text-on-surface text-sm placeholder:text-outline focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary-container/40"
                      />
                    </div>

                    <div className="flex gap-3 items-center pt-1">
                      <button
                        type="submit"
                        disabled={busy}
                        className="px-5 py-2 rounded-xl bg-gradient-to-r from-primary-container to-secondary-container text-on-primary-container font-extrabold text-sm shadow-sm hover:opacity-95 active:scale-95 disabled:opacity-50"
                      >
                        {busy ? "AI Diagnosing Reasoning…" : "Submit Reasoning →"}
                      </button>
                      {pack && (
                        <button
                          type="button"
                          onClick={() => setInGame(true)}
                          className="px-4 py-2 rounded-xl border border-outline-variant/60 text-on-surface text-xs font-bold hover:bg-surface-container transition-colors"
                        >
                          Play Arcade First
                        </button>
                      )}
                      {latency && (
                        <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 font-bold">
                          {latency.cached ? "cached" : "live"} {latency.ms}ms
                        </span>
                      )}
                    </div>
                  </form>

                  {feedback && (
                    <div
                      className={`mt-4 p-3 rounded-xl border ${
                        feedback.correct
                          ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                          : "bg-rose-50 border-rose-200 text-rose-800"
                      }`}
                    >
                      <div className="flex items-center gap-2 font-bold text-sm">
                        <span>{feedback.correct ? "✅ Mastery Confirmed!" : "🔁 Misconception Detected"}</span>
                        <span className="text-xs opacity-75">
                          (Confidence {Math.round(feedback.confidence * 100)}%)
                        </span>
                      </div>
                      <p className="text-sm mt-1">{feedback.feedback_20_words}</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
