import * as THREE from 'three';
import {GLSL_COMMON} from '../../engine/gl';
import {mulberry32} from '../../engine/util';

export type ShellKind = 'peony' | 'ring' | 'willow' | 'crackle';

export type Shell = {
  launch: number; // sale el cohete
  burst: number; // explota (cae sobre el golpe)
  x0: number; // x de salida del cohete
  x: number;
  y: number;
  size: number; // escala del radio
  count: number;
  kind: ShellKind;
  color: string;
  rocket?: boolean;
  implode?: boolean;
};

// speed (px/s), drag, gravedad (px/s²), estela (s), ancho (px), vida (s)
const KINDS: Record<ShellKind, [number, number, number, number, number, number]> = {
  peony: [560, 2.2, 70, 0.1, 5.5, 1.7],
  ring: [500, 2.4, 45, 0.08, 5.5, 1.5],
  willow: [380, 1.3, 150, 0.32, 4.0, 3.0],
  crackle: [660, 3.6, 60, 0.04, 4.0, 0.9],
};

const VERT = /* glsl */ `
${GLSL_COMMON}
uniform float t;
attribute vec4 aShell;  // burst, x, y, size
attribute vec2 aLaunch; // launch, x0
attribute vec4 aDir;    // dx, dy, speed, life
attribute vec4 aParam;  // drag, gravity, trail, width
attribute vec4 aMeta;   // kind (0 estrella, 1 cohete, 2 destello), lado, extremo, semilla
attribute vec3 aColor;
varying vec3 vColor;
varying vec2 vQuad;
varying float vKind;

vec2 starPos(float a) {
  float d = aDir.z * (1.0 - exp(-aParam.x * a)) / aParam.x;
  float g = aShell.w < 0.0 ? 0.0 : aParam.y * a * a;
  return aShell.yz + aDir.xy * d * abs(aShell.w) + vec2(0.0, g);
}

void main() {
  float kind = aMeta.x;
  vec2 head, tail;
  float bright, width = aParam.w, hidden = 0.0;
  if (kind < 0.5) {
    // Implosión: la edad cuenta hacia atrás hasta el instante del estallido.
    float age = aShell.w < 0.0 ? aShell.x - t : t - aShell.x;
    hidden = step(age, 0.0) + step(aDir.w, age);
    float a = max(age, 0.0);
    head = starPos(a);
    tail = aShell.w < 0.0 ? starPos(a + aParam.z) : starPos(max(a - aParam.z, 0.0));
    float life = clamp(age / aDir.w, 0.0, 1.0);
    float flick = 0.65 + 0.35 * step(0.45, hash12(vec2(aMeta.w, floor(t * 30.0))));
    bright = aShell.w < 0.0 ? pow(1.0 - life, 0.6) * flick : pow(1.0 - life, 1.3) * flick * (1.0 + 2.0 * exp(-a / 0.06));
    width *= mix(1.0, 0.45, life);
  } else if (kind < 1.5) {
    float k = (t - aLaunch.x) / (aShell.x - aLaunch.x);
    hidden = step(k, 0.0) + step(1.0, k);
    vec2 from = vec2(aLaunch.y, 1120.0);
    float e = 1.0 - pow(1.0 - clamp(k, 0.0, 1.0), 2.2);
    float e2 = 1.0 - pow(1.0 - clamp(k - 0.1, 0.0, 1.0), 2.2);
    vec2 wob = vec2(sin(k * 18.0 + aMeta.w * 6.0) * 4.0, 0.0);
    head = mix(from, aShell.yz, e) + wob;
    tail = mix(from, aShell.yz, e2) + wob * 0.5;
    bright = 0.9;
  } else {
    float age = t - aShell.x;
    hidden = step(age, 0.0) + step(0.4, age);
    head = aShell.yz;
    tail = aShell.yz;
    bright = exp(-max(age, 0.0) / 0.09) * 0.9;
    width = aParam.w * abs(aShell.w);
  }
  vec2 dir = head - tail;
  float len = length(dir);
  vec2 n = len > 0.001 ? dir / len : vec2(1.0, 0.0);
  vec2 perp = vec2(-n.y, n.x);
  float end = aMeta.z, side = aMeta.y;
  vec2 p = mix(head + n * width * 0.5, tail - n * width * 0.5, end) + perp * side * width * 0.5;
  vQuad = vec2(end, side);
  vColor = aColor * bright;
  vKind = kind;
  gl_Position = hidden > 0.5 ? vec4(2.0, 2.0, 2.0, 1.0) : vec4(p.x / 960.0 - 1.0, 1.0 - p.y / 540.0, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying vec2 vQuad;
varying float vKind;
void main() {
  float a;
  if (vKind > 1.5) {
    vec2 q = vec2(vQuad.x * 2.0 - 1.0, vQuad.y);
    float r = 1.0 - clamp(length(q), 0.0, 1.0);
    a = r * r * r;
  } else {
    a = smoothstep(0.0, 0.8, 1.0 - abs(vQuad.y)) * mix(1.0, 0.15, vQuad.x);
  }
  gl_FragColor = vec4(vColor * a, 1.0);
}`;

