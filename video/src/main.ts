import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/800.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import {Engine} from './engine/engine';
import type {Project} from './engine/project';
import {DEFAULT_PROJECT, PROJECTS} from './projects';

const params = new URLSearchParams(location.search);
const exporting = params.has('export');
const fps = Number(params.get('fps') ?? 30);
const only = params.get('only')?.split(',');
const projectId = params.get('project') ?? DEFAULT_PROJECT;

// API que usa scripts/render.ts desde Chromium headless.
const api = {
  ready: false,
  error: '' as string,
  fps,
  duration: 0,
  audio: '',
  still(t: number, samples = 1, shutter = 0.5) {
    engine.render(t, samples, shutter);
  },
  png() {
    return canvas.toDataURL('image/png').split(',')[1]!;
  },
  /** JPEG de alta calidad: bastante más rápido de codificar que PNG (útil con GPU). */
  jpeg(quality = 0.95) {
    return canvas.toDataURL('image/jpeg', quality).split(',')[1]!;
  },
  /** Para depurar desde la consola o desde playwright. */
  get engine() {
    return engine;
  },
};
(window as unknown as {__video: typeof api}).__video = api;

const canvas = document.getElementById('c') as HTMLCanvasElement;
let engine: Engine;
let project: Project;

async function boot() {
  if (exporting) document.body.classList.add('export');
  await Promise.all(
    ['400 40px Inter', '600 40px Inter', '800 40px Inter', '400 40px "JetBrains Mono"', '700 40px "JetBrains Mono"', '800 40px "Archivo Variable"', '40px "Instrument Serif"', 'italic 40px "Instrument Serif"'].map(
      (f) => document.fonts.load(f, 'aáéíóúñ'),
    ),
  );
  const load = PROJECTS[projectId];
  if (!load) throw new Error(`proyecto desconocido: ${projectId} (hay: ${Object.keys(PROJECTS).join(', ')})`);
  project = await load();
  document.title = project.title;
  engine = new Engine(canvas, fps, project.rhythm);
  await engine.load(
    only ? project.timeline.filter((e) => only.includes(e.id)) : project.timeline,
    params.has('nooverlay') ? [] : project.overlays,
  );
  api.duration = project.duration;
  api.audio = project.audio;
  api.ready = true;
  if (!exporting) preview();
}

function preview() {
  const audio = new Audio(`/${project.audio}`);
  const scrub = document.getElementById('scrub') as HTMLInputElement;
  const label = document.getElementById('time')!;
  scrub.max = String(project.duration);
  let t = Number(params.get('t') ?? 0);
  let playing = false;
  let last = 0;

  const seek = (to: number) => {
    t = Math.min(project.duration - 1e-3, Math.max(0, to));
    audio.currentTime = t;
  };
  const toggle = () => {
    playing = !playing;
    if (playing) {
      audio.currentTime = t;
      void audio.play().catch(() => {});
    } else audio.pause();
  };
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === ' ') toggle();
    else if (e.key === 'ArrowLeft') seek(t - (e.shiftKey ? 5 : 1));
    else if (e.key === 'ArrowRight') seek(t + (e.shiftKey ? 5 : 1));
    else if (e.key === ',') seek(t - 1 / fps);
    else if (e.key === '.') seek(t + 1 / fps);
    else if (e.key === 'h') document.getElementById('ui')!.hidden = !document.getElementById('ui')!.hidden;
    else return;
    e.preventDefault();
  });
  scrub.addEventListener('input', () => seek(Number(scrub.value)));

  const loop = (now: number) => {
    if (playing) {
      // El audio manda el reloj para que imagen y sonido no se separen.
      t = audio.paused ? t + (now - last) / 1000 : audio.currentTime;
      if (t >= project.duration) {
        t = 0;
        audio.currentTime = 0;
      }
    }
    last = now;
    engine.render(t);
    label.textContent = t.toFixed(2);
    scrub.value = String(t);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

boot().catch((e: unknown) => {
  api.error = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
  console.error(e);
});
