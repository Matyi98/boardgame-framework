/**
 * Sound layer (ticket #40) — synthesized via the Web Audio API rather than
 * sourced audio files: there's no asset pipeline in this repo to fetch or
 * license sound effects from, and oscillator-based tones are a standard,
 * zero-dependency way to ship a starter SFX set for a prototype. Swapping
 * any of these for a recorded sample later is a one-line change inside
 * `playSound` — nothing that calls it needs to know the difference.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SoundKind = 'click' | 'recruit' | 'build' | 'attack' | 'capture' | 'roundTick' | 'victory' | 'error';

interface SoundSettings {
  muted: boolean;
  volume: number; // 0-1
  toggleMute: () => void;
  setVolume: (v: number) => void;
}

export const useSoundSettings = create<SoundSettings>()(
  persist(
    (set, get) => ({
      muted: false,
      volume: 0.5,
      toggleMute: () => set({ muted: !get().muted }),
      setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)) }),
    }),
    { name: 'kingdoms-sound-settings' },
  ),
);

let ctx: AudioContext | null = null;
function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  // Browsers start contexts suspended until a user gesture — every call site
  // here is already inside a click handler, so this just unblocks it.
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(
  audio: AudioContext,
  startAt: number,
  freq: number,
  durationSec: number,
  type: OscillatorType,
  peakGain: number,
): void {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(peakGain, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + durationSec);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(startAt);
  osc.stop(startAt + durationSec + 0.02);
}

/** Sequence of [freqHz, durationSec] tones played back-to-back, e.g. an arpeggio. */
function sequence(audio: AudioContext, notes: ReadonlyArray<[number, number]>, type: OscillatorType, peakGain: number): void {
  let t = audio.currentTime;
  for (const [freq, dur] of notes) {
    tone(audio, t, freq, dur, type, peakGain);
    t += dur * 0.85;
  }
}

export function playSound(kind: SoundKind): void {
  const { muted, volume } = useSoundSettings.getState();
  if (muted || volume <= 0) return;
  const audio = getContext();
  if (!audio) return;
  const g = volume * 0.25; // tones are loud relative to typical UI sound — scale down

  switch (kind) {
    case 'click':
      tone(audio, audio.currentTime, 700, 0.06, 'sine', g * 0.6);
      break;
    case 'recruit':
      sequence(audio, [[440, 0.08], [660, 0.1]], 'triangle', g);
      break;
    case 'build':
      tone(audio, audio.currentTime, 160, 0.12, 'square', g * 0.8);
      tone(audio, audio.currentTime + 0.08, 500, 0.05, 'sine', g * 0.5);
      break;
    case 'attack': {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, audio.currentTime);
      osc.frequency.exponentialRampToValueAtTime(90, audio.currentTime + 0.16);
      gain.gain.setValueAtTime(g, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start();
      osc.stop(audio.currentTime + 0.2);
      break;
    }
    case 'capture':
      sequence(audio, [[523, 0.1], [659, 0.1], [784, 0.16]], 'triangle', g);
      break;
    case 'roundTick':
      tone(audio, audio.currentTime, 880, 0.05, 'sine', g * 0.35);
      break;
    case 'victory':
      sequence(audio, [[523, 0.14], [659, 0.14], [784, 0.14], [1047, 0.3]], 'triangle', g * 1.1);
      break;
    case 'error':
      tone(audio, audio.currentTime, 150, 0.18, 'sawtooth', g * 0.7);
      break;
  }
}
