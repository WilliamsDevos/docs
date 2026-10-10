import type {Entry} from '../../engine/project';
import {BEAT, DURATION, bar} from './music';

// Montaje "Héroe de luz": una escena por sección. Fundidos de un tiempo en las partes tranquilas,
// cortes secos en los drops (el destello del drop tapa el corte).
const fade = BEAT;
const at = (b: number) => bar(b);
export const TIMELINE: Entry[] = [
  {id: 'night', start: 0, end: at(12) + fade, scene: async () => new (await import('./scenes/night')).default()},
  {id: 'globe', start: at(12), end: at(20) + fade, scene: async () => new (await import('./scenes/globe')).default(0)},
  {id: 'ascend', start: at(20), end: at(28) + fade, scene: async () => new (await import('./scenes/ascend')).default()},
  {id: 'charge', start: at(28), end: at(36), scene: async () => new (await import('./scenes/charge')).default()},
  {id: 'flight', start: at(36), end: at(44), scene: async () => new (await import('./scenes/flight')).default()},
  {id: 'fuse', start: at(44), end: at(52), scene: async () => new (await import('./scenes/fuse')).default()},
  {id: 'globe2', start: at(52), end: at(60) + fade, scene: async () => new (await import('./scenes/globe')).default(1)},
  {id: 'ascend2', start: at(60), end: at(76) + fade, scene: async () => new (await import('./scenes/ascend')).default()},
  {id: 'charge2', start: at(76), end: at(84), scene: async () => new (await import('./scenes/charge')).default()},
  {id: 'flight2', start: at(84), end: at(100) + fade, scene: async () => new (await import('./scenes/flight')).default()},
  {id: 'dawn', start: at(100), end: DURATION, scene: async () => new (await import('./scenes/dawn')).default()},
];

export const OVERLAYS: Entry[] = [
  {id: 'lyrics', start: 0, end: DURATION, scene: async () => new (await import('./scenes/lyrics')).default()},
];
