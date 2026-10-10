import * as THREE from 'three';
import {FSPass, Layer2D} from '../../../engine/gl';
import {Scene, type Frame} from '../../../engine/scene';
import {shakeFrom} from '../../../kit';
import {drawHero} from '../hero';
import {KICKS, barAt} from '../../../songs/heroes-tonight/music';
import {P} from '../palette';

const PALETTES: [string, string][] = [
  ['#5ec8ff', '#ff4fa3'],
  ['#b48cff', '#ffc46b'],
  ['#ff4fa3', '#5ec8ff'],
  ['#ffc46b', '#b48cff'],
];

/**
 * Drops: el héroe vuela a la velocidad de la luz sobre una ciudad de neón.
 * Estelas radiales, suelo de rejilla, una onda expansiva en cada bombo y cambio de color cada 4 compases.
 */
export default class Flight extends Scene {
  ui = new Layer2D();
  hot = new Layer2D();
  warp = new FSPass(
    /* glsl */ `
    uniform float t, speed, kick, travel;
    uniform vec3 colA, colB;
    varying vec2 vUv;
    const float HZ = 600.0;
    void main() {
      vec2 px = vec2(vUv.x * 1920.0, (1.0 - vUv.y) * 1080.0);
      vec2 d = (px - vec2(960.0, 560.0)) / 1080.0;
      float r = length(d);
      float ang = atan(d.y, d.x) / 6.2831853 + 0.5;
      vec3 c = mix(vec3(0.004, 0.003, 0.012), colB * 0.04, smoothstep(0.9, 0.0, r));

      // Estelas: cada sector angular tiene una línea que corre hacia fuera.
      for (int l = 0; l < 2; l++) {
        float bins = l == 0 ? 180.0 : 90.0;
        float id = floor(ang * bins);
        float h = hash12(vec2(id, float(l) * 9.0));
        float s = fract(h * 7.13 + log(r + 0.001) * 0.9 - travel * (0.5 + h) * (l == 0 ? 1.0 : 0.6));
        float len = 0.05 + speed * 0.12;
        float streak = smoothstep(len, 0.0, s) * step(0.55, h);
        float edge = 1.0 - smoothstep(0.0, 0.35, abs(fract(ang * bins) - 0.5) * 2.0 - 0.3);
        c += mix(colA, colB, h) * streak * edge * smoothstep(0.03, 0.3, r) * (1.2 + kick * 1.5);
      }

      // Suelo: rejilla de neón en perspectiva que pasa a toda velocidad.
      if (px.y > HZ) {
        float z = 500.0 / (px.y - HZ);
        float x = (px.x - 960.0) * z / 500.0;
        // Líneas de 1–2 px en pantalla sea cual sea la distancia: el grosor sale de la derivada.
        vec2 g = vec2(x * 0.5, z * 0.25 + travel * 1.5);
        vec2 gd = abs(fract(g) - 0.5) / fwidth(g);
        float line = 1.0 - smoothstep(0.5, 1.8, min(gd.x, gd.y));
        float fade = smoothstep(40.0, 2.0, z) * smoothstep(0.0, 0.25, 1.0 - min(1.0, fwidth(g.y) * 2.0));
        c += colA * line * fade * 0.8 * (1.0 + kick);
        // Edificios bajos a los lados con ventanas, pasando.
        float side = step(2.5, abs(x));
        vec2 cell = floor(vec2(x * 3.0, z * 2.0 + travel * 6.0));
        float lit = step(0.8, hash12(cell));
        c = mix(c, vec3(0.01, 0.008, 0.02) + colB * lit * 0.6 * fade, side * fade);
      }
      c += colB * 0.25 * exp(-pow((px.y - HZ) / 30.0, 2.0)); // horizonte encendido
      gl_FragColor = vec4(c, 1.0);
    }`,
    {
      t: {value: 0},
      speed: {value: 1},
      kick: {value: 0},
      travel: {value: 0},
      colA: {value: new THREE.Color()},
      colB: {value: new THREE.Color()},
    },
  );

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const {renderer, comp} = this.ctx;
    const {t, lt} = f;
    const b = barAt(t);
    const pal = PALETTES[Math.floor(b / 4) % PALETTES.length]!;
    const u = this.warp.u;
    u.t!.value = t;
    u.kick!.value = f.kick;
    u.speed!.value = 0.6 + f.a.low * 0.6;
    // Distancia recorrida: velocidad base más un empujón en cada bombo.
    const pushes = KICKS.filter((k) => k <= t && k >= this.ctx.start).length;
    u.travel!.value = lt * 0.35 + pushes * 0.06 + (1 - f.kick) * 0.06;
    (u.colA!.value as THREE.Color).set(pal[0]);
    (u.colB!.value as THREE.Color).set(pal[1]);
    this.warp.render(renderer, out);

    this.ui.clear();
    this.hot.clear();
    const h = this.hot.ctx;
    // Ondas expansivas: una por bombo, desde el héroe.
    const hx = 960 + Math.sin(lt * 1.3) * 60;
    const hy = 640 + Math.sin(lt * 2.1) * 18;
    for (const k of KICKS) {
      const age = t - k;
      if (age < 0 || age > 0.6 || k < this.ctx.start) continue;
      const q = age / 0.6;
      h.globalAlpha = (1 - q) * 0.9;
      h.strokeStyle = pal[0];
      h.lineWidth = 6 * (1 - q) + 1;
      h.beginPath();
      h.ellipse(hx, hy - 60, 60 + q * 900, 25 + q * 380, 0, 0, Math.PI * 2);
      h.stroke();
    }
    h.globalAlpha = 1;
    drawHero(this.ui.ctx, h, hx, hy, 200, {pose: 'fly', t, aura: 1 + f.kick * 0.6, color: pal[0] === '#ffc46b' ? P.gold : pal[0], wind: 3});

    comp.draw(renderer, this.ui.upload(), out);
    comp.draw(renderer, this.hot.upload(), out, {mode: 'add', gain: 2});

    return {
      bloom: 1.3,
      shake: shakeFrom(f.kick, t, 8),
      ca: 1.5 + f.kick * 6,
      zoom: 1 + f.kick * 0.025,
      flash: 0.95 * Math.exp(-lt / 0.2),
    };
  }
}
