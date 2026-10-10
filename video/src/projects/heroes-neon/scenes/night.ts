import type * as THREE from 'three';
import {Layer2D} from '../../../engine/gl';
import {Scene, type Frame} from '../../../engine/scene';
import {ease, prog} from '../../../engine/util';
import {font} from '../../../kit';
import {drawHero} from '../hero';
import {LINES, findLine, findWord} from '../../../songs/heroes-tonight/lyrics';
import {bar} from '../../../songs/heroes-tonight/music';
import {P} from '../palette';
import {Sky} from '../sky';
import {HORIZON, Street} from '../street';

/**
 * Intro y estrofa 1: "I'm walking alone, the streets are empty… my own silhouette… step by step…
 * the clock is ticking". La cámara baja de las estrellas a una calle vacía; el héroe camina
 * un paso por tiempo y su aura crece con cada frase. La luna se vuelve reloj.
 */
export default class Night extends Scene {
  sky = new Sky();
  street = new Street();
  ui = new Layer2D();
  hot = new Layer2D();
  verse = LINES.slice(0, 4);
  clockLine = findLine('clock is ticking');
  stronger = findWord(findLine('getting stronger'), 'stronger');

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const {renderer, comp} = this.ctx;
    const {t} = f;
    const down = prog(t, 0, bar(4), ease.inOutCubic);
    const camY = (1 - down) * -1100;
    const scroll = t * 2.2; // el paseo
    this.sky.render(renderer, out, {
      t,
      camY,
      city: 1,
      base: HORIZON,
      scroll: t * 6,
      glow: 0.7,
      clock: prog(t, this.clockLine.start - 0.6, this.clockLine.start + 0.2, ease.inOutCubic),
      hands: Math.floor(f.beat) * ((Math.PI * 2) / 16),
    });
    this.street.render(renderer, out, {scroll, camY});

    this.ui.clear();
    this.hot.clear();
    // Aura: crece frase a frase y da un salto en "stronger".
    const done = this.verse.filter((l) => t >= l.start).length;
    const aura = 0.08 + done * 0.16 + 0.5 * Math.exp(-Math.max(0, t - this.stronger.start) / 0.6) * (t >= this.stronger.start ? 1 : 0);
    const heroIn = prog(t, bar(2), bar(4), ease.outCubic);
    if (heroIn > 0) {
      this.ui.ctx.globalAlpha = heroIn;
      drawHero(this.ui.ctx, this.hot.ctx, 960, 940 - camY, 300, {pose: 'walk', phase: f.beat, t, aura: aura * heroIn});
      this.ui.ctx.globalAlpha = 1;
    }

    // Cartela de título durante la intro.
    const c = this.ui.ctx;
    const tin = prog(t, 0.6, 2.2, ease.outCubic);
    const tout = 1 - prog(t, bar(3.25), bar(3.9), ease.inOutCubic);
    if (tout > 0) {
      c.textAlign = 'center';
      c.globalAlpha = tin * tout;
      c.font = font(600, 30);
      c.letterSpacing = `${18 - tin * 6}px`;
      c.fillStyle = P.muted;
      c.fillText('JANJI', 960, 430);
      c.font = font(800, 140);
      c.letterSpacing = `${-4 + (1 - tin) * 30}px`;
      c.fillStyle = P.text;
      c.fillText('HEROES TONIGHT', 960, 570);
      c.font = font(400, 34);
      c.letterSpacing = '2px';
      c.fillStyle = P.gold;
      c.fillText('feat. Johnning', 960, 640);
      c.font = font(400, 20);
      c.letterSpacing = '4px';
      c.fillStyle = P.muted;
      c.globalAlpha = tin * tout * 0.8;
      c.fillText('NCS RELEASE · MUSIC PROVIDED BY NOCOPYRIGHTSOUNDS', 960, 1000);
      c.letterSpacing = '0px';
      c.textAlign = 'left';
      c.globalAlpha = 1;
    }
    comp.draw(renderer, this.ui.upload(), out, {gain: 1.1});
    comp.draw(renderer, this.hot.upload(), out, {mode: 'add', gain: 2.2});

    return {fade: 1 - prog(t, 0, 1.2), bloom: 1.0, grain: 0.06, vignette: 0.55};
  }
}
