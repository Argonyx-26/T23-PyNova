import type { MapNode } from "@/lib/types";

interface Props {
  nodes: MapNode[];
  activeId: string | null;
  shakeId: string | null;
  popId?: string | null;
  onSelect?: (lessonId: string) => void;
}

const ICON: Record<MapNode["status"], string> = {
  mastered: "check_circle",
  open: "play_arrow",
  locked: "lock",
};

export default function MapGrid({ nodes, activeId, shakeId, popId, onSelect }: Props) {
  const sorted = [...nodes].sort((a, b) => a.y - b.y || a.x - b.x);
  return (
    <div
      className="grid grid-cols-2 gap-2.5 sm:grid-cols-3"
      role="list"
      aria-label="Game map"
    >
      {sorted.map((n) => {
        const clickable = Boolean(onSelect) && n.status !== "locked";
        const tileCls = [
          "relative flex flex-col items-start gap-1 rounded-xl border p-3 text-left font-label-md text-label-md transition-all",
          n.status === "mastered"
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : n.status === "open"
              ? "border-primary/40 bg-gradient-to-br from-primary-container to-secondary-container text-on-primary-container shadow-sm"
              : "border-outline-variant/30 bg-surface-container-low text-on-surface-variant opacity-60",
          activeId === n.lessonId ? "outline-2 outline-offset-2 outline-primary" : "",
          shakeId === n.lessonId ? "animate-[eqshake_0.32s_ease_2] border-error" : "",
          popId === n.lessonId ? "animate-[eqpop_0.45s_ease]" : "",
          clickable ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md" : "cursor-default",
        ]
          .filter(Boolean)
          .join(" ");
        const iconCls = [
          "material-symbols-outlined text-[20px]",
          n.status === "mastered"
            ? "text-emerald-600"
            : n.status === "open"
              ? "text-on-primary-container"
              : "text-outline",
        ].join(" ");
        return (
          <div
            key={n.lessonId}
            role={clickable ? "button" : "listitem"}
            tabIndex={clickable ? 0 : undefined}
            data-lesson={n.lessonId}
            title={`${n.title} (${n.status})${clickable ? " — select to practice" : ""}`}
            className={tileCls}
            onClick={clickable ? () => onSelect?.(n.lessonId) : undefined}
            onKeyDown={
              clickable
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect?.(n.lessonId);
                    }
                  }
                : undefined
            }
          >
            <span className={iconCls} aria-hidden>
              {ICON[n.status]}
            </span>
            <span className="leading-tight">{n.title}</span>
            <span
              className={`font-label-sm text-label-sm uppercase tracking-wider ${
                n.status === "mastered"
                  ? "text-emerald-700"
                  : n.status === "open"
                    ? "text-on-primary-container/80"
                    : "text-outline"
              }`}
            >
              {n.status}
            </span>
          </div>
        );
      })}
    </div>
  );
}
