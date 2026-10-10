import type {Scene} from './scene';

export type Entry = {id: string; start: number; end: number; scene: () => Promise<Scene>};

/** Envolventes 0..1 de la música en el instante t. */
export type Audio = {rms: number; low: number; mid: number; high: number; vocal: number};

/** Lo que el motor necesita saber de la música para sincronizar las escenas. */
export type Rhythm = {
  beat(t: number): number; // índice de tiempo continuo (0 en el primer golpe)
  kick(t: number): number; // envolvente del bombo 0..1
  clap(t: number): number; // envolvente de caja/palmas 0..1
  audio?(t: number): Audio;
};

export type Project = {
  id: string;
  title: string;
  duration: number;
  audio: string; // ruta dentro de public/
  rhythm: Rhythm;
  timeline: Entry[];
  overlays?: Entry[]; // capas que se dibujan encima de las escenas (letra, créditos)
};
