// Piezas compartidas por las escenas: paleta, fondo, chispa, tipografía y ventanas.
import * as THREE from 'three';
import {FSPass} from './engine/gl';
import {clamp, spring} from './engine/util';

// Colores CSS (sRGB) para Canvas2D.
export const C = {
  bg: '#0E0D0B',
  surface: '#191815',
  raised: '#211F1B',
  border: '#34312B',
  text: '#F3EFE6',
  muted: '#8F8A7F',
  accent: '#E07A52',
  accentSoft: '#F4B79C',
  green: '#86D493',
  blue: '#82BDF6',
  purple: '#C9A2F4',
  yellow: '#F1D37E',
};

export const SANS = 'Inter';
export const MONO = '"JetBrains Mono"';
export const font = (weight: number, size: number, family = SANS) => `${weight} ${size}px ${family}`;

/** Fondo: humo muy tenue, rejilla que se desplaza y un halo cálido que late con el bombo. */
export class Backdrop {
  pass = new FSPass(
    /* glsl */ `
    uniform float t, kick, grid, glowAmt;
    uniform vec2 glow;
    varying vec2 vUv;
    void main() {
      vec2 px = vUv * vec2(1920.0, 1080.0);
      vec3 c = C_INK;
      c += vec3(0.010, 0.007, 0.005) * fbm(vUv * 3.0 + vec2(t * 0.05, -t * 0.03));
      vec2 g = abs(fract((px + vec2(t * 18.0, t * 11.0)) / 80.0) - 0.5) * 80.0;
      float line = 1.0 - smoothstep(0.0, 1.3, min(g.x, g.y));
      float mask = smoothstep(1.0, 0.15, length((vUv - 0.5) * vec2(1.6, 1.0)));
      c += vec3(0.022, 0.020, 0.017) * line * mask * grid * (1.0 + kick * 0.8);
      float d = length((vUv - glow) * vec2(1.78, 1.0));
      c += C_ACCENT * 0.10 * exp(-d * d * 5.0) * glowAmt * (1.0 + kick * 0.7);
      gl_FragColor = vec4(c, 1.0);
    }`,
    {
      t: {value: 0},
      kick: {value: 0},
      grid: {value: 1},
      glowAmt: {value: 1},
      glow: {value: new THREE.Vector2(0.5, 0.5)},
    },
  );
  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, o: {t: number; kick: number; glow?: [number, number]; grid?: number; glowAmt?: number}) {
    this.pass.u.t!.value = o.t;
    this.pass.u.kick!.value = o.kick;
    this.pass.u.grid!.value = o.grid ?? 1;
    this.pass.u.glowAmt!.value = o.glowAmt ?? 1;
    (this.pass.u.glow!.value as THREE.Vector2).set(...(o.glow ?? [0.5, 0.5]));
    this.pass.render(renderer, out);
  }
}

/** Chispa de 12 rayos. `progress` 0..1 dibuja los rayos con desfase. */
export function drawSpark(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  {progress = 1, rotation = 0, color = C.accent, width = 0.075}: {progress?: number; rotation?: number; color?: string; width?: number} = {},
) {
  const rays = 12;
  c.save();
  c.translate(x, y);
  c.rotate((rotation * Math.PI) / 180);
  c.strokeStyle = color;
  c.lineCap = 'round';
  c.lineWidth = size * width;
  for (let i = 0; i < rays; i++) {
    const stagger = i / rays / 2;
    const k = clamp((progress - stagger) / (1 - stagger));
    if (k <= 0) continue;
    const len = (i % 2 === 0 ? 0.44 : 0.3) * size * k;
    const a = (i / rays) * Math.PI * 2;
    c.beginPath();
    c.moveTo(Math.sin(a) * size * 0.04 * k, -Math.cos(a) * size * 0.04 * k);
    c.lineTo(Math.sin(a) * len, -Math.cos(a) * len);
    c.stroke();
  }
  c.restore();
}

/**
 * Palabras que suben desde detrás de una máscara, cada una con su resorte.
 * Devuelve el ancho total dibujado.
 */
export function revealWords(
  c: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  lt: number,
  o: {size: number; start?: number; stagger?: number; color?: string; colors?: Record<number, string>; weight?: number; family?: string; tracking?: number; align?: 'left' | 'center'; only?: number[]},
) {
  const {size, start = 0, stagger = 0.08, color = C.text, colors = {}, weight = 800, family = SANS, tracking = -0.045} = o;
  c.font = font(weight, size, family);
  c.letterSpacing = `${tracking * size}px`;
  c.textBaseline = 'alphabetic';
  const words = text.split(' ');
  const space = c.measureText(' ').width + size * 0.04;
  const widths = words.map((w) => c.measureText(w).width);
  const total = widths.reduce((a, b) => a + b, 0) + space * (words.length - 1);
  let cx = o.align === 'center' ? x - total / 2 : x;
  words.forEach((w, i) => {
    const s = spring(lt - start - i * stagger, 16, 0.8);
    if (s > 0.001 && (!o.only || o.only.includes(i))) {
      c.save();
      c.beginPath();
      c.rect(cx - size * 0.1, y - size * 1.05, widths[i]! + size * 0.25, size * 1.35);
      c.clip();
      c.fillStyle = colors[i] ?? color;
      c.fillText(w, cx, y + (1 - s) * size * 1.25);
      c.restore();
    }
    cx += widths[i]! + space;
  });
  c.letterSpacing = '0px';
  return total;
}

export function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

/** Ventana estilo macOS. Devuelve la coordenada y donde empieza el contenido. */
export function drawWindow(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string) {
  c.save();
  roundRect(c, x, y, w, h, 22);
  c.fillStyle = C.surface;
  c.fill();
  c.clip();
  c.fillStyle = C.raised;
  c.fillRect(x, y, w, 56);
  c.fillStyle = C.border;
  c.fillRect(x, y + 56, w, 1.5);
  ['#FF5F57', '#FEBC2E', '#28C840'].forEach((col, i) => {
    c.beginPath();
    c.arc(x + 30 + i * 25, y + 28, 7.5, 0, Math.PI * 2);
    c.fillStyle = col;
    c.fill();
  });
  c.font = font(400, 20, MONO);
  c.fillStyle = C.muted;
  c.textAlign = 'center';
  c.fillText(title, x + w / 2, y + 35);
  c.textAlign = 'left';
  c.restore();
  roundRect(c, x + 0.75, y + 0.75, w - 1.5, h - 1.5, 22);
  c.strokeStyle = C.border;
  c.lineWidth = 1.5;
  c.stroke();
  return y + 56;
}

/** Sacudida determinista a partir de la envolvente del bombo. */
export const shakeFrom = (kick: number, t: number, amount = 6): [number, number] => [
  Math.sin(t * 91.7) * kick * amount,
  Math.cos(t * 73.3) * kick * amount,
];
