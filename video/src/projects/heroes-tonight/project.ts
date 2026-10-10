import type {Project} from '../../engine/project';
import {DURATION, rhythm} from '../../songs/heroes-tonight/music';
import {TIMELINE} from './timeline';

export const project: Project = {
  id: 'heroes-tonight',
  title: 'Janji – Heroes Tonight (feat. Johnning)',
  duration: DURATION,
  audio: 'audio/heroes-tonight.mp3',
  rhythm,
  timeline: TIMELINE,
};
