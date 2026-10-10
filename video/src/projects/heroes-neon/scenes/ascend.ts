import * as THREE from 'three';
import {FSPass, Layer2D} from '../../../engine/gl';
import {Scene, type Frame} from '../../../engine/scene';
import {ease, prog} from '../../../engine/util';
import {drawHero} from '../hero';
import {Sky} from '../sky';

/** Estribillo: "We will fly above the sky". La cámara sube atravesando nubes hacia las estrellas. */
export default class Ascend extends Scene {
  sky = new Sky();
  ui = new Layer2D();
  hot = new Layer2D();
  clouds = new FSPass(
    /* glsl */ `
    uniform float t, rise, density, kick;
    varying vec2 vUv;
    void main() {
      vec2 p = vec2(vUv.x * 1.78, vUv.y);
      vec3 c = vec3(0.0);
      float a = 0.0;
      // Tres capas de nubes que bajan más rápido cuanto más cerca (parallax vertical).
      for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float sp = 0.35 + fi * 0.45;
        vec2 q = p * (1.6 - fi * 0.35) + vec2(fi * 7.3, rise * sp);
        float n = fbm(q * 2.0 + vec2(0.0, t * 0.03));
        float d = smoothstep(0.52 - density * 0.12, 0.85, n) * (0.55 + fi * 0.2);
        vec3 lit = mix(vec3(0.05, 0.03, 0.12), vec3(0.75, 0.42, 0.55), smoothstep(0.5, 0.9, n + (1.0 - vUv.y) * 0.25));
        c = mix(c, lit, d * (1.0 - a));
        a = a + d * (1.0 - a);
      }
      // Estelas de velocidad.
      float col = floor(vUv.x * 160.0);
      float h = hash12(vec2(col, 3.0));
      float streak = step(0.93, h) * smoothstep(0.0, 0.1, fract(vUv.y * 0.6 + rise * (1.5 + h) + h)) * (1.0 - smoothstep(0.1, 0.35, fract(vUv.y * 0.6 + rise * (1.5 + h) + h)));
      c += vec3(0.6, 0.7, 1.0) * streak * 0.5 * (0.4 + kick);
      gl_FragColor = vec4(c, clamp(a + streak * 0.3, 0.0, 1.0));
    }`,
    {t: {value: 0}, rise: {value: 0}, density: {value: 1}, kick: {value: 0}},
    THREE.NormalBlending,
  );

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const {renderer} = this.ctx;
    const {t, p, lt} = f;
    const up = prog(p, 0, 1, ease.inOutCubic);
    this.sky.render(renderer, out, {
      t,
      camY: -200 - up * 1500,
      city: 1 - prog(p, 0, 0.25),
      glow: 1.2,
      stars: 0.4 + up * 1.2,
      moon: 0.6 + up * 0.4,
      top: '#070818',
      horizon: '#3a1a52',
    });
    const u = this.clouds.u;
    u.t!.value = t;
    u.rise!.value = lt * 0.22 + up * 1.5;
    u.density!.value = 1 - prog(p, 0.6, 1);
    u.kick!.value = f.a.rms;
    this.clouds.render(renderer, out);

    // El héroe sube por el centro dejando una estela de luz.
    this.ui.clear();
    this.hot.clear();
    const h = this.hot.ctx;
    const hx = 960 + Math.sin(lt * 0.9) * 40;
    const hy = 700 + Math.sin(lt * 1.7) * 12 - prog(lt, 0, 1.2, ease.outCubic) * 60;
    const trail = h.createLinearGradient(hx, hy, hx, 1080);
    trail.addColorStop(0, 'rgba(255,214,150,0.95)');
    trail.addColorStop(1, 'rgba(255,120,80,0)');
    h.fillStyle = trail;
    h.beginPath();
    h.moveTo(hx - 14, hy - 10);
    h.lineTo(hx + 14, hy - 10);
    h.lineTo(hx + 3, 1080);
    h.lineTo(hx - 3, 1080);
    h.fill();
    drawHero(this.ui.ctx, h, hx, hy, 170, {pose: 'fly', t, aura: 0.9 + f.a.vocal * 0.4, wind: 2});
    const {comp} = this.ctx;
    comp.draw(renderer, this.ui.upload(), out);
    comp.draw(renderer, this.hot.upload(), out, {mode: 'add', gain: 2});
    return {bloom: 1.0, vignette: 0.45, zoom: 1 + up * 0.04};
  }
}
