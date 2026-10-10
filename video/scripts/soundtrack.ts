#!/usr/bin/env bun
// Sintetiza la banda sonora a partir de src/music.ts y la escribe en public/soundtrack.wav.
// Determinista: misma partitura → mismo archivo, bit a bit.
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {mulberry32} from '../src/engine/util';
import {
  BAR, BEAT, CHORDS, CLAPS, CRASHES, DURATION, KEY_CLICKS, KICKS, SECTIONS,
} from '../src/music';

const SR = 48000;
const N = Math.ceil(DURATION * SR);
const L = new Float32Array(N);
const R = new Float32Array(N);
const rand = mulberry32(7);
const noise = new Float32Array(SR * 2).map(() => rand() * 2 - 1);
const TAU = Math.PI * 2;
const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Suma `fn(dt)` en [t0, t0 + dur) con paneo -1..1. */
function add(t0: number, dur: number, pan: number, fn: (dt: number, i: number) => number) {
  const s0 = Math.max(0, Math.floor(t0 * SR));
  const s1 = Math.min(N, Math.floor((t0 + dur) * SR));
  const gl = Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = Math.sin(((pan + 1) * Math.PI) / 4);
  for (let s = s0; s < s1; s++) {
    const v = fn(s / SR - t0, s - s0);
    L[s]! += v * gl;
    R[s]! += v * gr;
  }
}

// Bombeo tipo sidechain: el pad y el bajo se agachan en cada bombo.
const duck = (t: number) => {
  let last = -Infinity;
  for (const k of KICKS) { if (k <= t) last = k; else break; }
  const d = t - last;
  return d > 0.3 ? 1 : 0.35 + 0.65 * Math.sin((d / 0.3) * (Math.PI / 2));
};

// Pad: tres osciladores desafinados por nota, un acorde por compás.
const padEnd = DURATION;
for (let bar = 0; bar * BAR < padEnd; bar++) {
  const t0 = bar * BAR;
  const chord = CHORDS[bar % CHORDS.length]!;
  const last = (bar + 1) * BAR >= SECTIONS.outro[0];
  const dur = last ? padEnd - t0 : BAR + 0.4;
  chord.forEach((m, n) => {
    const f = midi(m);
    add(t0, dur, n % 2 ? 0.45 : -0.45, (dt) => {
      const env = Math.min(1, dt / 0.25) * (last ? Math.min(1, (padEnd - t0 - dt) / 4) : Math.min(1, (dur - dt) / 0.4));
      const tone = Math.sin(TAU * f * dt) + 0.6 * Math.sin(TAU * f * 1.006 * dt) + 0.6 * Math.sin(TAU * f * 0.994 * dt) + 0.15 * Math.sin(TAU * f * 2 * dt);
      return tone * env * 0.035 * duck(t0 + dt);
    });
  });
}

// Bajo: corcheas con la fundamental, de la terminal al outro.
for (let t = SECTIONS.terminal[0]; t < SECTIONS.outro[0]; t += BEAT / 2) {
  const f = midi(CHORDS[Math.floor(t / BAR) % CHORDS.length]![0]! - 12);
  add(t, 0.24, 0, (dt) => {
    const env = Math.exp(-dt / 0.09) * Math.min(1, dt / 0.004);
    return Math.tanh(2.2 * Math.sin(TAU * f * dt)) * env * 0.16 * duck(t + dt);
  });
}

// Arpegio en semicorcheas durante código y campo.
let step = 0;
for (let t = SECTIONS.code[0]; t < SECTIONS.stats[1]; t += BEAT / 4, step++) {
  const chord = CHORDS[Math.floor(t / BAR) % CHORDS.length]!;
  const f = midi(chord[[0, 1, 2, 3, 2, 1][step % 6]!]! + 12);
  add(t, 0.2, Math.sin(step * 0.7) * 0.6, (dt) => {
    const ph = (f * dt) % 1;
    const tri = 4 * Math.abs(ph - 0.5) - 1;
    return tri * Math.exp(-dt / 0.06) * 0.05;
  });
}

