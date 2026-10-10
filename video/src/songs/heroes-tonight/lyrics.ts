// Letra con tiempos por palabra, alineada con Whisper (analysis/align.py → lyrics.json).
import data from './lyrics.json';

export type LineStyle = 'verse' | 'chorus' | 'shout';
export type Word = {w: string; start: number; end: number};
export type Line = {text: string; start: number; end: number; style: LineStyle; words: Word[]};

type Raw = {text: string; estimated: boolean; words: {w: string; start?: number; end?: number}[]};

const styleOf = (text: string): LineStyle =>
  /^night/i.test(text) ? 'shout' : /^we (are|will)/i.test(text) ? 'chorus' : 'verse';

const raw = (data as Raw[]).filter((l) => !l.estimated);

export const LINES: Line[] = raw.map((l, i) => {
  const words = l.words.map((w) => ({w: w.w, start: w.start!, end: w.end!}));
  const next = raw[i + 1]?.words[0]?.start ?? Infinity;
  const last = words[words.length - 1]!;
  // Whisper a veces estira la última palabra varios segundos: la frase se queda como mucho 2 s tras empezarla.
  const end = Math.min(next - 0.05, Math.max(last.end, last.start + 0.6), last.start + 2);
  return {text: l.text, start: words[0]!.start, end, style: styleOf(l.text), words};
});

/** La n-ésima frase que contiene `text` (0 = primera), para sincronizar visuales con la letra. */
export function findLine(text: string, n = 0): Line {
  const hits = LINES.filter((l) => l.text.toLowerCase().includes(text.toLowerCase()));
  const line = hits[n];
  if (!line) throw new Error(`no encuentro la frase "${text}" #${n}`);
  return line;
}

export function findWord(line: Line, w: string): Word {
  const word = line.words.find((x) => x.w.toLowerCase().replace(/[^a-z']/g, '') === w.toLowerCase());
  if (!word) throw new Error(`no encuentro "${w}" en "${line.text}"`);
  return word;
}
