"use client";

import { useSyncExternalStore } from "react";

export type AmbientMode = "lofi" | "rain" | "library";

export interface AmbientState {
  mode: AmbientMode;
  playing: boolean;
}

export const AMBIENT_LABEL: Record<AmbientMode, string> = {
  lofi: "Lo-Fi",
  rain: "Gentle Rain",
  library: "Library",
};

// ---- Royalty-free by construction: every texture is synthesized live
// with the Web Audio API. No streams, no downloads, works offline. ----
let ctx: AudioContext | null = null;
let nodes: AudioNode[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let state: AmbientState = { mode: "lofi", playing: false };

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}

function ac(): AudioContext {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function noiseBuffer(c: AudioContext, brown = false): AudioBuffer {
  const len = c.sampleRate * 3;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2;
    } else {
      d[i] = w;
    }
  }
  return buf;
}

function loopNoise(c: AudioContext, brown: boolean, filterType: BiquadFilterType, freq: number, gain: number): AudioBufferSourceNode {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, brown);
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = filterType;
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f);
  f.connect(g);
  g.connect(c.destination);
  src.start();
  nodes.push(src, f, g);
  return src;
}

// Lo-fi chord stroll: Fmaj7 → Em7 → Dm7 → Cmaj7, one voicing per bar.
const CHORDS: number[][] = [
  [174.61, 220.0, 261.63, 329.63],
  [164.81, 196.0, 246.94, 293.66],
  [146.83, 174.61, 220.0, 261.63],
  [130.81, 164.81, 196.0, 246.94],
];

function startLofi(c: AudioContext) {
  const master = c.createGain();
  master.gain.value = 0.0;
  master.connect(c.destination);
  master.gain.linearRampToValueAtTime(0.5, c.currentTime + 2);
  nodes.push(master);

  const padFilter = c.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 900;
  padFilter.connect(master);
  nodes.push(padFilter);

  let bar = 0;
  const playBar = () => {
    const t = c.currentTime;
    for (const f of CHORDS[bar % CHORDS.length]) {
      const o = c.createOscillator();
      o.type = "triangle";
      o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.002);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.8);
      g.gain.linearRampToValueAtTime(0.0, t + 3.9);
      o.connect(g);
      g.connect(padFilter);
      o.start(t);
      o.stop(t + 4.1);
    }
    bar += 1;
  };
  playBar();
  timer = setInterval(playBar, 4000);

  // Vinyl crackle: sparse filtered impulses.
  const crackle = () => {
    if (!state.playing || state.mode !== "lofi") return;
    const t = c.currentTime;
    for (let i = 0; i < 6; i++) {
      const o = c.createBufferSource();
      o.buffer = noiseBuffer(c);
      const bp = c.createBiquadFilter();
      bp.type = "highpass";
      bp.frequency.value = 4000;
      const g = c.createGain();
      const at = t + Math.random() * 4;
      g.gain.setValueAtTime(0.015 + Math.random() * 0.02, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);
      o.connect(bp);
      bp.connect(g);
      g.connect(master);
      o.start(at);
      o.stop(at + 0.05);
    }
  };
  const crackleTimer = setInterval(crackle, 4000);
  nodes.push({ disconnect: () => clearInterval(crackleTimer) } as unknown as AudioNode);
}

function teardown() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  for (const n of nodes) {
    try {
      if (n instanceof AudioBufferSourceNode) n.stop();
      n.disconnect();
    } catch {
      // already stopped
    }
  }
  nodes = [];
}

export function playAmbient(mode: AmbientMode) {
  if (typeof window === "undefined") return;
  teardown();
  const c = ac();
  state = { mode, playing: true };
  if (mode === "rain") {
    loopNoise(c, false, "lowpass", 1400, 0.16);
    loopNoise(c, false, "bandpass", 4500, 0.035);
  } else if (mode === "library") {
    loopNoise(c, true, "lowpass", 420, 0.22);
    const hum = c.createOscillator();
    hum.type = "sine";
    hum.frequency.value = 55;
    const g = c.createGain();
    g.gain.value = 0.012;
    hum.connect(g);
    g.connect(c.destination);
    hum.start();
    nodes.push(hum, g);
  } else {
    startLofi(c);
  }
  emit();
}

export function stopAmbient() {
  teardown();
  state = { ...state, playing: false };
  emit();
}

export function toggleAmbient(mode: AmbientMode) {
  if (state.playing && state.mode === mode) stopAmbient();
  else playAmbient(mode);
}

function snapshot(): AmbientState {
  return state;
}

export function useAmbient(): AmbientState & {
  play: (m: AmbientMode) => void;
  stop: () => void;
  toggle: (m: AmbientMode) => void;
} {
  const s = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    snapshot,
    snapshot,
  );
  return { ...s, play: playAmbient, stop: stopAmbient, toggle: toggleAmbient };
}
