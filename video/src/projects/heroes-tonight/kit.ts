// Sistema tipográfico de "Heroes Tonight": tinta y papel, un solo color de señal (rojo capa)
// y una cinta roja que recorre todo el video.
import type * as THREE from 'three';
import {Layer2D} from '../../engine/gl';
import type {PostParams} from '../../engine/post';
import {Scene} from '../../engine/scene';
import {clamp, hash, spring} from '../../engine/util';
import type {Line, Word} from '../../songs/heroes-tonight/lyrics';

export const C = {
  ink: '#0B0B0C',
  ink2: '#17171A',
  graphite: '#5C5955',
  ash: '#9A958D',
  paper: '#ECE7DC',
  signal: '#FF3B2F', // la cinta: lo único que brilla
  ember: '#FF8A6A',
};

export const ARCHIVO = '"Archivo Variable"';
export const MONO = '"JetBrains Mono"';
export const SERIF = '"Instrument Serif"';

// El eje de anchura de Archivo (62–125 %) se elige en Canvas con las palabras clave de font-stretch.
const STRETCH: [number, string][] = [
  [62.5, 'extra-condensed'],
  [75, 'condensed'],
  [87.5, 'semi-condensed'],
  [100, 'normal'],
  [112.5, 'semi-expanded'],
  [125, 'expanded'],
];
export const stretchOf = (width: number) =>
  STRETCH.reduce((best, s) => (Math.abs(s[0] - width) < Math.abs(best[0] - width) ? s : best))[1];

export type TypeOpts = {weight?: number; width?: number; family?: 'archivo' | 'mono' | 'serif'; italic?: boolean; tracking?: number};

/** Fija la fuente del contexto. `tracking` en em. */
export function setType(c: CanvasRenderingContext2D, size: number, o: TypeOpts = {}) {
  const {weight = 800, width = 100, family = 'archivo', italic = false, tracking = family === 'archivo' ? -0.02 : 0} = o;
  const fam = family === 'mono' ? MONO : family === 'serif' ? SERIF : ARCHIVO;
  const st = family === 'archivo' ? stretchOf(width) : 'normal';
  c.font = `${italic ? 'italic ' : ''}${family === 'serif' ? 400 : weight} ${st} ${size}px ${fam}`;
  c.letterSpacing = `${tracking * size}px`;
  c.textBaseline = 'alphabetic';
}

/** Tamaño para que `text` ocupe `maxW` px con la fuente dada. */
export function fitSize(c: CanvasRenderingContext2D, text: string, maxW: number, o: TypeOpts = {}, max = 600) {
  setType(c, 100, o);
  const w = c.measureText(text).width;
  return Math.min(max, (100 * maxW) / Math.max(1, w));
}

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=/<>';

/**
 * Texto que se descifra: con k=0 todo son glifos al azar, con k=1 el texto real.
 * Cada carácter se asienta en su turno, de izquierda a derecha; mientras tanto cambia cada fotograma.
 */
export function scramble(text: string, k: number, t: number, seed = 0) {
  if (k >= 1) return text;
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const settle = (i / Math.max(1, text.length)) * 0.6 + 0.4;
    if (ch === ' ' || k >= settle) out += ch;
    else out += GLYPHS[Math.floor(hash(seed * 31 + i * 7 + Math.floor(t * 30)) * GLYPHS.length)]!;
  }
  return out;
}

/** Anotación en mono, la voz de la máquina: pequeña y en ceniza. Con `decode` (0..1) se descifra. */
export function note(
  c: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  o: {size?: number; color?: string; align?: CanvasTextAlign; decode?: number; t?: number; seed?: number} = {},
) {
  setType(c, o.size ?? 17, {family: 'mono', tracking: 0.04});
  c.fillStyle = o.color ?? C.ash;
  c.textAlign = o.align ?? 'left';
  const shown = o.decode === undefined ? text : scramble(text, o.decode, o.t ?? 0, o.seed ?? x + y);
  c.fillText(shown.toUpperCase(), x, y);
  c.textAlign = 'left';
}

/**
 * Palabra letra a letra, centrada en (cx, baseline): las letras caen escalonadas con un resorte.
 * `out` (0..1) la hace salir disparada hacia arriba, también letra a letra.
 * Usa la fuente ya fijada en el contexto.
 */
export function slamLetters(
  c: CanvasRenderingContext2D,
  text: string,
  cx: number,
  baseline: number,
  age: number,
  o: {size: number; out?: number; stagger?: number; color: string},
) {
  const {size, out = 0, stagger = 0.022, color} = o;
  const total = c.measureText(text).width;
  const x0 = cx - total / 2;
  c.fillStyle = color;
  for (let i = 0; i < text.length; i++) {
    const a = age - i * stagger;
    if (a <= 0) continue;
    const s = spring(a, 20, 0.55);
    // La posición de cada letra sale de medir el prefijo, que conserva el kerning de la fuente.
    const x = x0 + c.measureText(text.slice(0, i)).width;
    const leave = clamp(out * 1.6 - (i / text.length) * 0.6);
    const dy = (1 - s) * -size * 0.45 - leave * leave * size * 1.4;
    c.globalAlpha = clamp(a * 14) * (1 - leave);
    c.fillText(text[i]!, x, baseline + dy);
  }
  c.globalAlpha = 1;
}

