import type * as THREE from 'three';
import type {Compositor} from './gl';
import type {PostParams} from './post';

export type Frame = {
  t: number; // tiempo global (s)
  lt: number; // tiempo local desde el inicio de la escena
  p: number; // progreso local 0..1
  kick: number; // envolvente del bombo 0..1
  clap: number;
  beat: number; // índice de tiempo continuo
};

export type SceneContext = {
  renderer: THREE.WebGLRenderer;
  comp: Compositor;
  start: number;
  end: number;
  fps: number;
};

/** Una escena dibuja `out` por completo como función pura de `f.t`. */
export abstract class Scene {
  ctx!: SceneContext;
  async init(): Promise<void> {}
  abstract render(f: Frame, out: THREE.WebGLRenderTarget): Partial<PostParams> | void;
}
