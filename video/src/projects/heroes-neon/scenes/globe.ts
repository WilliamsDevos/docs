import * as THREE from 'three';
import {Scene, type Frame} from '../../../engine/scene';
import {ease, mulberry32, prog, spring} from '../../../engine/util';
import {findLine, findWord} from '../../../songs/heroes-tonight/lyrics';
import {Sky} from '../sky';

// Manchas aproximadas de los continentes: [lat, lon, radio en grados].
const LAND: [number, number, number][] = [
  [52, 10, 14], [60, 30, 14], [45, 25, 10], [40, -4, 7], [54, -2, 4], [64, 15, 8],
  [8, 20, 22], [-12, 25, 16], [25, 10, 14], [24, 45, 11], [20, 78, 11], [50, 70, 22],
  [60, 100, 24], [45, 105, 18], [30, 112, 14], [64, 140, 14], [36, 138, 4], [23.7, 121, 1.8],
  [0, 112, 7], [-6, 140, 6], [-25, 134, 13], [48, -100, 24], [60, -110, 18], [35, -95, 14],
  [68, -80, 12], [20, -100, 8], [72, -40, 11], [-10, -60, 18], [-28, -62, 12], [5, -70, 9],
];
const CITIES = {
  london: [51.5, -0.13],
  paris: [48.86, 2.35],
  berlin: [52.52, 13.4],
  dubai: [25.2, 55.27],
  delhi: [28.6, 77.2],
  taipei: [25.03, 121.56],
  tokyo: [35.68, 139.7],
} as const;

const toVec = (lat: number, lon: number, r = 1) => {
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  return new THREE.Vector3(r * Math.cos(la) * Math.sin(lo), r * Math.sin(la), r * Math.cos(la) * Math.cos(lo));
};

/** Arco de círculo máximo elevado entre dos ciudades. */
function arc(a: readonly [number, number], b: readonly [number, number], n = 96) {
  const va = toVec(a[0], a[1]);
  const vb = toVec(b[0], b[1]);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const p = va.clone().lerp(vb, k).normalize();
    pts.push(p.multiplyScalar(1 + Math.sin(k * Math.PI) * 0.18 * va.distanceTo(vb)));
  }
  return pts;
}

