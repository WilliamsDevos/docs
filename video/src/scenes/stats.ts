import type * as THREE from 'three';
import {Layer2D} from '../engine/gl';
import {Scene, type Frame} from '../engine/scene';
import {ease, prog, spring} from '../engine/util';
import {BEAT, DURATION} from '../music';
import {Backdrop, C, font, revealWords, roundRect, shakeFrom} from './_kit';

export default class Stats extends Scene {
  bg = new Backdrop();
  ui = new Layer2D();
  hot = new Layer2D();

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const {renderer, comp, fps} = this.ctx;
    const {lt} = f;
    this.bg.render(renderer, out, {t: f.t, kick: f.kick, glow: [0.5, 0.6], glowAmt: 1});
    const c = this.ui.ctx;
    const h = this.hot.ctx;
    this.ui.clear();
    this.hot.clear();

    revealWords(c, 'Sin timeline. Sin editor. Sin clips.', 960, 330, lt, {
      size: 84,
      align: 'center',
      stagger: 0.06,
      colors: {1: C.accent, 3: C.accent, 5: C.accent},
    });

    const stats = [
      {value: 1080, suffix: 'p', label: '1920 × 1080', color: C.blue},
      {value: fps, suffix: ' fps', label: 'fotogramas por segundo', color: C.green},
      {value: Math.round(DURATION * fps), suffix: '', label: 'fotogramas renderizados', color: C.yellow},
      {value: 0, suffix: '', label: 'clips de stock', color: C.accent},
    ];
    const tw = 380;
    const gap = 36;
    const x0 = 960 - (stats.length * tw + (stats.length - 1) * gap) / 2;
    stats.forEach((s, i) => {
      const at = BEAT * (1 + i);
      const e = spring(lt - at, 13, 0.55);
      if (e <= 0.001) return;
      const n = Math.round(s.value * prog(lt, at, at + 1.2, ease.outExpo));
      const x = x0 + i * (tw + gap);
      const y = 450 + (1 - e) * 90;
      c.save();
      c.globalAlpha = Math.min(1, e * 1.5);
      roundRect(c, x, y, tw, 250, 24);
      c.fillStyle = C.surface;
      c.fill();
      c.strokeStyle = C.border;
      c.lineWidth = 1.5;
      c.stroke();
      c.fillStyle = s.color;
      c.fillRect(x + 24, y, tw - 48, 4);
      c.font = font(400, 26);
      c.fillStyle = C.muted;
      c.fillText(s.label, x + 36, y + 205);
      c.restore();
      h.save();
      h.globalAlpha = Math.min(1, e * 1.5);
      h.font = font(800, 96);
      h.letterSpacing = '-4px';
      h.fillStyle = s.color;
      h.fillText(`${n}${s.suffix}`, x + 32, y + 140);
      h.restore();
    });

    revealWords(c, 'Solo código: TypeScript, three.js, GLSL y ffmpeg.', 960, 860, lt, {
      size: 34,
      weight: 600,
      align: 'center',
      start: 2.4,
      stagger: 0.04,
      tracking: -0.01,
      color: C.muted,
    });

    comp.draw(renderer, this.ui.upload(), out);
    comp.draw(renderer, this.hot.upload(), out, {mode: 'add', gain: 1.0 + f.kick * 0.5});

    return {shake: shakeFrom(f.kick, f.t, 3), ca: 1.2 + f.kick * 2.5, zoom: 1 + f.kick * 0.006};
  }
}
