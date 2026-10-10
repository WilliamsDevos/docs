// Ritmo de "Heroes Tonight" a partir del análisis del audio (analysis/analyze.py → audio.json).
import type {Audio, Rhythm} from '../../engine/project';
import {hit} from '../../engine/util';
import data from './audio.json';

export const DURATION = data.duration;
export const BEAT = data.beatPeriod;
export const BAR = BEAT * 4;
/** Instante del compás `i` (puede ser fraccionario). */
export const bar = (i: number) => data.downbeats[0]! + i * BAR;
export const barAt = (t: number) => (t - data.downbeats[0]!) / BAR;

// Secciones en compases (de 8 en 8 a partir del compás 4), confirmadas con los tiempos de la voz.
export const SECTIONS = {
  intro: [0, 4],
  verse1: [4, 12],
  pre1: [12, 20],
  chorus1: [20, 28],
  build1: [28, 36], // el estribillo se repite mientras sube el bajo
  drop1: [36, 44],
  verse2: [44, 52], // "dynamite", sobre el beat
  pre2: [52, 60],
  chorus2: [60, 76],
  build2: [76, 84],
  drop2: [84, 100], // instrumental y luego el último estribillo
  outro: [100, 108],
} as const;
export type Section = keyof typeof SECTIONS;
export const sectionTime = (s: Section): [number, number] => [bar(SECTIONS[s][0]), bar(SECTIONS[s][1])];

const env = data.env as unknown as Record<keyof Audio, number[]>;
const sample = (arr: number[], t: number) => {
  const x = Math.max(0, t * data.envRate);
  const i = Math.floor(x);
  const a = arr[Math.min(i, arr.length - 1)] ?? 0;
  const b = arr[Math.min(i + 1, arr.length - 1)] ?? 0;
  return a + (b - a) * (x - i);
};

// Los bombos detectados solo cuentan donde hay graves de verdad (fuera de los breaks).
export const KICKS = data.events.kick.filter((t) => sample(env.low, t + 0.03) > 0.35);
export const SNARES = data.events.snare.filter((t) => sample(env.rms, t) > 0.45);

export const rhythm: Rhythm = {
  beat: (t) => (t - data.firstBeat) / BEAT,
  kick: (t) => hit(KICKS, t, 0.1),
  clap: (t) => hit(SNARES, t, 0.06),
  audio: (t) => ({
    rms: sample(env.rms, t),
    low: sample(env.low, t),
    mid: sample(env.mid, t),
    high: sample(env.high, t),
    vocal: sample(env.vocal, t),
  }),
};