/** Textura de brillo radial para el cometa. */
function glowTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,220,170,0.8)');
  grad.addColorStop(1, 'rgba(255,180,120,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}

/**
 * Pre-estribillo: "I've been flying from town to town, from London to Taiwan, all around the globe,
 * trying to protect your soul". El héroe es un cometa que vuela por las rutas al ritmo exacto de la
 * letra; en "protect" un escudo de luz envuelve el planeta.
 */
export default class Globe extends Scene {
  constructor(private n: number) {
    super();
  }
  comet!: THREE.Sprite;
  timing!: {legs: [number, number][]; spin: [number, number]; shield: number};
  sky = new Sky();
  scene3 = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1920 / 1080, 0.1, 100);
  earth = new THREE.Group();
  arcs: {line: THREE.Line; from: number; to: number}[] = [];
  pins: THREE.Mesh[] = [];
  halo!: THREE.Mesh;

  async init() {
    const rand = mulberry32(5);
    // Puntos en espiral de Fibonacci; se quedan los que caen en tierra.
    const land: number[] = [];
    const sea: number[] = [];
    const N = 16000;
    for (let i = 0; i < N; i++) {
      const y = 1 - (2 * (i + 0.5)) / N;
      const r = Math.sqrt(1 - y * y);
      const th = i * Math.PI * (3 - Math.sqrt(5));
      const v = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r);
      const isLand = LAND.some(([la, lo, rad]) => {
        const d = toVec(la, lo).angleTo(v) * (180 / Math.PI);
        return d < rad * (0.85 + rand() * 0.3);
      });
      (isLand ? land : sea).push(v.x, v.y, v.z);
    }
    const pts = (arr: number[], color: string, size: number, opacity: number) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      return new THREE.Points(g, new THREE.PointsMaterial({color, size, sizeAttenuation: true, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false}));
    };
    this.earth.add(pts(land, '#ffc46b', 0.022, 1));
    this.earth.add(pts(sea.filter((_, i) => Math.floor(i / 3) % 3 === 0), '#5ec8ff', 0.006, 0.35));
    // Esfera oscura que tapa los puntos de la cara oculta.
    this.earth.add(new THREE.Mesh(new THREE.SphereGeometry(0.985, 64, 32), new THREE.MeshBasicMaterial({color: '#05060f'})));

    // Vuelos sincronizados con la letra: tres saltos en "town to town", el gran arco en "London to Taiwan".
    const town = findLine('flying from town', this.n);
    const london = findLine('From London', this.n);
    const globe = findLine('around the globe', this.n);
    const soul = findLine('protect your soul', this.n);
    const tw = (line: typeof town, w: string) => findWord(line, w).start;
    const t0 = tw(town, 'flying');
    const t1 = london.start;
    const third = (t1 - t0) / 3;
    const legs: [keyof typeof CITIES, keyof typeof CITIES, number, number][] = [
      ['paris', 'berlin', t0, t0 + third],
      ['berlin', 'dubai', t0 + third, t0 + third * 2],
      ['dubai', 'delhi', t0 + third * 2, t1],
      ['london', 'taipei', tw(london, 'London'), findWord(london, 'Taiwan').end + 0.2],
      ['taipei', 'tokyo', globe.start, globe.end],
      ['tokyo', 'london', globe.end, soul.start + 0.5],
    ];
    this.timing = {legs: legs.map(([, , a, b]) => [a, b]), spin: [globe.start, globe.end], shield: tw(soul, 'protect')};
    for (const [a, b, from, to] of legs) {
      const g = new THREE.BufferGeometry().setFromPoints(arc(CITIES[a], CITIES[b]));
      const color = a === 'london' ? '#ff4fa3' : '#ffffff';
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({color, transparent: true, blending: THREE.AdditiveBlending}));
      this.earth.add(line);
      this.arcs.push({line, from, to});
    }
    this.comet = new THREE.Sprite(new THREE.SpriteMaterial({map: glowTexture(), color: new THREE.Color(3, 2.4, 1.8), blending: THREE.AdditiveBlending, depthWrite: false}));
    this.comet.scale.setScalar(0.22);
    this.earth.add(this.comet);
    for (const [lat, lon] of Object.values(CITIES)) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), new THREE.MeshBasicMaterial({color: new THREE.Color(3, 2.2, 1.4)}));
      m.position.copy(toVec(lat, lon, 1.005));
      this.pins.push(m);
      this.earth.add(m);
    }
    this.halo = new THREE.Mesh(
      new THREE.RingGeometry(1.08, 1.11, 128),
      new THREE.MeshBasicMaterial({color: new THREE.Color(1.2, 0.6, 2.2), transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide}),
    );
    this.scene3.add(this.earth, this.halo);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const {renderer} = this.ctx;
    const {t, lt} = f;
    this.sky.render(renderer, out, {t, camY: -700, city: 0, glow: 0.5, moon: 0, horizon: '#1a1036'});

    // Giro: muestra Europa, luego Asia, y en "all around the globe" da una vuelta completa.
    const [s0, s1] = this.timing.spin;
    const lead = this.timing.legs[0]![0];
    const spin = prog(t, lead, this.timing.legs[3]![1], ease.inOutCubic) * 1.9 + prog(t, s0, s1, ease.inOutCubic) * Math.PI * 2;
    this.earth.rotation.set(0.35, -0.15 - spin + lt * 0.02, 0);
    const enter = spring(lt, 6, 0.8);
    this.earth.scale.setScalar(0.6 + 0.4 * enter + f.kick * 0.015);
    this.halo.scale.setScalar(this.earth.scale.x);

    // Arcos y cometa: el cometa va en la cabeza del arco que se está trazando.
    let head: THREE.Vector3 | null = null;
    for (const a of this.arcs) {
      const k = prog(t, a.from, a.to, ease.inOutCubic);
      const pos = a.line.geometry.attributes.position!;
      const n = pos.count;
      a.line.geometry.setDrawRange(0, Math.floor(k * n));
      (a.line.material as THREE.LineBasicMaterial).opacity = 1 - prog(t, a.to + 2, a.to + 5) * 0.7;
      if (k > 0 && k < 1) head = new THREE.Vector3().fromBufferAttribute(pos, Math.min(n - 1, Math.floor(k * (n - 1))));
    }
    this.comet.visible = head !== null;
    if (head) this.comet.position.copy(head);
    this.comet.scale.setScalar(0.2 + f.kick * 0.08);

    // "Trying to protect your soul": el escudo.
    (this.halo.material as THREE.MeshBasicMaterial).opacity = prog(t, this.timing.shield, this.timing.shield + 0.4) * (0.6 + f.kick * 0.4);
    this.pins.forEach((p) => p.scale.setScalar(1 + f.kick * 0.8));

    this.camera.position.set(0, 0, 3.6);
    this.camera.lookAt(0, 0, 0);
    renderer.setRenderTarget(out);
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene3, this.camera);
    return {bloom: 1.1, zoom: 1 + f.kick * 0.008, ca: 1.2 + f.kick * 2};
  }
}
