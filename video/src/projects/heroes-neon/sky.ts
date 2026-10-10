import * as THREE from 'three';
import {FSPass} from '../../engine/gl';

/**
 * Cielo nocturno: degradado, estrellas, luna y una ciudad procedural en tres capas con parallax.
 * Todo en un único fragment shader, función de los uniforms.
 */
export class Sky {
  pass = new FSPass(
    /* glsl */ `
    uniform float t, camY, city, scroll, kick, glow, stars, moon, base, clock, hands, sun;
    uniform vec3 top, horizon;
    varying vec2 vUv;

    float building(vec2 px, float layer, float w, float hMin, float hMax, float base) {
      float i = floor(px.x / w);
      float h = mix(hMin, hMax, pow(hash12(vec2(i, layer)), 1.6));
      float spire = step(0.86, hash12(vec2(i, layer + 7.0))) * step(abs(fract(px.x / w) - 0.5), 0.04) * 60.0;
      return step(base - h - spire, px.y);
    }

    float windows(vec2 px, float layer, float w) {
      vec2 cell = floor(px / vec2(14.0, 18.0));
      vec2 f = fract(px / vec2(14.0, 18.0));
      float on = step(0.72, hash12(cell + layer * 31.0));
      float flick = step(0.04, hash12(cell + floor(t * 0.5 + hash12(cell) * 10.0)));
      float shape = step(0.25, f.x) * step(f.x, 0.75) * step(0.25, f.y) * step(f.y, 0.7);
      float edge = step(0.12, fract(px.x / w)) * step(fract(px.x / w), 0.88);
      return on * flick * shape * edge;
    }

    void main() {
      vec2 px = vec2(vUv.x * 1920.0, (1.0 - vUv.y) * 1080.0);
      float sy = px.y + camY;               // coordenada vertical del mundo
      float k = clamp(sy / 1080.0, -2.0, 1.0);
      vec3 c = mix(top, horizon, smoothstep(-0.2, 1.0, k));
      c += horizon * 0.25 * glow * exp(-pow((base - sy) / 300.0, 2.0));

      // Estrellas en dos tamaños, con titileo.
      for (int l = 0; l < 2; l++) {
        float sz = l == 0 ? 3.0 : 7.0;
        vec2 g = vec2(px.x, sy * 0.6) / sz;
        vec2 id = floor(g);
        float h = hash12(id + float(l) * 17.0);
        float thr = l == 0 ? 0.985 : 0.997;
        if (h > thr) {
          vec2 o = vec2(hash12(id + 3.1), hash12(id + 5.7)) - 0.5;
          float d = length(fract(g) - 0.5 - o * 0.5);
          float tw = 0.6 + 0.4 * sin(t * (2.0 + h * 5.0) + h * 40.0);
          c += vec3(0.8, 0.85, 1.0) * smoothstep(0.35, 0.0, d) * tw * stars * (l == 0 ? 0.5 : 1.4) * smoothstep(1.1, 0.4, k);
        }
      }

      // Luna; con "clock" se convierte en una esfera de reloj cuyas agujas saltan en cada tiempo.
      float mr = mix(44.0, 78.0, clock);
      vec2 mp = vec2(1480.0, 230.0 - camY * 0.15);
      vec2 mq = px - mp;
      float md = length(mq);
      vec3 moonCol = vec3(1.0, 0.92, 0.8) * (smoothstep(mr + 2.0, mr, md) * 0.7 + 0.08 * exp(-md / (mr * 2.0)));
      if (clock > 0.0) {
        float ang = atan(mq.x, -mq.y);
        float tick = smoothstep(0.06, 0.0, abs(fract(ang / 6.2831853 * 12.0 + 0.5) - 0.5)) * step(mr * 0.78, md) * step(md, mr * 0.92);
        vec2 hm = vec2(sin(hands), -cos(hands));
        vec2 hh = vec2(sin(hands / 12.0 + 1.0), -cos(hands / 12.0 + 1.0));
        float lm = smoothstep(3.0, 1.5, abs(dot(mq, vec2(-hm.y, hm.x)))) * step(0.0, dot(mq, hm)) * step(dot(mq, hm), mr * 0.8);
        float lh = smoothstep(4.0, 2.0, abs(dot(mq, vec2(-hh.y, hh.x)))) * step(0.0, dot(mq, hh)) * step(dot(mq, hh), mr * 0.5);
        float ink = max(max(tick, lm), lh) * clock;
        moonCol = mix(moonCol, vec3(0.05, 0.03, 0.09), ink * step(md, mr));
      }
      c += moonCol * moon;

      // Sol del amanecer, detrás de la ciudad.
      if (sun > 0.0) {
        vec2 sp = vec2(960.0, base - 60.0 + (1.0 - sun) * 260.0);
        float sd = length(px - sp);
        c += vec3(1.0, 0.55, 0.25) * sun * (smoothstep(132.0, 128.0, sd) * 2.2 + 0.6 * exp(-sd / 260.0));
      }

      // Ciudad: tres capas, la de delante más oscura y más rápida.
      if (city > 0.0) {
        for (int l = 0; l < 3; l++) {
          float fl = float(l);
          float par = 0.3 + fl * 0.35;
          vec2 bp = vec2(px.x + scroll * par, sy - (1.0 - city) * 500.0 + (1080.0 - base) * (0.6 + fl * 0.2));
          float w = 70.0 - fl * 12.0;
          float b = building(bp, fl, w, 120.0 - fl * 40.0, 420.0 - fl * 120.0, 1080.0);
          vec3 bc = mix(vec3(0.010, 0.012, 0.03), vec3(0.002, 0.002, 0.006), fl / 2.0);
          float win = windows(bp, fl, w) * b;
          bc += vec3(1.0, 0.62, 0.25) * win * (0.55 - fl * 0.12) * (1.0 + kick * 0.6);
          c = mix(c, bc, b);
        }
      }
      gl_FragColor = vec4(c, 1.0);
    }`,
    {
      t: {value: 0},
      camY: {value: 0},
      city: {value: 1},
      scroll: {value: 0},
      kick: {value: 0},
      glow: {value: 1},
      stars: {value: 1},
      moon: {value: 1},
      base: {value: 1080},
      clock: {value: 0},
      sun: {value: 0},
      hands: {value: 0},
      top: {value: new THREE.Color('#05060f')},
      horizon: {value: new THREE.Color('#2a1640')},
    },
  );

  render(
    renderer: THREE.WebGLRenderer,
    out: THREE.WebGLRenderTarget,
    o: {t: number; camY?: number; city?: number; scroll?: number; kick?: number; glow?: number; stars?: number; moon?: number; base?: number; clock?: number; hands?: number; sun?: number; top?: string; horizon?: string},
  ) {
    const u = this.pass.u;
    u.t!.value = o.t;
    u.camY!.value = o.camY ?? 0;
    u.city!.value = o.city ?? 1;
    u.scroll!.value = o.scroll ?? o.t * 30;
    u.kick!.value = o.kick ?? 0;
    u.glow!.value = o.glow ?? 1;
    u.stars!.value = o.stars ?? 1;
    u.moon!.value = o.moon ?? 1;
    u.base!.value = o.base ?? 1080;
    u.clock!.value = o.clock ?? 0;
    u.hands!.value = o.hands ?? 0;
    u.sun!.value = o.sun ?? 0;
    if (o.top) (u.top!.value as THREE.Color).set(o.top);
    if (o.horizon) (u.horizon!.value as THREE.Color).set(o.horizon);
    this.pass.render(renderer, out);
  }
}