// Bombo: barrido de 150 a 45 Hz (fase integrada) con clic.
for (const t of KICKS) {
  const big = t === SECTIONS.outro[0];
  add(t, big ? 1.4 : 0.45, 0, (dt) => {
    const ph = TAU * (45 * dt + 105 * 0.035 * (1 - Math.exp(-dt / 0.035)));
    const env = Math.exp(-dt / (big ? 0.5 : 0.14));
    return (Math.sin(ph) * env + (dt < 0.003 ? 0.3 : 0)) * 0.55;
  });
}

// Palmas: tres ráfagas de ruido muy seguidas.
for (const t of CLAPS) {
  add(t, 0.25, 0.1, (dt, i) => {
    const burst = [0, 0.011, 0.022].reduce((a, o) => a + (dt >= o ? Math.exp(-(dt - o) / (o < 0.02 ? 0.006 : 0.07)) : 0), 0);
    const n = noise[(i * 3) % noise.length]! - noise[(i * 3 + 1) % noise.length]!;
    return n * burst * 0.09;
  });
}

// Charles a contratiempo.
for (let t = SECTIONS.terminal[0] + BEAT / 2; t < SECTIONS.outro[0]; t += BEAT) {
  add(t, 0.06, 0.35, (dt, i) => {
    const n = noise[(i + 977) % noise.length]! - noise[(i + 978) % noise.length]!;
    return n * Math.exp(-dt / 0.018) * 0.07;
  });
}

// Platillos en los cambios grandes.
for (const t of CRASHES) {
  add(t, 2.2, -0.2, (dt, i) => {
    const n = noise[(i * 7 + 31) % noise.length]! - noise[(i * 7 + 32) % noise.length]!;
    return n * Math.exp(-dt / 0.55) * 0.08;
  });
}

// Subidas de ruido antes de la terminal y antes del drop.
for (const [t0, t1] of [[2, 4], [20, 22]] as const) {
  let lp = 0;
  add(t0, t1 - t0, 0, (dt, i) => {
    const k = dt / (t1 - t0);
    const a = 0.02 + 0.5 * k * k;
    lp += a * (noise[(i * 5) % noise.length]! - lp);
    return lp * k * k * 0.22;
  });
}

// Clics de teclado sincronizados con el texto tecleado.
KEY_CLICKS.forEach((t, k) => {
  add(t, 0.02, ((k * 37) % 9) / 9 - 0.5, (dt, i) => {
    const n = noise[(i + k * 131) % noise.length]!;
    return n * Math.exp(-dt / 0.003) * 0.12;
  });
});

// Master: saturación suave y normalización a -1 dB.
let peak = 0;
for (let s = 0; s < N; s++) {
  L[s] = Math.tanh(L[s]! * 1.2);
  R[s] = Math.tanh(R[s]! * 1.2);
  peak = Math.max(peak, Math.abs(L[s]!), Math.abs(R[s]!));
}
const gain = Math.pow(10, -1 / 20) / peak;

const data = Buffer.alloc(44 + N * 4);
data.write('RIFF', 0);
data.writeUInt32LE(36 + N * 4, 4);
data.write('WAVEfmt ', 8);
data.writeUInt32LE(16, 16);
data.writeUInt16LE(1, 20);
data.writeUInt16LE(2, 22);
data.writeUInt32LE(SR, 24);
data.writeUInt32LE(SR * 4, 28);
data.writeUInt16LE(4, 32);
data.writeUInt16LE(16, 34);
data.write('data', 36);
data.writeUInt32LE(N * 4, 40);
for (let s = 0; s < N; s++) {
  data.writeInt16LE(Math.round(L[s]! * gain * 32767), 44 + s * 4);
  data.writeInt16LE(Math.round(R[s]! * gain * 32767), 46 + s * 4);
}
const out = path.resolve(import.meta.dir, '../public/soundtrack.wav');
mkdirSync(path.dirname(out), {recursive: true});
await Bun.write(out, data);
console.log(`soundtrack → ${path.relative(process.cwd(), out)} (${DURATION}s, ${SR} Hz)`);
