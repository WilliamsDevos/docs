import * as THREE from 'three';

export const W = 1920;
export const H = 1080;

// Cabecera común de los shaders: paleta (lineal), ruido y utilidades.
export const GLSL_COMMON = /* glsl */ `
const vec3 C_INK = vec3(0.0048, 0.0042, 0.0034);
const vec3 C_PAPER = vec3(0.90, 0.86, 0.79);
const vec3 C_ACCENT = vec3(0.75, 0.19, 0.084);
const vec3 C_BLUE = vec3(0.22, 0.51, 0.92);
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x),
             mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
`;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const quad = new THREE.PlaneGeometry(2, 2);
const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

export type Uniforms = Record<string, THREE.IUniform>;

/** Pasada de pantalla completa con un fragment shader propio. */
export class FSPass {
  material: THREE.ShaderMaterial;
  private scene = new THREE.Scene();
  constructor(frag: string, uniforms: Uniforms = {}, blending: THREE.Blending = THREE.NoBlending) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: GLSL_COMMON + frag,
      uniforms,
      blending,
      depthTest: false,
      depthWrite: false,
      transparent: blending !== THREE.NoBlending,
    });
    this.scene.add(new THREE.Mesh(quad, this.material));
  }
  get u() {
    return this.material.uniforms;
  }
  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null) {
    renderer.setRenderTarget(target);
    renderer.autoClear = false;
    renderer.render(this.scene, orthoCam);
  }
}

export const makeRT = (w = W, h = H) =>
  new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });

/** Capa Canvas2D de 1920×1080 que se sube como textura sRGB. */
export class Layer2D {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  constructor(public w = W, public h = H) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
  }
  clear() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.w, this.h);
  }
  upload() {
    this.texture.needsUpdate = true;
    return this.texture;
  }
}

/** Compone una textura sobre un destino ("over" o aditivo), con ganancia para que brille. */
export class Compositor {
  private over = new FSPass(
    /* glsl */ `
    uniform sampler2D tex; uniform float gain; uniform float opacity;
    varying vec2 vUv;
    void main() { vec4 c = texture2D(tex, vUv); gl_FragColor = vec4(c.rgb * gain, c.a * opacity); }`,
    {tex: {value: null}, gain: {value: 1}, opacity: {value: 1}},
    THREE.NormalBlending,
  );
  private additive = new FSPass(
    /* glsl */ `
    uniform sampler2D tex; uniform float gain; uniform float opacity;
    varying vec2 vUv;
    void main() { vec4 c = texture2D(tex, vUv); gl_FragColor = vec4(c.rgb * c.a * gain * opacity, 1.0); }`,
    {tex: {value: null}, gain: {value: 1}, opacity: {value: 1}},
    THREE.AdditiveBlending,
  );
  draw(
    renderer: THREE.WebGLRenderer,
    tex: THREE.Texture,
    target: THREE.WebGLRenderTarget,
    opts: {gain?: number; opacity?: number; mode?: 'over' | 'add'} = {},
  ) {
    const pass = opts.mode === 'add' ? this.additive : this.over;
    pass.u.tex!.value = tex;
    pass.u.gain!.value = opts.gain ?? 1;
    pass.u.opacity!.value = opts.opacity ?? 1;
    pass.render(renderer, target);
  }
}

/** Convierte un color CSS #rrggbb a lineal (para uniforms). */
export function linear(hex: string): THREE.Vector3 {
  const c = new THREE.Color(hex);
  return new THREE.Vector3(c.r, c.g, c.b);
}
