// La partitura. La comparten el sintetizador (scripts/soundtrack.ts) y las escenas,
// así que cada golpe visual cae exactamente sobre su golpe de audio.

export const BPM = 120;
export const BEAT = 60 / BPM; // 0.5 s
export const BAR = BEAT * 4; // 2 s
export const DURATION = 40;

// Secciones (en segundos), alineadas a compases.
export const SECTIONS = {
  intro: [0, 4],
  terminal: [4, 14],
  code: [14, 22],
  field: [22, 30],
  stats: [30, 34],
  outro: [34, 40],
} as const;

/** Golpes de bombo: frases sueltas en la intro, a negras después, silencio en el outro. */
export const KICKS: number[] = (() => {
  const k = [0, 1, 2, 3, 3.5, 3.75];
  for (let t = 4; t < SECTIONS.outro[0]; t += BEAT) k.push(t);
  k.push(SECTIONS.outro[0]);
  return k;
})();

/** Palmas en los tiempos 2 y 4 desde la sección de código. */
export const CLAPS: number[] = (() => {
  const c: number[] = [];
  for (let t = SECTIONS.code[0] + BEAT; t < SECTIONS.outro[0]; t += BEAT * 2) c.push(t);
  return c;
})();

/** Platillo en los cambios grandes. */
export const CRASHES = [SECTIONS.terminal[0], SECTIONS.field[0], SECTIONS.outro[0]];

// Progresión: Am – F – C – G, un acorde por compás (notas MIDI).
export const CHORDS = [
  [57, 60, 64, 69],
  [53, 57, 60, 65],
  [48, 55, 60, 64],
  [55, 59, 62, 67],
];
export const chordAt = (t: number) => CHORDS[Math.floor(t / BAR) % CHORDS.length]!;

// Texto que se teclea en la terminal; los clics de teclado salen de aquí.
export const PROMPT =
  'Crea un video de 40 segundos que explique cómo se hacen videos con código.';
export const TYPE_START = 4.75;
export const TYPE_CPS = 26; // caracteres por segundo
export const TYPE_END = TYPE_START + PROMPT.length / TYPE_CPS;
export const typedAt = (t: number) =>
  PROMPT.slice(0, Math.max(0, Math.min(PROMPT.length, Math.floor((t - TYPE_START) * TYPE_CPS))));
export const KEY_CLICKS: number[] = Array.from(
  {length: PROMPT.length},
  (_, i) => TYPE_START + i / TYPE_CPS,
).filter((_, i) => PROMPT[i] !== ' ');

/** Envolvente 0..1 que decae tras el último evento anterior a `t`. */
export function hit(events: number[], t: number, halfLife = 0.12) {
  let last = -Infinity;
  for (const e of events) {
    if (e <= t) last = e;
    else break;
  }
  return last === -Infinity ? 0 : Math.pow(0.5, (t - last) / halfLife);
}

export const beatAt = (t: number) => t / BEAT;
