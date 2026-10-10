import type * as THREE from 'three';
import {Layer2D} from '../../../engine/gl';
import {Scene, type Frame} from '../../../engine/scene';
import {clamp, ease, prog, spring} from '../../../engine/util';
import {font} from '../../../kit';
import {LINES, type Line} from '../lyrics';
import {P} from '../palette';

const STYLE = {
  verse: {size: 54, weight: 600, y: 1010, upper: false},
  chorus: {size: 112, weight: 800, y: 250, upper: true},
  shout: {size: 180, weight: 800, y: 330, upper: true},
};

/** Capa de letra: cada palabra entra con un resorte en su momento; la frase sale con un fundido. */
export default class Lyrics extends Scene {
  ui = new Layer2D();
  hot = new Layer2D();

  private drawLine(line: Line, t: number, kick: number) {
    const st = STYLE[line.style];
    const c = this.ui.ctx;
    const h = this.hot.ctx;
    const out = 1 - prog(t, line.end - 0.25, line.end, ease.inOutCubic);
    let size = st.size;
    const words = line.words.map((w) => (st.upper ? w.w.toUpperCase() : w.w));
    c.font = font(st.weight, size);
    c.letterSpacing = `${-0.03 * size}px`;
    // Si no cabe en 1700 px, se reduce.
    const space = size * 0.28;
    let total = words.reduce((a, w) => a + c.measureText(w).width, 0) + space * (words.length - 1);
    if (total > 1700) {
      size *= 1700 / total;
      c.font = font(st.weight, size);
      c.letterSpacing = `${-0.03 * size}px`;
      total = 1700;
    }
    h.font = c.font;
    h.letterSpacing = c.letterSpacing;
    const sp = size * 0.28;
    const widths = words.map((w) => c.measureText(w).width);
    total = widths.reduce((a, b) => a + b, 0) + sp * (words.length - 1);
    let x = 960 - total / 2;
    const pulse = line.style === 'shout' ? 1 + kick * 0.06 : 1;
    words.forEach((w, i) => {
      const s = spring(t - line.words[i]!.start + 0.08, 14, 0.6);
      if (s > 0.001) {
        const a = clamp(s) * out;
        c.save();
        c.translate(x + widths[i]! / 2, st.y);
        c.scale(pulse, pulse);
        c.translate(0, (1 - s) * size * 0.5);
        c.globalAlpha = a;
        c.shadowColor = 'rgba(5,6,15,0.85)';
        c.shadowBlur = size * 0.25;
        c.fillStyle = P.text;
        c.fillText(w, -widths[i]! / 2, 0);
        c.restore();
        if (line.style !== 'verse') {
          // Brillo extra en estribillos: la palabra recién cantada destella.
          const glow = Math.exp(-Math.max(0, t - line.words[i]!.start) / 0.35);
          h.save();
          h.translate(x + widths[i]! / 2, st.y);
          h.scale(pulse, pulse);
          h.globalAlpha = a * (0.25 + 0.75 * glow);
          h.fillStyle = line.style === 'shout' ? P.pink : P.gold;
          h.fillText(w, -widths[i]! / 2, 0);
          h.restore();
        }
      }
      x += widths[i]! + sp;
    });
    c.letterSpacing = h.letterSpacing = '0px';
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const {renderer, comp} = this.ctx;
    const active = LINES.filter((l) => f.t >= l.words[0]!.start - 0.1 && f.t < l.end);
    if (active.length === 0) return;
    this.ui.clear();
    this.hot.clear();
    for (const l of active) this.drawLine(l, f.t, f.kick);
    comp.draw(renderer, this.ui.upload(), out, {gain: 0.85});
    comp.draw(renderer, this.hot.upload(), out, {mode: 'add', gain: 0.7});
  }
}
