"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { GamePack, GameQuestion } from "@/lib/game-bank";

interface Props {
  pack: GamePack;
  onFinish: (summary: { score: number; hits: number; misses: number; wrongTags: string[] }) => void;
  onExit: () => void;
}

interface Bubble {
  id: number;
  idx: number;
  text: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hue: number;
  popped: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  r: number;
}

// Retro synth audio via Web Audio API (zero external assets)
class SynthAudio {
  private ctx: AudioContext | null = null;
  private init() {
    if (!this.ctx && typeof window !== "undefined") {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
  }
  pop() {
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(520, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.12);
    } catch {}
  }
  hit() {
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(800, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.35, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.18);
    } catch {}
  }
  buzz() {
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(160, this.ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(90, this.ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.28, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.25);
    } catch {}
  }
}

const audio = new SynthAudio();

export default function BubbleArcade({ pack, onFinish, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [lives, setLives] = useState(3);
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [wrongTags, setWrongTags] = useState<string[]>([]);
  const [gameOver, setGameOver] = useState(false);
  const [flash, setFlash] = useState<"good" | "bad" | null>(null);

  const currentQ: GameQuestion | undefined = pack.questions[qIndex];

  const bubblesRef = useRef<Bubble[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const animRef = useRef<number | null>(null);

  // Spawn 4 bubbles for current question
  const spawnBubbles = useCallback((w: number, h: number, q: GameQuestion) => {
    const slots = [
      { x: w * 0.2, y: h * 0.4 },
      { x: w * 0.8, y: h * 0.4 },
      { x: w * 0.32, y: h * 0.72 },
      { x: w * 0.68, y: h * 0.72 },
    ];
    bubblesRef.current = q.options.map((opt, i) => {
      const slot = slots[i] ?? { x: w * 0.5, y: h * 0.5 };
      return {
        id: i,
        idx: i,
        text: opt,
        x: slot.x + (Math.random() - 0.5) * 20,
        y: slot.y + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        r: Math.min(w, h) * 0.12,
        hue: 180 + i * 45,
        popped: false,
      };
    });
  }, []);

  const spawnParticles = (x: number, y: number, color: string, count = 20) => {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = 2 + Math.random() * 4;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 25 + Math.random() * 15,
        color,
        r: 3 + Math.random() * 3,
      });
    }
  };

  // Next question or finish
  const handleAnswer = useCallback((chosenIdx: number) => {
    if (!currentQ || gameOver) return;
    const isRight = chosenIdx === currentQ.answer;

    const b = bubblesRef.current.find((item) => item.idx === chosenIdx);
    const bx = b ? b.x : 200;
    const by = b ? b.y : 200;

    if (isRight) {
      audio.hit();
      spawnParticles(bx, by, "#34d399", 26);
      setScore((s) => s + 100 + combo * 25);
      setCombo((c) => c + 1);
      setHits((h) => h + 1);
      setFlash("good");
    } else {
      audio.buzz();
      spawnParticles(bx, by, "#fb7185", 26);
      setCombo(0);
      setMisses((m) => m + 1);
      setWrongTags((tags) => (tags.includes(currentQ.tag) ? tags : [...tags, currentQ.tag]));
      setFlash("bad");
      setLives((l) => {
        const nextLives = l - 1;
        if (nextLives <= 0) {
          setGameOver(true);
        }
        return nextLives;
      });
    }

    setTimeout(() => setFlash(null), 300);

    // Advance
    setTimeout(() => {
      setQIndex((cur) => {
        const next = cur + 1;
        if (next >= pack.questions.length) {
          setGameOver(true);
          return cur;
        }
        const canvas = canvasRef.current;
        if (canvas) {
          spawnBubbles(canvas.width, canvas.height, pack.questions[next]);
        }
        return next;
      });
    }, 450);
  }, [currentQ, gameOver, combo, pack.questions, spawnBubbles]);

  // Main canvas loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentQ) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Handle responsive sizing
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      spawnBubbles(rect.width, rect.height, currentQ);
    };
    resize();

    let running = true;
    const render = () => {
      if (!running) return;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      ctx.clearRect(0, 0, w, h);

      // Soft arena backdrop wash (light theme)
      ctx.fillStyle = "rgba(107, 164, 255, 0.08)";
      ctx.fillRect(0, 0, w, h);

      // Subtle pulse rings
      const time = Date.now() * 0.002;
      ctx.strokeStyle = "rgba(17, 93, 180, 0.08)";
      ctx.lineWidth = 1;
      for (let r = 60; r < Math.max(w, h); r += 90) {
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, (r + Math.sin(time) * 10) % Math.max(w, h), 0, Math.PI * 2);
        ctx.stroke();
      }

      // Update & draw bubbles
      bubblesRef.current.forEach((b) => {
        b.x += b.vx;
        b.y += b.vy;
        // Soft bounds bounce
        if (b.x - b.r < 10) { b.x = 10 + b.r; b.vx *= -1; }
        if (b.x + b.r > w - 10) { b.x = w - 10 - b.r; b.vx *= -1; }
        if (b.y - b.r < h * 0.22) { b.y = h * 0.22 + b.r; b.vy *= -1; }
        if (b.y + b.r > h - 15) { b.y = h - 15 - b.r; b.vy *= -1; }

        // Glow ring
        const grad = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.1, b.x, b.y, b.r);
        grad.addColorStop(0, `hsla(${b.hue}, 85%, 82%, 0.95)`);
        grad.addColorStop(0.7, `hsla(${b.hue}, 75%, 62%, 0.9)`);
        grad.addColorStop(1, `hsla(${b.hue}, 85%, 50%, 0.95)`);

        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.strokeStyle = `hsla(${b.hue}, 80%, 38%, 0.9)`;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Shimmer highlight
        ctx.beginPath();
        ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
        ctx.fill();

        // Key hint pill
        ctx.fillStyle = "rgba(17, 28, 45, 0.75)";
        ctx.beginPath();
        ctx.arc(b.x, b.y - b.r * 0.55, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 11px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(b.idx + 1), b.x, b.y - b.r * 0.55);

        // Bubble text
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 17px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(b.text, b.x, b.y + 4);
      });

      // Update & draw particles
      particlesRef.current = particlesRef.current.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08; // gravity
        p.life++;
        const alpha = 1 - p.life / p.maxLife;
        if (alpha <= 0) return false;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * alpha, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha;
        ctx.fill();
        ctx.globalAlpha = 1;
        return true;
      });

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => {
      running = false;
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [currentQ, spawnBubbles]);

  // Click on bubble
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !currentQ || gameOver) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    bubblesRef.current.forEach((b) => {
      const dist = Math.hypot(b.x - mx, b.y - my);
      if (dist <= b.r) {
        audio.pop();
        handleAnswer(b.idx);
      }
    });
  };

  // Keyboard 1, 2, 3, 4
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (["1", "2", "3", "4"].includes(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        audio.pop();
        handleAnswer(idx);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleAnswer]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-4 shadow-xl">
      {/* Top Arcade HUD */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingBottom: 12,
          borderBottom: "1px solid rgba(194, 198, 212, 0.4)",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div>
          <span style={{ fontSize: 11, fontWeight: 800, color: "var(--color-primary)", letterSpacing: 1 }}>
            ARCADE BATTLE · {pack.title.toUpperCase()}
          </span>
          <div style={{ fontSize: 13, color: "var(--color-on-surface-variant)", marginTop: 2 }}>
            Round {qIndex + 1} / {pack.questions.length}
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--color-on-surface)" }}>
            SCORE <span style={{ color: "var(--color-secondary)", fontSize: 18 }}>{score}</span>
          </div>
          {combo > 1 && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 900,
                color: "var(--color-secondary)",
                padding: "2px 8px",
                borderRadius: 999,
                background: "var(--color-secondary-fixed)",
              }}
            >
              {combo}x COMBO!
            </span>
          )}
          <div style={{ letterSpacing: 3, fontSize: 16, color: "var(--color-error)" }}>
            {"♥".repeat(Math.max(0, lives))}
            <span style={{ opacity: 0.25 }}>{"♥".repeat(Math.max(0, 3 - lives))}</span>
          </div>
        </div>
      </div>

      {/* Target Question Display */}
      {currentQ && !gameOver && (
        <div
          style={{
            margin: "14px 0 8px",
            textAlign: "center",
            padding: "12px 16px",
            borderRadius: 14,
            background: "var(--color-surface-container-low)",
            border: "1px solid rgba(194, 198, 212, 0.45)",
          }}
        >
          <span style={{ fontSize: 12, color: "var(--color-on-surface-variant)", textTransform: "uppercase", letterSpacing: 1 }}>
            Pop the correct bubble (click or keys 1-4)
          </span>
          <div style={{ fontSize: 24, fontWeight: 900, color: "var(--color-on-surface)", marginTop: 4 }}>
            {currentQ.q}
          </div>
        </div>
      )}

      {/* Interactive Arcade Canvas */}
      <div style={{ position: "relative" }}>
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          style={{
            width: "100%",
            height: 380,
            display: "block",
            borderRadius: 14,
            background: "radial-gradient(ellipse at center, #f4f7ff, #e9eefc)",
            cursor: "crosshair",
            border: flash === "good" ? "2px solid #34d399" : flash === "bad" ? "2px solid #fb7185" : "1px solid rgba(194, 198, 212, 0.6)",
            transition: "border 0.2s ease",
          }}
        />

        {/* Game Over / Victory Overlay */}
        {gameOver && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(249, 249, 255, 0.94)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              borderRadius: 14,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
              textAlign: "center",
            }}
          >
            <span style={{ fontSize: 44 }}>{lives > 0 ? "🏆" : "💥"}</span>
            <h2 style={{ fontSize: 26, margin: "8px 0 4px", fontWeight: 900, color: "var(--color-on-surface)" }}>
              {lives > 0 ? "Stage Cleared!" : "Run Exhausted!"}
            </h2>
            <p className="max-w-[360px] text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
              {lives > 0
                ? "Excellent reflexes! Now challenge the Boss Trial to seal node mastery."
                : "Defenses breached. Analyze the logic below to unlock next attempt."}
            </p>

            <div style={{ display: "flex", gap: 14, margin: "16px 0" }}>
              <div className="rounded-xl bg-surface-container-low px-4 py-2">
                <strong style={{ color: "var(--color-on-surface)" }}>{score}</strong>
                <small style={{ display: "block", color: "var(--color-on-surface-variant)" }}>pts</small>
              </div>
              <div className="rounded-xl bg-surface-container-low px-4 py-2">
                <strong style={{ color: "#059669" }}>{hits}</strong>
                <small style={{ display: "block", color: "var(--color-on-surface-variant)" }}>hits</small>
              </div>
              <div className="rounded-xl bg-surface-container-low px-4 py-2">
                <strong style={{ color: "#e11d48" }}>{misses}</strong>
                <small style={{ display: "block", color: "var(--color-on-surface-variant)" }}>misses</small>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="rounded-xl bg-gradient-to-r from-primary-container to-secondary-container px-5 py-2 font-extrabold text-on-primary-container shadow-sm transition-all hover:opacity-95 active:scale-95"
                onClick={() => onFinish({ score, hits, misses, wrongTags })}
              >
                Proceed to Boss Reasoning Trial →
              </button>
              <button className="rounded-xl border border-outline-variant/60 px-5 py-2 font-bold text-on-surface transition-colors hover:bg-surface-container-low" onClick={onExit}>
                Map
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 12, color: "var(--color-on-surface-variant)" }}>
        <span>Tip: Press keyboard 1, 2, 3, or 4 to pop instantly</span>
        <button
          onClick={onExit}
          style={{ background: "none", border: "none", color: "var(--color-primary)", cursor: "pointer", textDecoration: "underline" }}
        >
          Exit to map
        </button>
      </div>
    </div>
  );
}
