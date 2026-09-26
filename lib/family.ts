"use client";

// ---- Family portal store: approvals, reward bank, prefs, guardians,
// learning params, activity feed. localStorage-backed, student-scoped. ----

export type ApprovalStatus = "pending" | "approved" | "rejected" | "revision";

export interface Approval {
  id: string;
  questTitle: string;
  proof: string;
  points: number;
  status: ApprovalStatus;
  submittedAt: string;
}

export interface Reward {
  id: string;
  label: string;
  cost: number;
  fulfilled: number;
}

export interface FamilyPrefs {
  dailyDigest: boolean;
  weeklyDigest: boolean;
  approvalAlerts: boolean;
  lowActivity: boolean;
}

export type GuardianRole = "Admin" | "Co-Parent" | "Tutor";

export interface Guardian {
  id: string;
  email: string;
  role: GuardianRole;
}

export interface LearningParams {
  difficulty: "Gentle" | "Standard" | "Stretch";
  dailyGoalMin: number;
  screenTimeMin: number;
}

export interface FeedItem {
  id: string;
  kind: "quiz" | "xp" | "ai" | "approval" | "reward";
  text: string;
  detail: string;
  at: string;
}

export interface FamilyState {
  approvals: Approval[];
  rewards: Reward[];
  prefs: FamilyPrefs;
  guardians: Guardian[];
  params: LearningParams;
  feed: FeedItem[];
}

const KEY = "eduquest:family:v1";

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function seed(): FamilyState {
  const now = Date.now();
  const h = 3_600_000;
  return {
    approvals: [
      {
        id: "ap-1",
        questTitle: "Fraction Quest — Common Denominator proof",
        proof: "Solved 1/2 + 1/3 = 5/6 with common-denominator steps written out twice.",
        points: 50,
        status: "pending",
        submittedAt: new Date(now - 2 * h).toISOString(),
      },
      {
        id: "ap-2",
        questTitle: "Bubble Arcade high score run",
        proof: "Screenshot: 1,250 pts on Multiply Peaks with zero misses.",
        points: 30,
        status: "pending",
        submittedAt: new Date(now - 7 * h).toISOString(),
      },
      {
        id: "ap-3",
        questTitle: "Biology sketch — Cell City labels",
        proof: "Hand-drawn cell with nucleus, membrane and wall labeled from memory.",
        points: 40,
        status: "pending",
        submittedAt: new Date(now - 26 * h).toISOString(),
      },
    ],
    rewards: [
      { id: "rw-1", label: "30 mins screen time", cost: 100, fulfilled: 2 },
      { id: "rw-2", label: "Weekend movie pick", cost: 250, fulfilled: 0 },
      { id: "rw-3", label: "New quest avatar skin", cost: 150, fulfilled: 1 },
    ],
    prefs: { dailyDigest: true, weeklyDigest: true, approvalAlerts: true, lowActivity: false },
    guardians: [
      { id: "g-1", email: "priya.sharma@example.com", role: "Admin" },
      { id: "g-2", email: "rahul.sharma@example.com", role: "Co-Parent" },
    ],
    params: { difficulty: "Standard", dailyGoalMin: 30, screenTimeMin: 60 },
    feed: [
      { id: "f-1", kind: "quiz", text: "Boss Trial passed — Common Denominator", detail: "Score 5/6 · reasoning verified", at: new Date(now - 2 * h).toISOString() },
      { id: "f-2", kind: "ai", text: "AI tutor feedback", detail: "“Great common-denominator work — watch straight-across adding.”", at: new Date(now - 3 * h).toISOString() },
      { id: "f-3", kind: "xp", text: "+120 XP earned in Bubble Arcade", detail: "Multiply Peaks · 0 misses", at: new Date(now - 8 * h).toISOString() },
      { id: "f-4", kind: "quiz", text: "Quiz completed — Size Sense Swamp", detail: "Score 4/5 · 1 misconception flagged", at: new Date(now - 26 * h).toISOString() },
      { id: "f-5", kind: "ai", text: "AI tutor feedback", detail: "“Smaller denominator wins when tops match.”", at: new Date(now - 27 * h).toISOString() },
      { id: "f-6", kind: "reward", text: "Reward fulfilled — avatar skin", detail: "150 pts redeemed", at: new Date(now - 3 * 24 * h).toISOString() },
    ],
  };
}

export function loadFamily(): FamilyState {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      const s = seed();
      window.localStorage.setItem(KEY, JSON.stringify(s));
      return s;
    }
    const parsed = JSON.parse(raw) as FamilyState;
    if (!parsed || !Array.isArray(parsed.approvals)) return seed();
    return parsed;
  } catch {
    return seed();
  }
}

export function saveFamily(s: FamilyState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage blocked — session still works
  }
}

export function pushFeed(s: FamilyState, item: Omit<FeedItem, "id" | "at">): FamilyState {
  const entry: FeedItem = { ...item, id: uid("f"), at: new Date().toISOString() };
  return { ...s, feed: [entry, ...s.feed].slice(0, 40) };
}

export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
