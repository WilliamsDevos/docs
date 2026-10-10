import type * as THREE from 'three';
import {Layer2D} from '../../../engine/gl';
import {Scene, type Frame} from '../../../engine/scene';
import {ease, prog} from '../../../engine/util';
import {font} from '../../../kit';
import {drawHero} from '../hero';
import {LINES} from '../../../songs/heroes-tonight/lyrics';
import {DURATION} from '../../../songs/heroes-tonight/music';
import {P} from '../palette';
import {Sky} from '../sky';

/** Outro: amanece. El héroe vuelve a la azotea y aparecen los créditos. */
export default class Dawn extends Scene {
  sky = new Sky();
  ui = new Layer2D();
  hot = new Layer2D();
  credits = LINES[LINES.length - 1]!.end + 0.5;

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const {renderer, comp} = this.ctx;
    const {t, lt} = f;
    const sunrise = prog(lt, 0, 14, ease.inOutCubic);
    this.sky.render(renderer, out, {
      t,
      city: 1,
      scroll: t * 3,
      glow: 1.2 + sunrise,
      stars: 1 - sunrise,
      moon: 1 - sunrise,
      sun: sunrise,
      top: sunrise > 0.5 ? '#1c1640' : '#0c0a22',
      horizon: sunrise > 0.5 ? '#c0583c' : '#4a1d4a',
    });

    this.ui.clear();
    this.hot.clear();
    drawHero(this.ui.ctx, this.hot.ctx, 1450, 820, 230, {pose: 'stand', t, aura: 0.7, wind: 1.2});

    const c = this.ui.ctx;
    const cin = prog(t, this.credits, this.credits + 1.2, ease.outCubic);
    if (cin > 0) {
      c.textAlign = 'center';
      c.globalAlpha = cin;
      c.shadowColor = 'rgba(5,6,15,0.8)';
      c.shadowBlur = 30;
      c.font = font(800, 92);
      c.letterSpacing = '-2px';
      c.fillStyle = P.text;
      c.fillText('HEROES TONIGHT', 960, 330);
      c.font = font(400, 34);
      c.letterSpacing = '1px';
      c.fillStyle = P.gold;
      c.fillText('Janji · feat. Johnning', 960, 395);
      c.font = font(400, 24);
      c.fillStyle = P.text;
      c.fillText('Music provided by NoCopyrightSounds', 960, 470);
      c.fillText('Free Download / Stream: ncs.io/HeroesTonight', 960, 508);
      c.globalAlpha = cin * prog(t, this.credits + 1, this.credits + 2);
      c.font = font(400, 20, '"JetBrains Mono"');
      c.fillStyle = P.muted;
      c.fillText('visuales generados con código · three.js · GLSL · Whisper · ffmpeg', 960, 1040);
      c.textAlign = 'left';
      c.letterSpacing = '0px';
      c.shadowBlur = 0;
      c.globalAlpha = 1;
    }
    comp.draw(renderer, this.ui.upload(), out);
    comp.draw(renderer, this.hot.upload(), out, {mode: 'add', gain: 1.6});
    return {bloom: 1.0, vignette: 0.5, fade: prog(t, DURATION - 3, DURATION - 0.3, ease.inOutCubic)};
  }
}
