// Sistema tipográfico de "Heroes Tonight": tinta y papel, un solo color de señal (rojo capa)
// y una cinta roja que recorre todo el video.
import type * as THREE from 'three';
import {Layer2D} from '../../engine/gl';
import type {PostParams} from '../../engine/post';
import {Scene} from '../../engine/scene';
import {clamp} from '../../engine/util';
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

/** Anotación en mono, la voz de la máquina: pequeña y en ceniza. */
export function note(c: CanvasRenderingContext2D, text: string, x: number, y: number, o: {size?: number; color?: string; align?: CanvasTextAlign} = {}) {
  setType(c, o.size ?? 17, {family: 'mono', tracking: 0.04});
  c.fillStyle = o.color ?? C.ash;
  c.textAlign = o.align ?? 'left';
  c.fillText(text.toUpperCase(), x, y);
  c.textAlign = 'left';
}

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
/** Visibilidad de la frase: se anticipa 0.4 s. */
export const lineIn = (l: Line, t: number) => clamp((t - (l.start - 0.4)) / 0.15);

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
