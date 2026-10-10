import type * as THREE from 'three';
import {Layer2D} from '../../../engine/gl';
import {Scene, type Frame} from '../../../engine/scene';
import {ease, prog, spring} from '../../../engine/util';
import {shakeFrom} from '../../../kit';
import {drawHero} from '../hero';
import {findLine, findWord} from '../../../songs/heroes-tonight/lyrics';
import {KICKS} from '../../../songs/heroes-tonight/music';
import {P} from '../palette';
import {FUSE, fusePoint, particles} from '../sparks';
import {Sky} from '../sky';

/**
 * Estrofa 2: "I'm feeling like a dynamite, ready to explode right up in the sky".
 * Una mecha encendida cruza el cielo y estalla en la palabra "explode". Después, en
 * "I need you to listen… to hear", el héroe emite ondas de sonido; en "fear", brilla del todo.
 */
export default class Fuse extends Scene {
  sky = new Sky();
  ui = new Layer2D();
  hot = new Layer2D();
  listen = findLine('need you to listen');
  fear = findWord(findLine("don't show any fear"), 'fear');

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const {renderer, comp} = this.ctx;
    const {t} = f;
    const boom = t >= FUSE.explode ? Math.exp(-(t - FUSE.explode) / 0.5) : 0;
    this.sky.render(renderer, out, {t, city: 1, scroll: t * 10, kick: f.kick, glow: 0.8 + boom * 1.2 + f.a.low * 0.5, moon: 0.5, horizon: '#2e1446'});

    this.ui.clear();
    this.hot.clear();
    const c = this.ui.ctx;
    const h = this.hot.ctx;

    // La mecha: lo que queda por arder en tono apagado, la cabeza como una chispa.
    const k = prog(t, FUSE.start, FUSE.explode);
    if (t < FUSE.explode + 0.1) {
      c.lineWidth = 9;
      c.lineCap = 'round';
      c.strokeStyle = '#8a6a72';
      c.beginPath();
      for (let i = 0; i <= 60; i++) {
        const q = k + (1 - k) * (i / 60);
        const [x, y] = fusePoint(q);
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
      const [hx, hy] = fusePoint(k);
      const g = h.createRadialGradient(hx, hy, 0, hx, hy, 70);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, 'rgba(255,200,120,0.9)');
      g.addColorStop(1, 'rgba(255,120,60,0)');
      h.fillStyle = g;
      h.fillRect(hx - 80, hy - 80, 160, 160);
    }

    // Después del estallido: el héroe y sus ondas de sonido (una por bombo).
    const appear = spring(t - FUSE.explode - 0.4, 8, 0.9);
    if (appear > 0.001) {
      for (const kt of KICKS) {
        const age = t - kt;
        if (age < 0 || age > 1.2 || kt < this.listen.start) continue;
        const q = age / 1.2;
        h.globalAlpha = (1 - q) * 0.7;
        h.strokeStyle = P.cyan;
        h.lineWidth = 3;
        h.beginPath();
        h.arc(960, 780, 80 + q * 700, 0, Math.PI * 2);
        h.stroke();
      }
      h.globalAlpha = 1;
      const shine = t >= this.fear.start ? 1 + Math.exp(-(t - this.fear.start) / 0.5) : 0.6;
      c.globalAlpha = Math.min(1, appear);
      drawHero(c, h, 960, 1000 + (1 - Math.min(1, appear)) * 200, 320, {pose: 'stand', t, aura: shine * Math.min(1, appear), wind: 1.5});
      c.globalAlpha = 1;
    }

    comp.draw(renderer, this.ui.upload(), out);
    particles().render(renderer, out, t);
    comp.draw(renderer, this.hot.upload(), out, {mode: 'add', gain: 2});

    return {
      bloom: 1.1 + boom,
      shake: shakeFrom(Math.max(f.kick * 0.6, boom), t, 4 + boom * 14),
      ca: 1.3 + f.kick * 2 + boom * 8,
      zoom: 1 + boom * 0.04 + prog(t, FUSE.start, FUSE.explode, ease.inCubic) * 0.03,
      flash: t >= FUSE.explode ? 0.9 * Math.exp(-(t - FUSE.explode) / 0.15) : 0,
    };
  }
}
