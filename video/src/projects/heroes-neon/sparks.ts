// Programa de partículas: energía que converge en el héroe en las subidas y la dinamita de la estrofa 2.
import {mulberry32} from '../../engine/util';
import {findLine, findWord} from '../../songs/heroes-tonight/lyrics';
import {Particles, type Shell} from './particles';
import {BEAT, SECTIONS, bar} from '../../songs/heroes-tonight/music';

/** Núcleo de energía del héroe durante las subidas (pecho de la silueta). */
export const CORE = {x: 960, y: 760};

/** La mecha: curva de abajo a la izquierda hasta arriba a la derecha (0..1 → px). */
export function fusePoint(k: number): [number, number] {
  const p0 = [80, 960];
  const p1 = [700, 1100];
  const p2 = [700, 250];
  const p3 = [1380, 330];
  const u = 1 - k;
  const x = u * u * u * p0[0]! + 3 * u * u * k * p1[0]! + 3 * u * k * k * p2[0]! + k * k * k * p3[0]!;
  const y = u * u * u * p0[1]! + 3 * u * u * k * p1[1]! + 3 * u * k * k * p2[1]! + k * k * k * p3[1]!;
  return [x, y];
}

const dynamite = findLine('dynamite');
const explodeLine = findLine('explode');
export const FUSE = {start: dynamite.start, explode: findWord(explodeLine, 'explode').start};

function schedule(): Shell[] {
  const r = mulberry32(99);
  const shells: Shell[] = [];
  const COLORS = ['#ffc46b', '#5ec8ff', '#ff4fa3', '#b48cff'];

  // Subidas: en cada tiempo una oleada de chispas llega al núcleo; cada vez más seguidas.
  for (const [b0, b1] of [SECTIONS.build1, SECTIONS.build2]) {
    for (let b = b0; b < b1; b++) {
      const k = (b - b0) / (b1 - b0);
      const step = k < 0.5 ? 1 : k < 0.85 ? 0.5 : 0.25;
      for (let q = 0; q < 4; q += step) {
        shells.push({
          launch: 0, burst: bar(b) + q * BEAT, x0: CORE.x, x: CORE.x, y: CORE.y,
          size: 1.4 + k * 0.8, count: Math.round(28 + k * 40), kind: 'peony', color: COLORS[Math.floor(r() * 4)]!,
          rocket: false, implode: true,
        });
      }
    }
  }

  // Mecha: chispitas que saltan de la cabeza en cada medio tiempo.
  for (let t = FUSE.start; t < FUSE.explode; t += BEAT / 2) {
    const [x, y] = fusePoint((t - FUSE.start) / (FUSE.explode - FUSE.start));
    shells.push({launch: 0, burst: t, x0: x, x, y, size: 0.22, count: 14, kind: 'crackle', color: '#ffc46b', rocket: false});
  }
  // ¡Boom!
  const [ex, ey] = fusePoint(1);
  shells.push({launch: 0, burst: FUSE.explode, x0: ex, x: ex, y: ey, size: 2.2, count: 220, kind: 'crackle', color: '#ffffff', rocket: false});
  shells.push({launch: 0, burst: FUSE.explode, x0: ex, x: ex, y: ey, size: 1.7, count: 140, kind: 'peony', color: '#ff7a3d', rocket: false});
  shells.push({launch: 0, burst: FUSE.explode + BEAT, x0: ex, x: ex, y: ey, size: 1.5, count: 110, kind: 'willow', color: '#ffc46b', rocket: false});
  return shells;
}

let shared: Particles | undefined;
/** Una sola instancia (geometría en GPU) compartida por las escenas. */
export const particles = () => (shared ??= new Particles(schedule(), 11));
