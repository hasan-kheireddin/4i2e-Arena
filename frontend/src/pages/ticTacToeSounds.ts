import { getAudioCtx } from '../assets/emotes/sound';

/**
 * Small synthesised cues for the tic-tac-toe board.
 *
 * Synthesised rather than sampled so there is nothing to download and nothing
 * to keep in sync with the theme: every cue is a couple of oscillators with an
 * envelope. Each entry point is fire-and-forget and swallows its own errors —
 * audio is a nicety here and must never break a move.
 */

interface ToneSpec {
  freq: number;
  /** Seconds from now. */
  at?: number;
  duration?: number;
  peak?: number;
  type?: OscillatorType;
  /** Slide to this frequency across the tone, for a chirp. */
  glideTo?: number;
}

function tone(ctx: AudioContext, spec: ToneSpec): void {
  const {
    freq, at = 0, duration = 0.12, peak = 0.16, type = 'sine', glideTo,
  } = spec;
  const start = ctx.currentTime + at;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (glideTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(glideTo, start + duration);
  }

  // A tiny attack keeps the transient from clicking; the tail decays to near
  // silence because exponential ramps cannot reach zero.
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function play(specs: ToneSpec[]): void {
  try {
    const ctx = getAudioCtx();
    for (const spec of specs) tone(ctx, spec);
  } catch {
    // Audio unavailable or blocked — the game plays on regardless.
  }
}

/** Your own mark landing: one short, bright tick. */
export function playPlaceSound(): void {
  play([{ freq: 880, glideTo: 1320, duration: 0.09, peak: 0.14, type: 'triangle' }]);
}

/** The other player's mark landing, which is also the cue that you are up. */
export function playTurnSound(): void {
  play([
    { freq: 523.25, duration: 0.1, peak: 0.11 },
    { freq: 783.99, at: 0.09, duration: 0.16, peak: 0.13 },
  ]);
}

/** Local play alternates on one screen, so the two seats get distinct ticks. */
export function playLocalPlaceSound(symbol: 'X' | 'O'): void {
  const base = symbol === 'X' ? 740 : 587.33;
  play([{ freq: base, glideTo: base * 1.5, duration: 0.09, peak: 0.14, type: 'triangle' }]);
}

export function playResultSound(kind: 'win' | 'lose' | 'draw'): void {
  if (kind === 'win') {
    // Rising major triad into the octave.
    play([
      { freq: 523.25, duration: 0.16, peak: 0.15 },
      { freq: 659.25, at: 0.11, duration: 0.16, peak: 0.15 },
      { freq: 783.99, at: 0.22, duration: 0.2, peak: 0.16 },
      { freq: 1046.5, at: 0.34, duration: 0.34, peak: 0.17 },
    ]);
    return;
  }
  if (kind === 'lose') {
    play([
      { freq: 440, duration: 0.18, peak: 0.13, type: 'triangle' },
      { freq: 349.23, at: 0.14, duration: 0.22, peak: 0.13, type: 'triangle' },
      { freq: 261.63, at: 0.3, duration: 0.4, peak: 0.14, type: 'triangle' },
    ]);
    return;
  }
  // Draw: two flat notes, neither settling anywhere.
  play([
    { freq: 493.88, duration: 0.2, peak: 0.12 },
    { freq: 493.88, at: 0.19, duration: 0.28, peak: 0.11 },
  ]);
}
