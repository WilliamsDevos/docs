import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/800.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import {Engine} from './engine/engine';
import {TIMELINE} from './timeline';

const params = new URLSearchParams(location.search);
const exporting = params.has('export');
const fps = Number(params.get('fps') ?? 30);
const only = params.get('only')?.split(',');

// API que usa scripts/render.ts desde Chromium headless.
const api = {
  ready: false,
  error: '' as string,
  fps,
  duration: 0,
  still(t: number, samples = 1, shutter = 0.5) {
    engine.render(t, samples, shutter);
  },
  png() {
    return canvas.toDataURL('image/png').split(',')[1]!;
  },
};
(window as unknown as {__video: typeof api}).__video = api;

const canvas = document.getElementById('c') as HTMLCanvasElement;
const engine = new Engine(canvas, fps);

async function boot() {
  if (exporting) document.body.classList.add('export');
  await Promise.all(
    ['400 40px Inter', '600 40px Inter', '800 40px Inter', '400 40px "JetBrains Mono"', '700 40px "JetBrains Mono"'].map(
      (f) => document.fonts.load(f, 'aáéíóúñ'),
    ),
  );
  await engine.load(only ? TIMELINE.filter((e) => only.includes(e.id)) : TIMELINE);
  api.duration = engine.duration;
  api.ready = true;
  if (!exporting) preview();
}

function preview() {
  const audio = new Audio('/soundtrack.wav');
  const scrub = document.getElementById('scrub') as HTMLInputElement;
  const label = document.getElementById('time')!;
  scrub.max = String(engine.duration);
  let t = Number(params.get('t') ?? 0);
  let playing = false;
  let last = 0;

  const seek = (to: number) => {
    t = Math.min(engine.duration - 1e-3, Math.max(0, to));
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
      if (t >= engine.duration) {
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
