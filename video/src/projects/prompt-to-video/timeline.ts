import type {Entry} from '../../engine/project';
import {SECTIONS as S} from './music';

// El montaje: cada escena vive en su sección de la partitura.
// Las que se solapan se funden; las que se tocan son cortes secos sobre el compás.
export const TIMELINE: Entry[] = [
  {id: 'intro', start: S.intro[0], end: S.intro[1], scene: async () => new (await import('./scenes/intro')).default()},
  {id: 'terminal', start: S.terminal[0], end: S.terminal[1], scene: async () => new (await import('./scenes/terminal')).default()},
  {id: 'code', start: S.code[0], end: S.code[1], scene: async () => new (await import('./scenes/code')).default()},
  {id: 'field', start: S.field[0], end: S.field[1], scene: async () => new (await import('./scenes/field')).default()},
  {id: 'stats', start: S.stats[0], end: S.stats[1], scene: async () => new (await import('./scenes/stats')).default()},
  {id: 'outro', start: S.outro[0], end: S.outro[1], scene: async () => new (await import('./scenes/outro')).default()},
];