/** Polvo: puntos que flotan despacio, deterministas, en tres planos de parallax. */
export function dust(c: CanvasRenderingContext2D, t: number, n = 90, color = C.ash) {
  c.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const depth = 0.3 + (i % 3) * 0.35;
    const x = (hash(i * 1.7) * 2200 + t * 12 * depth) % 2000 - 40;
    const y = 1080 - ((hash(i * 3.3) * 1200 + t * 22 * depth) % 1200);
    c.globalAlpha = 0.12 + depth * 0.25 * (0.6 + 0.4 * Math.sin(t * 1.3 + i));
    c.beginPath();
    c.arc(x, y, 0.8 + depth * 1.6, 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;
}

/** Deriva de cámara lenta, más un golpe de giro alterno en cada bombo. */
export const cameraRoll = (t: number, kick = 0, beat = 0, amount = 0.012) =>
  Math.sin(t * 0.31) * 0.003 + kick * amount * (Math.floor(beat) % 2 ? 1 : -1);

/** Filete fino. */
export function rule(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color = C.graphite, w = 1) {
  c.strokeStyle = color;
  c.lineWidth = w;
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.stroke();
}

/** Karaoke: 0 antes de cantarse, 1 al cantarse (rampa de 60 ms). */
export const sung = (w: Word, t: number) => clamp((t - w.start) / 0.06);
/** Opacidad de karaoke: lo pendiente al 35 %, lo cantado entero. */
export const inkOf = (w: Word, t: number) => 0.35 + 0.65 * sung(w, t);
/** Visibilidad de la frase: se anticipa 0.15 s (lo justo para leerla, nunca por delante de la voz). */
export const ANTICIPATION = 0.15;
export const lineIn = (l: Line, t: number) => clamp((t - (l.start - ANTICIPATION)) / 0.1);

/**
 * La cinta: una polilínea en rojo señal, dibujada hasta `k` (0..1 de su longitud),
 * con una punta caliente. Se dibuja en la capa aditiva para que brille.
 */
export function ribbon(c: CanvasRenderingContext2D, pts: [number, number][], k = 1, width = 4, head = true) {
  if (pts.length < 2 || k <= 0) return;
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  const target = lens[lens.length - 1]! * clamp(k);
  c.strokeStyle = C.signal;
  c.lineWidth = width;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(...pts[0]!);
  let tip = pts[0]!;
  for (let i = 1; i < pts.length; i++) {
    if (lens[i]! <= target) {
      c.lineTo(...pts[i]!);
      tip = pts[i]!;
    } else {
      const f = (target - lens[i - 1]!) / (lens[i]! - lens[i - 1]!);
      tip = [pts[i - 1]![0] + (pts[i]![0] - pts[i - 1]![0]) * f, pts[i - 1]![1] + (pts[i]![1] - pts[i - 1]![1]) * f];
      c.lineTo(...tip);
      break;
    }
  }
  c.stroke();
  if (head && k < 1) {
    const g = c.createRadialGradient(tip[0], tip[1], 0, tip[0], tip[1], width * 6);
    g.addColorStop(0, 'rgba(255,240,230,1)');
    g.addColorStop(0.3, C.ember);
    g.addColorStop(1, 'rgba(255,59,47,0)');
    c.fillStyle = g;
    c.fillRect(tip[0] - width * 6, tip[1] - width * 6, width * 12, width * 12);
  }
}

/** Ajustes de post del proyecto: solo la señal pasa el umbral del bloom. */
export const POST: Partial<PostParams> = {bloom: 0.9, bloomThreshold: 1.0, grain: 0.07, ca: 0.5, vignette: 0.28};

/**
 * Escena tipográfica: una capa opaca (`ui`) con el plato y la letra, y una capa aditiva (`hot`)
 * para la señal. `draw` dibuja en ambas; la clase compone y aplica el post.
 */
export abstract class TypeScene extends Scene {
  ui = new Layer2D();
  hot = new Layer2D();
  hotGain = 2.2;
  /** En platos claros la señal se compone encima (sumar rojo sobre papel no se vería). */
  light = false;

  /** Fondo del plato. */
  plate(c: CanvasRenderingContext2D, color: string) {
    this.light = color === C.paper;
    c.fillStyle = color;
    c.fillRect(0, 0, 1920, 1080);
  }

  abstract draw(c: CanvasRenderingContext2D, h: CanvasRenderingContext2D, f: import('../../engine/scene').Frame): Partial<PostParams> | void;

  render(f: import('../../engine/scene').Frame, out: THREE.WebGLRenderTarget): Partial<PostParams> {
    this.ui.clear();
    this.hot.clear();
    const post = this.draw(this.ui.ctx, this.hot.ctx, f) ?? {};
    const {renderer, comp} = this.ctx;
    comp.draw(renderer, this.ui.upload(), out);
    comp.draw(renderer, this.hot.upload(), out, this.light ? {mode: 'over'} : {mode: 'add', gain: this.hotGain});
    return {...POST, ...post};
  }
}
