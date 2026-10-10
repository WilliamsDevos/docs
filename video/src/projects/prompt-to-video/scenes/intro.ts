import type * as THREE from 'three';
import {Layer2D} from '../../../engine/gl';
import {Scene, type Frame} from '../../../engine/scene';
import {ease, prog, spring} from '../../../engine/util';
import {Backdrop, C, drawSpark, revealWords, shakeFrom} from '../../../kit';

// Tres frases, una por golpe: "Un prompt." · "Un poco de código." · "Un video."
const LINES = [
  {text: 'Un prompt.', at: 0.0},
  {text: 'Un poco de código.', at: 1.0},
  {text: 'Un video.', at: 2.0},
];

export default class Intro extends Scene {
  bg = new Backdrop();
  ui = new Layer2D();
  hot = new Layer2D();

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const {renderer, comp} = this.ctx;
    const lt = f.lt;
    this.bg.render(renderer, out, {t: f.t, kick: f.kick, glow: [0.62, 0.62], grid: prog(lt, 0, 1.5), glowAmt: prog(lt, 1.8, 3)});

    const c = this.ui.ctx;
    const h = this.hot.ctx;
    this.ui.clear();
    this.hot.clear();

    const dim = 1 - 0.68 * prog(lt, 2.0, 2.3, ease.outCubic);
    const push = 1 + 0.05 * prog(lt, 0, 4, ease.inOutCubic);
    for (const ctx of [c, h]) {
      ctx.translate(960, 540);
      ctx.scale(push, push);
      ctx.translate(-960, -540);
    }

    LINES.forEach((line, i) => {
      const y = 380 + i * 165;
      const last = i === LINES.length - 1;
      c.globalAlpha = last ? 1 : dim;
      const w = revealWords(c, line.text, 250, y, lt, {
        size: 150,
        start: line.at,
        stagger: 0.07,
        colors: last ? {1: C.accent} : {},
      });
      c.globalAlpha = 1;
      if (last) {
        // La chispa aparece con el resorte y late en cada golpe del redoble.
        const s = spring(lt - line.at - 0.15, 12, 0.45);
        const size = 130 * s * (1 + f.kick * 0.25);
        drawSpark(h, 250 + w + 100, y - 52, size, {progress: s, rotation: lt * 70});
        revealWords(h, line.text, 250, y, lt, {size: 150, start: line.at, stagger: 0.07, color: C.accent, only: [1]});
      }
    });

    comp.draw(renderer, this.ui.upload(), out);
    comp.draw(renderer, this.hot.upload(), out, {mode: 'add', gain: 1.6 + f.kick * 1.5});

    return {
      shake: shakeFrom(f.kick, f.t, 5),
      ca: 1.2 + f.kick * 5,
      zoom: 1 + f.kick * 0.012,
      bloom: 0.9,
      fade: 1 - prog(lt, 0, 0.12),
    };
  }
}
