import * as THREE from 'three';
import {CLAPS, KICKS, beatAt, hit} from '../music';
import {Compositor, FSPass, H, W, makeRT} from './gl';
import {DEFAULT_POST, Post, type PostParams} from './post';
import type {Frame, Scene} from './scene';

export type Entry = {id: string; start: number; end: number; scene: () => Promise<Scene>};

type Loaded = {entry: Entry; scene: Scene};

/**
 * Motor: dado `t`, renderiza las escenas activas (fundido si se solapan),
 * promedia sub-fotogramas para el desenfoque de movimiento y aplica el post.
 */
export class Engine {
  renderer: THREE.WebGLRenderer;
  comp = new Compositor();
  post = new Post();
  private loaded: Loaded[] = [];
  private sceneRT = makeRT();
  private underRT = makeRT();
  private accumRT = makeRT();
  private mixPass = new FSPass(
    /* glsl */ `uniform sampler2D a, b; uniform float k; varying vec2 vUv;
    void main() { gl_FragColor = vec4(mix(texture2D(a, vUv).rgb, texture2D(b, vUv).rgb, k), 1.0); }`,
    {a: {value: null}, b: {value: null}, k: {value: 0}},
  );
  private accumPass = new FSPass(
    /* glsl */ `uniform sampler2D src; uniform float w; varying vec2 vUv;
    void main() { gl_FragColor = vec4(texture2D(src, vUv).rgb * w, 1.0); }`,
    {src: {value: null}, w: {value: 1}},
    THREE.AdditiveBlending,
  );
  private clearPass = new FSPass(`void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }`);

  constructor(public canvas: HTMLCanvasElement, public fps: number) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(W, H, false);
    this.renderer.toneMapping = THREE.NoToneMapping;
  }

  async load(entries: Entry[]) {
    for (const entry of entries) {
      const scene = await entry.scene();
      scene.ctx = {renderer: this.renderer, comp: this.comp, start: entry.start, end: entry.end, fps: this.fps};
      await scene.init();
      this.loaded.push({entry, scene});
    }
  }

  get duration() {
    return Math.max(...this.loaded.map((l) => l.entry.end));
  }

  private frameAt(t: number, e: Entry): Frame {
    return {
      t,
      lt: t - e.start,
      p: (t - e.start) / (e.end - e.start),
      kick: hit(KICKS, t, 0.09),
      clap: hit(CLAPS, t, 0.07),
      beat: beatAt(t),
    };
  }

  /** Dibuja el instante `t` en `out`; devuelve los ajustes de post de la escena dominante. */
  private renderScenes(t: number, out: THREE.WebGLRenderTarget): Partial<PostParams> {
    const active = this.loaded.filter((l) => t >= l.entry.start && t < l.entry.end);
    if (active.length === 0) {
      this.clearPass.render(this.renderer, out);
      return {};
    }
    const top = active[active.length - 1]!;
    if (active.length === 1) return top.scene.render(this.frameAt(t, top.entry), out) ?? {};
    // Fundido entre dos escenas solapadas.
    const under = active[active.length - 2]!;
    under.scene.render(this.frameAt(t, under.entry), this.underRT);
    const post = top.scene.render(this.frameAt(t, top.entry), this.sceneRT) ?? {};
    const overlapEnd = Math.min(under.entry.end, top.entry.end);
    const k = (t - top.entry.start) / (overlapEnd - top.entry.start);
    this.mixPass.u.a!.value = this.underRT.texture;
    this.mixPass.u.b!.value = this.sceneRT.texture;
    this.mixPass.u.k!.value = k * k * (3 - 2 * k);
    this.mixPass.render(this.renderer, out);
    return post;
  }

  /**
   * Renderiza el fotograma de tiempo `t`. Con `samples` > 1 promedia sub-fotogramas
   * repartidos en `shutter` × (1/fps) alrededor de `t` (desenfoque de movimiento).
   */
  render(t: number, samples = 1, shutter = 0.5) {
    let post: Partial<PostParams> = {};
    if (samples <= 1) {
      post = this.renderScenes(t, this.accumRT);
    } else {
      this.clearPass.render(this.renderer, this.accumRT);
      const span = shutter / this.fps;
      for (let i = 0; i < samples; i++) {
        const st = t + ((i + 0.5) / samples - 0.5) * span;
        const p = this.renderScenes(st, this.sceneRT);
        if (i === Math.floor(samples / 2)) post = p;
        this.accumPass.u.src!.value = this.sceneRT.texture;
        this.accumPass.u.w!.value = 1 / samples;
        this.accumPass.render(this.renderer, this.accumRT);
      }
    }
    const params: PostParams = {...DEFAULT_POST, ...post};
    this.post.render(this.renderer, this.accumRT, params, Math.round(t * this.fps));
  }
}