type Chunk = {mesh: THREE.Mesh; from: number; to: number};

/**
 * Partículas en GPU: cada chispa es un quad cuya posición es función analítica de t.
 * Un estallido normal sale hacia fuera desde `burst`; con `implode` el tiempo corre al revés
 * y las chispas convergen en el punto justo en `burst` (energía que se concentra).
 */
export class Particles {
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {t: {value: 0}},
    blending: THREE.AdditiveBlending,
    transparent: true,
    // El quad se orienta según el vuelo de cada chispa: puede quedar "de espaldas".
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
  });
  chunks: Chunk[] = [];

  constructor(shells: Shell[], seed = 1) {
    const sorted = [...shells].sort((a, b) => a.burst - b.burst);
    for (let i = 0; i < sorted.length; i += 10) this.chunks.push(this.build(sorted.slice(i, i + 10), seed + i));
  }

  private build(shells: Shell[], seed: number): Chunk {
    const rand = mulberry32(seed);
    const A = {shell: [] as number[], launch: [] as number[], dir: [] as number[], param: [] as number[], meta: [] as number[], color: [] as number[]};
    const index: number[] = [];
    let v = 0;
    let to = 0;
    const quad = (shell: Shell, kind: number, dir: number[], param: number[], color: THREE.Color, s: number) => {
      for (const [side, end] of [[-1, 0], [1, 0], [-1, 1], [1, 1]] as const) {
        A.shell.push(shell.burst, shell.x, shell.y, shell.implode ? -shell.size : shell.size);
        A.launch.push(shell.launch, shell.x0);
        A.dir.push(...dir);
        A.param.push(...param);
        A.meta.push(kind, side, end, s);
        A.color.push(color.r, color.g, color.b);
      }
      index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      v += 4;
    };
    for (const shell of shells) {
      const [speed, drag, grav, trail, width, life] = KINDS[shell.kind];
      const base = new THREE.Color(shell.color);
      const tilt = rand() * Math.PI;
      for (let i = 0; i < shell.count; i++) {
        let dx: number;
        let dy: number;
        if (shell.kind === 'ring') {
          const a = (i / shell.count) * Math.PI * 2;
          const rx = Math.cos(a);
          const ry = Math.sin(a) * 0.45;
          dx = rx * Math.cos(tilt) - ry * Math.sin(tilt);
          dy = rx * Math.sin(tilt) + ry * Math.cos(tilt);
        } else {
          // Dirección uniforme en la esfera proyectada al plano: el centro se ve relleno.
          const z = rand() * 2 - 1;
          const a = rand() * Math.PI * 2;
          const r = Math.sqrt(1 - z * z);
          dx = r * Math.cos(a);
          dy = r * Math.sin(a);
        }
        const sp = speed * (0.82 + rand() * 0.18);
        const lf = life * (0.75 + rand() * 0.35);
        const c = base.clone().multiplyScalar(2.2 + rand() * 1.2);
        if (shell.kind === 'crackle' && rand() < 0.5) c.setRGB(3, 2.8, 2.5);
        quad(shell, 0, [dx, dy, sp, lf], [drag, grav, trail, width], c, rand() * 1000);
        to = Math.max(to, shell.burst + (shell.implode ? 0 : lf));
      }
      if (shell.rocket !== false) {
        quad(shell, 1, [0, 0, 0, 0], [1, 0, 0, 3.5], new THREE.Color(1.6, 1.2, 0.8), rand() * 10);
      }
      quad(shell, 2, [0, 0, 0, 0], [1, 0, 0, 320], base.clone().multiplyScalar(1.5), 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(v * 3), 3));
    g.setAttribute('aShell', new THREE.Float32BufferAttribute(A.shell, 4));
    g.setAttribute('aLaunch', new THREE.Float32BufferAttribute(A.launch, 2));
    g.setAttribute('aDir', new THREE.Float32BufferAttribute(A.dir, 4));
    g.setAttribute('aParam', new THREE.Float32BufferAttribute(A.param, 4));
    g.setAttribute('aMeta', new THREE.Float32BufferAttribute(A.meta, 4));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(A.color, 3));
    g.setIndex(index);
    const mesh = new THREE.Mesh(g, this.material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    const from = Math.min(...shells.map((s) => (s.implode ? s.burst - KINDS[s.kind][5] * 1.1 : s.rocket === false ? s.burst : s.launch)));
    return {mesh, from, to};
  }

  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, t: number) {
    let any = false;
    for (const c of this.chunks) {
      c.mesh.visible = t >= c.from && t <= c.to;
      any ||= c.mesh.visible;
    }
    if (!any) return;
    this.material.uniforms.t!.value = t;
    renderer.setRenderTarget(out);
    renderer.autoClear = false;
    renderer.render(this.scene, this.camera);
  }
}
