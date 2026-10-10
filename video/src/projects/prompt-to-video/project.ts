import type {Project} from '../../engine/project';
import {DURATION, rhythm} from './music';
import {TIMELINE} from './timeline';

export const project: Project = {
  id: 'prompt-to-video',
  title: 'Prompt → Video',
  duration: DURATION,
  audio: 'soundtrack.wav',
  rhythm,
  timeline: TIMELINE,
};
