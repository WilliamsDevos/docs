import type {Entry} from '../../engine/project';
import {LINES} from '../../songs/heroes-tonight/lyrics';
import {DURATION, bar} from '../../songs/heroes-tonight/music';

// Cortes secos: cada plato empieza un poco antes de su primera frase (la anticipación del karaoke)
// o en el compás de un drop. Índices de LINES: ver songs/heroes-tonight/lyrics.json.
const before = (i: number) => LINES[i]!.start - 0.45;
const cut = {
  verse1: before(0),
  pre1: before(4),
  chorus1: before(8),
  chorus1b: before(11),
  drop1: bar(36),
  verse2: before(15),
  pre2: before(19),
  chorus2: before(23),
  build2: before(29),
  drop2: bar(84),
  chorus3: before(31),
  outro: before(34),
};

const S = (load: () => Promise<{default: new (...a: never[]) => unknown}>, ...args: unknown[]) => async () =>
  new ((await load()).default as new (...a: unknown[]) => import('../../engine/scene').Scene)(...args);

export const TIMELINE: Entry[] = [
  {id: 'title', start: 0, end: cut.verse1, scene: S(() => import('./scenes/title'))},
  {id: 'walk', start: cut.verse1, end: cut.pre1, scene: S(() => import('./scenes/walk'))},
  {id: 'atlas', start: cut.pre1, end: cut.chorus1, scene: S(() => import('./scenes/atlas'), 0)},
  {id: 'hook1', start: cut.chorus1, end: cut.chorus1b, scene: S(() => import('./scenes/hook'), 'clean')},
  {id: 'hook2', start: cut.chorus1b, end: cut.drop1, scene: S(() => import('./scenes/hook'), 'stack')},
  {id: 'drop1', start: cut.drop1, end: cut.verse2, scene: S(() => import('./scenes/pressure'))},
  {id: 'dynamite', start: cut.verse2, end: cut.pre2, scene: S(() => import('./scenes/dynamite'))},
  {id: 'atlas2', start: cut.pre2, end: cut.chorus2, scene: S(() => import('./scenes/atlas'), 1)},
  {id: 'hook3', start: cut.chorus2, end: cut.build2, scene: S(() => import('./scenes/hook'), 'quiet')},
  {id: 'build2', start: cut.build2, end: cut.drop2, scene: S(() => import('./scenes/pressure'), true)},
  {id: 'drop2', start: cut.drop2, end: cut.chorus3, scene: S(() => import('./scenes/pressure'))},
  {id: 'hook4', start: cut.chorus3, end: cut.outro, scene: S(() => import('./scenes/hook'), 'max')},
  {id: 'outro', start: cut.outro, end: DURATION, scene: S(() => import('./scenes/outro'))},
];
