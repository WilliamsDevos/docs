import type * as THREE from 'three';
import {Layer2D} from '../../../engine/gl';
import {Scene, type Frame} from '../../../engine/scene';
import {ease, prog} from '../../../engine/util';
import {shakeFrom} from '../../../kit';
import {drawHero} from '../hero';
import {P} from '../palette';
import {CORE, particles} from '../sparks';
import {Sky} from '../sky';

/**
 * Subidas: el héroe, quieto sobre la ciudad, concentra energía. En cada tiempo llega una oleada
 * de chispas y un anillo se cierra sobre su pecho; todo se acelera hasta el blanco del drop.
 */
export default class Charge extends Scene {
  sky = new Sky();
  ui = new Layer2D();
  hot = new Layer2D();

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const {renderer, comp} = this.ctx;
    const {t, p} = f;
    const k = prog(p, 0, 1, ease.inCubic);
    this.sky.render(renderer, out, {t, camY: -80, city: 1, scroll: t * 4, kick: f.kick, glow: 0.6 + k * 1.2, moon: 0.4, horizon: '#2b1446'});

    this.ui.clear();
    this.hot.clear();
    const h = this.hot.ctx;
    // Anillos que se cierran sobre el núcleo una vez por tiempo (dos veces al final).
    const rate = p < 0.5 ? 1 : p < 0.85 ? 2 : 4;
    const ph = (f.beat * rate) % 1;
    for (let i = 0; i < 3; i++) {
      const q = (ph + i / 3) % 1;
      h.globalAlpha = q * (0.3 + k * 0.7);
      h.strokeStyle = i % 2 ? P.cyan : P.gold;
      h.lineWidth = 2 + q * 4;
      h.beginPath();
      h.arc(CORE.x, CORE.y, (1 - q) * 700 + 20, 0, Math.PI * 2);
      h.stroke();
    }
    h.globalAlpha = 1;
    drawHero(this.ui.ctx, h, 960, 1000, 300, {pose: 'stand', t, aura: 0.4 + k * 0.8 + f.kick * 0.3, wind: 0.6 + k * 2});
    // El núcleo crece.
    const core = h.createRadialGradient(CORE.x, CORE.y, 0, CORE.x, CORE.y, 40 + k * 120);
    core.addColorStop(0, 'rgba(255,255,255,1)');
    core.addColorStop(0.3, 'rgba(255,210,150,0.8)');
    core.addColorStop(1, 'rgba(255,120,80,0)');
    h.fillStyle = core;
    h.fillRect(CORE.x - 200, CORE.y - 200, 400, 400);

    comp.draw(renderer, this.ui.upload(), out);
    particles().render(renderer, out, t);
    comp.draw(renderer, this.hot.upload(), out, {mode: 'add', gain: 1.6 + k * 1.5});

    return {
      bloom: 1.1 + k * 0.8,
      shake: shakeFrom(Math.max(f.kick, k * 0.4), t, 2 + k * 6),
      ca: 1.2 + k * 4,
      zoom: 1 + k * 0.06,
      exposure: 1 + k * 0.35,
    };
  }
}
