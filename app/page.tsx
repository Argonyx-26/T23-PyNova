import Image from "next/image";
import Link from "next/link";

const portals = [
  {
    href: "/student",
    title: "Student Arcade Portal",
    icon: "sports_esports",
    accent: "text-primary",
    bg: "bg-primary-fixed",
    border: "border-l-primary-container",
    desc: "Playable Canvas Bubble Arcade with sound synth, node-unlocking quest map, and Boss Reasoning Trials evaluated by Gemini.",
    pill: "Interactive Game",
    pillCls: "bg-primary-fixed text-on-primary-fixed",
  },
  {
    href: "/teacher",
    title: "Teacher Command Deck",
    icon: "monitoring",
    accent: "text-secondary",
    bg: "bg-secondary-fixed",
    border: "border-l-secondary-container",
    desc: "Live class-wide misconception heatmap, real-time struggling roster, per-student attempt drill-down, and class broadcast nudges.",
    pill: "Live SSE Stream",
    pillCls: "bg-secondary-fixed text-on-secondary-fixed",
  },
  {
    href: "/parent",
    title: "Parent Progress & Cost Audit",
    icon: "family_restroom",
    accent: "text-tertiary",
    bg: "bg-tertiary-fixed",
    border: "border-l-tertiary-container",
    desc: "Parental transparency portal with printable report, student mastery breakdown, and competitive 90% cost savings justification.",
    pill: "Family Portal",
    pillCls: "bg-tertiary-fixed text-on-tertiary-fixed",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-surface font-body-md text-on-surface antialiased">
      <main className="mx-auto max-w-3xl px-space-lg py-space-xl">
        <div className="mb-1 flex items-center gap-3">
          <Image src="/logo.jpg" alt="JustFormi" width={160} height={160} priority className="h-14 w-auto object-contain" />
        </div>
        <p className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">
          JustFormi · Hackathon Demo Spec
        </p>
        <h1 className="mt-1 font-headline-xl text-headline-xl tracking-tight text-on-surface">
          JustFormi Multi-Agent Hub
        </h1>
        <p className="mt-2 max-w-2xl font-body-lg text-body-lg text-on-surface-variant">
          Deterministic world engine + playable video games + single-call Gemini reasoning diagnostic. Separated
          operational portals for Student, Teacher, and Parent.
        </p>

        {/* Metrics Row */}
        <div className="mt-space-lg grid grid-cols-2 gap-space-sm md:grid-cols-4">
          {[
            { v: "1 Call", l: "per diagnosis", c: "text-primary" },
            { v: "$0.001", l: "cost/student", c: "text-secondary" },
            { v: "<1s", l: "live heatmap SSE", c: "text-tertiary" },
            { v: "3 Roles", l: "isolated portals", c: "text-on-surface" },
          ].map((s) => (
            <div
              key={s.l}
              className="rounded-xl bg-surface-container-lowest p-space-md text-center shadow-sm transition-shadow hover:shadow-md"
            >
              <strong className={`block font-headline-md text-headline-md ${s.c}`}>{s.v}</strong>
              <small className="font-label-sm text-label-sm text-on-surface-variant">{s.l}</small>
            </div>
          ))}
        </div>

        {/* Distinct Portal Launchers */}
        <h2 className="mt-space-xl mb-space-sm font-headline-md text-headline-md text-on-surface">
          Select portal realm
        </h2>
        <div className="flex flex-col gap-space-sm">
          {portals.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className={`rounded-xl border-l-4 bg-surface-container-lowest p-space-md shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${p.border}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${p.bg} ${p.accent}`}
                  >
                    <span className="material-symbols-outlined text-[22px]">{p.icon}</span>
                  </span>
                  <b className={`font-headline-sm text-headline-sm ${p.accent}`}>{p.title}</b>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 font-label-sm text-label-sm font-bold ${p.pillCls}`}
                >
                  {p.pill}
                </span>
              </div>
              <span className="mt-1.5 block font-body-sm text-body-sm text-on-surface-variant">{p.desc}</span>
            </Link>
          ))}
        </div>

        {/* Judge Pitch & Demo Guide */}
        <section className="mt-space-lg rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
          <h2 className="mb-2 font-headline-sm text-headline-sm text-on-surface">60-second hackathon winning flow</h2>
          <ol className="list-decimal space-y-1.5 pl-5 font-body-md text-body-md leading-relaxed text-on-surface-variant marker:font-semibold marker:text-primary">
            <li>
              <strong className="text-on-surface">Teacher Command Deck:</strong> Click <em>Reset demo</em> to simulate
              6 students with a <code className="rounded bg-error-container px-1 font-label-sm text-on-error-container">frac-add</code>{" "}
              misconception spike. Notice cell glowing red.
            </li>
            <li>
              <strong className="text-on-surface">Student Arcade:</strong> Launch <em>Bubble Arcade</em> to play the
              interactive bubble pop game with audio fx. Then enter the Boss Trial with <code className="rounded bg-surface-container px-1 font-label-sm">2/5</code>{" "}
              and reasoning <em>add top bottom straight</em>.
            </li>
            <li>
              <strong className="text-on-surface">Multi-Agent Reaction:</strong> Map shakes, holding XP. Instantly in
              the Teacher Portal, red heat ticks to 5✕ without refreshing (sub-second SSE!).
            </li>
            <li>
              <strong className="text-on-surface">Retry &amp; Mastery:</strong> Student provides common denominator
              steps. Node locks green (mastered), next realm unlocks!
            </li>
            <li>
              <strong className="text-on-surface">Parent Audit:</strong> Open the Parent Portal to inspect verified
              mastery progress and the printable report.
            </li>
          </ol>
        </section>
      </main>
    </div>
  );
}
