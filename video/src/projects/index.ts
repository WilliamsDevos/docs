import type {Project} from '../engine/project';

// Registro de videos. Cada uno vive en su carpeta con su música, montaje y escenas.
export const PROJECTS: Record<string, () => Promise<Project>> = {
  'prompt-to-video': async () => (await import('./prompt-to-video/project')).project,
  'heroes-tonight': async () => (await import('./heroes-tonight/project')).project,
  'heroes-neon': async () => (await import('./heroes-neon/project')).project,
};

export const DEFAULT_PROJECT = 'prompt-to-video';
