import * as THREE from 'three';
import {FSPass, H, W, makeRT} from './gl';

export type PostParams = {
  exposure: number;
  bloom: number;
  bloomThreshold: number;
  ca: number; // aberración cromática, en px en los bordes
  grain: number;
  vignette: number;
  flash: number; // 0..1 hacia blanco cálido
  fade: number; // 0..1 hacia negro
  zoom: number;
  shake: [number, number]; // px
};

export const DEFAULT_POST: PostParams = {
  exposure: 1,
  bloom: 0.8,
  bloomThreshold: 0.75,
  ca: 1.2,
  grain: 0.05,
  vignette: 0.35,
  flash: 0,
  fade: 0,
  zoom: 1,
  shake: [0, 0],
};

const MIPS = 4;

/** Bloom por pirámide de desenfoques + pasada final (tono, viñeta, grano, CA). */
export class Post {
  private bright = new FSPass(
    /* glsl */ `
    uniform sampler2D src; uniform float threshold;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(src, vUv).rgb;
      float l = max(c.r, max(c.g, c.b));
      float k = smoothstep(threshold, threshold + 0.5, l);
      gl_FragColor = vec4(c * k, 1.0);
    }`,
    {src: {value: null}, threshold: {value: 1}},
  );
  private copy = new FSPass(
    /* glsl */ `uniform sampler2D src; varying vec2 vUv;
    void main() { gl_FragColor = vec4(texture2D(src, vUv).rgb, 1.0); }`,
    {src: {value: null}},
  );
  private blur = new FSPass(
    /* glsl */ `
    uniform sampler2D src; uniform vec2 dir;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(src, vUv).rgb * 0.227027;
      c += texture2D(src, vUv + dir * 1.3846).rgb * 0.316216;
      c += texture2D(src, vUv - dir * 1.3846).rgb * 0.316216;
      c += texture2D(src, vUv + dir * 3.2308).rgb * 0.070270;
      c += texture2D(src, vUv - dir * 3.2308).rgb * 0.070270;
      gl_FragColor = vec4(c, 1.0);
    }`,
    {src: {value: null}, dir: {value: new THREE.Vector2()}},
  );
  private final = new FSPass(
    /* glsl */ `
    uniform sampler2D src, b0, b1, b2, b3;
    uniform float exposure, bloom, ca, grain, vignette, flash, fade, zoom, frame;
    uniform vec2 shake;
    varying vec2 vUv;
    vec3 aces(vec3 x) {
      return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
    }
    void main() {
      vec2 res = vec2(${W}.0, ${H}.0);
      vec2 uv = (vUv - 0.5) / zoom + 0.5 + shake / res;
      vec2 d = (uv - 0.5);
      vec2 off = d * dot(d, d) * ca * 4.0 / res;
      vec3 c;
      c.r = texture2D(src, uv + off).r;
      c.g = texture2D(src, uv).g;
      c.b = texture2D(src, uv - off).b;
      vec3 bl = texture2D(b0, uv).rgb * 0.5 + texture2D(b1, uv).rgb * 0.8
              + texture2D(b2, uv).rgb * 1.1 + texture2D(b3, uv).rgb * 1.4;
      c += bl * bloom * 0.35;
      c *= exposure;
      c = aces(c);
      float v = smoothstep(1.25, 0.25, length(d * vec2(1.0, 0.8)) * 1.6);
      c *= mix(1.0, v, vignette);
      vec3 srgb = toSRGB(c);
      // El destello se mezcla en espacio de pantalla para que decaiga como se percibe.
      srgb = mix(srgb, vec3(1.0, 0.95, 0.9), flash);
      float g = hash12(gl_FragCoord.xy + frame * 17.31) - 0.5;
      srgb += g * grain * (1.0 - srgb * 0.6);
      srgb += (hash12(gl_FragCoord.yx + frame) - 0.5) / 255.0;
      srgb *= 1.0 - fade;
      gl_FragColor = vec4(srgb, 1.0);
    }`,
    {
      src: {value: null},
      b0: {value: null},
      b1: {value: null},
      b2: {value: null},
      b3: {value: null},
      exposure: {value: 1},
      bloom: {value: 1},
      ca: {value: 1},
      grain: {value: 0},
      vignette: {value: 0},
      flash: {value: 0},
      fade: {value: 0},
      zoom: {value: 1},
      frame: {value: 0},
      shake: {value: new THREE.Vector2()},
    },
  );
  private mips = Array.from({length: MIPS}, (_, i) => makeRT(W >> (i + 1), H >> (i + 1)));
  private tmps = Array.from({length: MIPS}, (_, i) => makeRT(W >> (i + 1), H >> (i + 1)));

  render(renderer: THREE.WebGLRenderer, src: THREE.WebGLRenderTarget, p: PostParams, frame: number) {
    this.bright.u.src!.value = src.texture;
    this.bright.u.threshold!.value = p.bloomThreshold;
    this.bright.render(renderer, this.mips[0]!);
    for (let i = 0; i < MIPS; i++) {
      const rt = this.mips[i]!;
      const tmp = this.tmps[i]!;
      if (i > 0) {
        this.copy.u.src!.value = this.mips[i - 1]!.texture;
        this.copy.render(renderer, rt);
      }
      for (const [x, y, from, to] of [
        [1, 0, rt, tmp],
        [0, 1, tmp, rt],
      ] as const) {
        this.blur.u.src!.value = from.texture;
        (this.blur.u.dir!.value as THREE.Vector2).set(x / rt.width, y / rt.height);
        this.blur.render(renderer, to);
      }
    }
    const u = this.final.u;
    u.src!.value = src.texture;
    this.mips.forEach((m, i) => (u[`b${i}`]!.value = m.texture));
    u.exposure!.value = p.exposure;
    u.bloom!.value = p.bloom;
    u.ca!.value = p.ca;
    u.grain!.value = p.grain;
    u.vignette!.value = p.vignette;
    u.flash!.value = p.flash;
    u.fade!.value = p.fade;
    u.zoom!.value = p.zoom;
    u.frame!.value = frame;
    (u.shake!.value as THREE.Vector2).set(p.shake[0], -p.shake[1]);
    this.final.render(renderer, null);
  }
}
