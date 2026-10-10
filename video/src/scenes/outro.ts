import type * as THREE from 'three';
import {Layer2D} from '../engine/gl';
import type {PostParams} from '../engine/post';
import {Scene, type Frame} from '../engine/scene';
import {ease, prog, spring} from '../engine/util';
import {Backdrop, C, MONO, drawSpark, font, revealWords} from './_kit';

export default class Outro extends Scene {
  bg = new Backdrop();
  ui = new Layer2D();
  hot = new Layer2D();

  render(f: Frame, out: THREE.WebGLRenderTarget): Partial<PostParams> {
    const {renderer, comp, fps} = this.ctx;
    const {lt} = f;
    const glow = 1.6 * Math.exp(-lt / 0.8) + 0.8;
    this.bg.render(renderer, out, {t: f.t, kick: 0, glow: [0.5, 0.42], glowAmt: glow, grid: 1 - prog(lt, 0, 3)});
    const c = this.ui.ctx;
    const h = this.hot.ctx;
    this.ui.clear();
    this.hot.clear();

    const draw = prog(lt, 0.05, 1.2, ease.outCubic);
    const pop = spring(lt - 0.05, 11, 0.4);
    const lift = spring(lt - 1.0, 9, 0.9);
    const sy = 400 - lift * 60;
    drawSpark(h, 960, sy, 300 * (0.6 + pop * 0.4), {progress: draw, rotation: lt * 25});

    revealWords(c, 'Hecho con código.', 960, 690, lt, {
      size: 140,
      align: 'center',
      start: 1.1,
      stagger: 0.09,
      colors: {2: C.accent},
    });
    revealWords(h, 'Hecho con código.', 960, 690, lt, {size: 140, align: 'center', start: 1.1, stagger: 0.09, color: C.accent, only: [2]});

    const sub = prog(lt, 2.0, 2.6, ease.outCubic);
    c.globalAlpha = sub;
    c.textAlign = 'center';
    c.font = font(400, 30, MONO);
    c.fillStyle = C.muted;
    c.fillText('Escrito con Claude Code · Renderizado fotograma a fotograma', 960, 790 + (1 - sub) * 16);
    const sub2 = prog(lt, 2.4, 3.0, ease.outCubic);
    c.globalAlpha = sub2;
    c.fillText('Banda sonora sintetizada en TypeScript', 960, 840 + (1 - sub2) * 16);
    c.font = font(400, 22, MONO);
    c.fillStyle = C.border;
    c.globalAlpha = sub;
    c.fillText(`fotograma ${Math.round(f.t * fps)}`, 960, 1010);
    c.textAlign = 'left';
    c.globalAlpha = 1;

    comp.draw(renderer, this.ui.upload(), out);
    comp.draw(renderer, this.hot.upload(), out, {mode: 'add', gain: 1.4 + 2 * Math.exp(-lt / 0.4)});

    return {
      flash: 0.95 * Math.exp(-lt / 0.15),
      shake: [Math.sin(lt * 80) * 10 * Math.exp(-lt / 0.25), Math.cos(lt * 67) * 10 * Math.exp(-lt / 0.25)],
      ca: 1.2 + 6 * Math.exp(-lt / 0.3),
      zoom: 1 + 0.03 * prog(lt, 0, 6, ease.outCubic),
      fade: prog(lt, 4.4, 5.9, ease.inOutCubic),
      bloom: 1,
    };
  }
}
