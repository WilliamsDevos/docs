import type * as THREE from 'three';
import {Layer2D} from '../engine/gl';
import {Scene, type Frame} from '../engine/scene';
import {ease, prog, spring} from '../engine/util';
import {Backdrop, C, MONO, drawSpark, drawWindow, font, revealWords, roundRect, shakeFrom} from './_kit';

const CODE = `export function logo(t: number) {
  const frame = Math.floor(t * 30);

  const scale = spring(t, 14, 0.5);
  const rotate = (frame / 90) * 360;

  drawSpark(ctx, 960, 540, 280, {
    rotation: rotate,
    size: 280 * scale,
  });
}`.split('\n');

const TOKEN_RE =
  /(\/\/.*$)|(`[^`]*`|'[^']*')|\b(export|function|const|return|number)\b|\b(\d+(?:\.\d+)?)\b|([A-Za-z_]\w*)(?=\()|([{}()[\],;=:.*/+-])/g;
const TOKEN_COLORS = [C.muted, C.green, C.purple, C.yellow, C.blue, C.muted];

function drawCode(c: CanvasRenderingContext2D, code: string, x: number, y: number) {
  let last = 0;
  let cx = x;
  const put = (s: string, color: string) => {
    c.fillStyle = color;
    c.fillText(s, cx, y);
    cx += c.measureText(s).width;
  };
  for (const m of code.matchAll(TOKEN_RE)) {
    const i = m.index ?? 0;
    if (i > last) put(code.slice(last, i), C.text);
    const g = m.slice(1).findIndex((v) => v !== undefined);
    put(m[0], TOKEN_COLORS[g]!);
    last = i + m[0].length;
  }
  if (last < code.length) put(code.slice(last), C.text);
}

const LINE_START = 0.5;
const LINE_GAP = 0.09;
const LH = 46;
// Las etiquetas caen sobre golpes de palmas.
const CALLOUTS = [
  {line: 3, at: 2.5, label: 'física de resorte', color: C.blue},
  {line: 4, at: 3.5, label: 'fotograma → grados', color: C.yellow},
];

export default class Code extends Scene {
  bg = new Backdrop();
  ui = new Layer2D();
  hot = new Layer2D();

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const {renderer, comp} = this.ctx;
    const {lt} = f;
    this.bg.render(renderer, out, {t: f.t, kick: f.kick, glow: [0.78, 0.55], glowAmt: 1.3});
    const c = this.ui.ctx;
    const h = this.hot.ctx;
    this.ui.clear();
    this.hot.clear();

    const zoom = 1 + f.clap * 0.01 + prog(lt, 0, 8) * 0.03;
    for (const ctx of [c, h]) {
      ctx.translate(960, 540);
      ctx.scale(zoom, zoom);
      ctx.translate(-960, -540);
    }

    revealWords(c, 'Cada fotograma es una función de t.', 120, 175, lt, {
      size: 76,
      stagger: 0.05,
      colors: {4: C.accent, 5: C.accent, 6: C.accent},
    });
    revealWords(h, 'Cada fotograma es una función de t.', 120, 175, lt, {
      size: 76,
      stagger: 0.05,
      color: C.accent,
      only: [4, 5, 6],
    });

    // Editor.
    // Canvas2D ignora globalAlpha > 1, y el resorte rebota por encima: se acota.
    const ein = Math.min(1, spring(lt - 0.2, 12, 0.9));
    const ex = 120 - (1 - ein) * 80;
    const ey = 250;
    c.globalAlpha = ein;
    const top = drawWindow(c, ex, ey, 1060, 740, 'src/scenes/logo.ts');
    c.font = font(400, 26, MONO);
    CODE.forEach((line, i) => {
      const at = LINE_START + i * LINE_GAP;
      const k = prog(lt, at, at + 0.15, ease.outCubic);
      if (k <= 0) return;
      const ly = top + 52 + i * LH;
      const callout = CALLOUTS.find((cl) => cl.line === i);
      if (callout) {
        const g = prog(lt, callout.at, callout.at + 0.2);
        c.globalAlpha = g * 0.1 * ein;
        c.fillStyle = callout.color;
        c.fillRect(ex + 1, ly - 31, 1058, LH);
        c.globalAlpha = g * ein;
        c.fillRect(ex + 1, ly - 31, 4, LH);
      }
      c.globalAlpha = k * ein;
      c.fillStyle = '#4A463E';
      c.textAlign = 'right';
      c.fillText(String(i + 1), ex + 64, ly);
      c.textAlign = 'left';
      drawCode(c, line, ex + 96 + (1 - k) * 14, ly);
    });
    c.globalAlpha = 1;
    CALLOUTS.forEach((cl) => {
      const s = spring(lt - cl.at, 16, 0.5);
      if (s <= 0.01) return;
      const ly = top + 52 + cl.line * LH;
      c.font = font(600, 22);
      const w = c.measureText(cl.label).width + 36;
      c.save();
      c.translate(ex + 1060 - 28, ly - 8);
      c.scale(s, s);
      roundRect(c, -w, -19, w, 38, 19);
      c.fillStyle = C.raised;
      c.fill();
      c.strokeStyle = cl.color;
      c.lineWidth = 1.5;
      c.stroke();
      c.fillStyle = cl.color;
      c.fillText(cl.label, -w + 18, 8);
      c.restore();
    });

    // Vista previa: ejecuta literalmente la función del editor.
    const pin = Math.min(1, spring(lt - 1.2, 10, 0.9));
    const px = 1240;
    const pw = 560;
    c.globalAlpha = pin;
    roundRect(c, px, ey + (1 - pin) * 40, pw, 600, 22);
    c.setLineDash([10, 8]);
    c.strokeStyle = C.border;
    c.lineWidth = 2;
    c.stroke();
    c.setLineDash([]);
    c.font = font(400, 20, MONO);
    c.fillStyle = C.muted;
    c.fillText('vista previa', px + 24, ey + 40 + (1 - pin) * 40);

    const local = Math.max(0, lt - 1.6);
    const loopT = local % (90 / 30);
    const frame = Math.floor(loopT * 30);
    const scale = spring(loopT, 14, 0.5);
    const rotate = (frame / 90) * 360;
    h.globalAlpha = pin;
    drawSpark(h, px + pw / 2, ey + 300 + (1 - pin) * 40, 300 * scale * (1 + f.clap * 0.08), {rotation: rotate});
    h.globalAlpha = 1;

    c.font = font(400, 25, MONO);
    const ry = ey + 660;
    const cols: [string, string, string][] = [
      ['frame', String(frame).padStart(2, '0'), C.text],
      ['scale', scale.toFixed(2), C.blue],
      ['rotate', `${Math.round(rotate)}°`, C.yellow],
    ];
    cols.forEach(([k, v, col], i) => {
      const x = px + i * 195;
      c.fillStyle = C.muted;
      c.fillText(k, x, ry);
      c.fillStyle = col;
      c.fillText(v, x + c.measureText(k + ' ').width, ry);
    });
    c.globalAlpha = 1;

    comp.draw(renderer, this.ui.upload(), out);
    comp.draw(renderer, this.hot.upload(), out, {mode: 'add', gain: 1.8 + f.clap * 0.8});

    return {
      shake: shakeFrom(f.kick, f.t, 2.5),
      ca: 1.2 + f.clap * 3,
      bloom: 0.85,
      zoom: 1 + f.kick * 0.004,
      flash: 0.12 * Math.exp(-lt / 0.1),
    };
  }
}
