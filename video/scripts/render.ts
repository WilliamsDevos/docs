#!/usr/bin/env bun
// Render offline: abre la app en Chromium headless (?export=1), pide cada fotograma
// a window.__video y lo envía a ffmpeg junto con la banda sonora.
//
//   bun scripts/render.ts stills --t 1.5,8,23 [--only intro,code] [--out out/stills]
//   bun scripts/render.ts sheet  [--from 0] [--to 40] [--n 24] [--cols 6] [--out out/sheet.png]
//   bun scripts/render.ts video  [--from 0] [--to 40] [--fps 30] [--samples 1] [--shutter 0.5] [--crf 18] [--out out/video.mp4]
//                                [--workers N] [--encoder x264|amf|nvenc|qsv] [--qp 18] [--jpeg]
//
// Opciones comunes: --project <id> (por defecto prompt-to-video), --chrome <ruta> (o CHROME_PATH),
// --angle <d3d11|metal|vulkan|gl> (backend de GPU de Chrome), --headed (ventana visible, por si el
// driver no acelera en modo oculto), --swiftshader (WebGL por CPU, para contenedores sin GPU),
// --url <servidor vite ya arrancado>.
//
// Con GPU el cuello de botella es convertir cada fotograma en imagen y codificarlo:
//   --workers N   N pestañas renderizan fotogramas alternos en paralelo y se escriben en orden.
//   --encoder amf codifica en la GPU AMD (h264_amf); nvenc (NVIDIA) y qsv (Intel) también valen.
//                 Se prueba antes de empezar y, si el ffmpeg o el driver no lo soportan, se usa x264.
//   --jpeg        pasa fotogramas JPEG (calidad 95) en lugar de PNG: más rápido, pérdida mínima.
import {chromium, type Browser, type Page} from 'playwright-core';
import {existsSync, mkdirSync} from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const mode = argv[0] ?? 'stills';
const opt = (k: string, d?: string) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : d;
};
const flag = (k: string) => argv.includes(`--${k}`);
const APP = path.resolve(import.meta.dir, '..');
const FPS = Number(opt('fps', '30'));
const SAMPLES = Number(opt('samples', '1'));
const SHUTTER = Number(opt('shutter', '0.5'));

async function reachable(url: string) {
  try {
    return (await fetch(url, {signal: AbortSignal.timeout(1500)})).ok;
  } catch {
    return false;
  }
}

async function startServer() {
  const given = opt('url');
  if (given && (await reachable(given))) return {url: given, stop: () => {}};
  const port = 5400 + Math.floor(Math.random() * 400);
  // process.execPath es el propio bun: funciona igual en Windows, Mac y Linux (sin depender de "bunx" en el PATH).
  const proc = Bun.spawn([process.execPath, 'x', 'vite', '--port', String(port), '--strictPort'], {
    cwd: APP,
    stdout: 'ignore',
    stderr: 'inherit',
    env: {...process.env, VIDEO_NO_HMR: '1'},
  });
  const url = `http://localhost:${port}`;
  // La primera vez Vite optimiza dependencias y puede tardar: hasta 60 s.
  for (let i = 0; i < 600 && !(await reachable(url)); i++) await Bun.sleep(100);
  if (!(await reachable(url))) throw new Error(`Vite no arrancó en ${url}`);
  return {url, stop: () => proc.kill()};
}

async function launch(): Promise<Browser> {
  const executablePath = opt('chrome') ?? process.env.CHROME_PATH;
  const args = ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--ignore-gpu-blocklist'];
  if (flag('swiftshader')) args.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  // En portátiles con gráfica integrada + dedicada, pide la de alto rendimiento (la AMD/NVIDIA).
  else args.push('--enable-gpu', '--enable-gpu-rasterization', '--force_high_performance_gpu');
  const angle = opt('angle');
  if (angle) args.push(`--use-angle=${angle}`);
  const headless = !flag('headed');
  return chromium.launch(executablePath ? {executablePath, args, headless} : {channel: 'chrome', args, headless});
}

type Opened = {page: Page; duration: number; audio: string; gpu: string};

async function openPage(browser: Browser, url: string): Promise<Opened> {
  const page = await browser.newPage({viewport: {width: 1920, height: 1080}, deviceScaleFactor: 1});
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.error(`[navegador] ${m.text()}`);
  });
  page.on('pageerror', (e) => console.error(`[navegador] ${e.message}`));
  const only = opt('only');
  const project = opt('project');
  await page.goto(`${url}/?export=1&fps=${FPS}${only ? `&only=${only}` : ''}${project ? `&project=${project}` : ''}`);
  await page.waitForFunction(() => (window as any).__video?.ready || (window as any).__video?.error, null, {timeout: 120000});
  const err = await page.evaluate(() => (window as any).__video.error);
  if (err) throw new Error(`la app no arrancó:\n${err}`);
  const [duration, audio, gpu]: [number, string, string] = await page.evaluate(() => {
    const v = (window as any).__video;
    const gl = (v.engine.renderer as any).getContext() as WebGL2RenderingContext;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return [v.duration, v.audio, dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)];
  });
  return {page, duration, audio, gpu};
}

/** Avisa si WebGL no va por la GPU dedicada. */
function reportGpu(gpu: string) {
  console.log(`WebGL: ${gpu}`);
  if (flag('swiftshader')) return;
  if (/swiftshader|llvmpipe|software|basic render/i.test(gpu)) {
    console.log('  ⚠ va por CPU: prueba --angle d3d11 (Windows) o --headed.');
  } else if (!/amd|radeon|nvidia|geforce|rtx|apple/i.test(gpu)) {
    console.log('  ⚠ no parece la GPU dedicada. En Windows: Configuración → Sistema → Pantalla → Gráficos,');
    console.log('    añade Google Chrome y elige "Alto rendimiento"; luego vuelve a lanzar el render.');
  }
}

const IMAGE = flag('jpeg') ? 'jpeg' : 'png';
const frame = (page: Page, t: number, format: 'png' | 'jpeg' = 'png') =>
  page.evaluate(
    ([t, s, sh, fmt]) => {
      const v = (window as any).__video;
      v.still(t, s, sh);
      return (fmt === 'jpeg' ? v.jpeg() : v.png()) as string;
    },
    [t, SAMPLES, SHUTTER, format] as const,
  );

/** Argumentos de vídeo para ffmpeg según el codificador; prueba los de GPU antes de usarlos. */
async function encoderArgs(): Promise<string[]> {
  const enc = opt('encoder', 'x264')!;
  const qp = opt('qp', '18')!;
  const hw: Record<string, string[]> = {
    amf: ['-c:v', 'h264_amf', '-usage', 'transcoding', '-quality', 'quality', '-rc', 'cqp', '-qp_i', qp, '-qp_p', String(+qp + 2)],
    nvenc: ['-c:v', 'h264_nvenc', '-preset', 'p6', '-rc', 'constqp', '-qp', qp],
    qsv: ['-c:v', 'h264_qsv', '-global_quality', qp],
  };
  const x264 = ['-c:v', 'libx264', '-preset', opt('preset', 'slow')!, '-crf', opt('crf', '18')!];
  if (enc === 'x264') return x264;
  const args = hw[enc];
  if (!args) throw new Error(`codificador desconocido: ${enc} (x264, amf, nvenc o qsv)`);
  // Prueba de 0.2 s: si el ffmpeg no trae el codificador o el driver no lo inicia, volvemos a x264.
  const probe = Bun.spawn(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=1920x1080:d=0.2', ...args, '-pix_fmt', 'yuv420p', '-f', 'null', '-'], {stdout: 'ignore', stderr: 'pipe'});
  if ((await probe.exited) === 0) {
    console.log(`codificador: ${args[1]} (GPU)`);
    return args;
  }
  const why = (await new Response(probe.stderr).text()).trim().split('\n').pop();
  console.log(`codificador: ${args[1]} no disponible (${why}); uso libx264`);
  return x264;
}

async function stills(page: Page) {
  const out = path.resolve(opt('out', 'out/stills')!);
  mkdirSync(out, {recursive: true});
  for (const t of opt('t', '0')!.split(',').map(Number)) {
    const f = path.join(out, `t_${t.toFixed(2).padStart(6, '0')}.png`);
    await Bun.write(f, Buffer.from(await frame(page, t), 'base64'));
    console.log(path.relative(process.cwd(), f));
  }
}

async function sheet(page: Page, duration: number) {
  const from = Number(opt('from', '0'));
  const to = Number(opt('to', String(duration)));
  const n = Number(opt('n', '24'));
  const cols = Number(opt('cols', '6'));
  const times = Array.from({length: n}, (_, i) => from + ((i + 0.5) / n) * (to - from));
  const png: string = await page.evaluate(
    ({times, cols, s, sh}) => {
      const v = (window as any).__video;
      const cw = 384, ch = 216, pad = 4, lab = 18;
      const rows = Math.ceil(times.length / cols);
      const cv = document.createElement('canvas');
      cv.width = cols * (cw + pad) + pad;
      cv.height = rows * (ch + lab + pad) + pad;
      const c = cv.getContext('2d')!;
      c.fillStyle = '#222';
      c.fillRect(0, 0, cv.width, cv.height);
      const src = document.getElementById('c') as HTMLCanvasElement;
      times.forEach((t: number, i: number) => {
        v.still(t, s, sh);
        const x = pad + (i % cols) * (cw + pad);
        const y = pad + Math.floor(i / cols) * (ch + lab + pad);
        c.drawImage(src, x, y + lab, cw, ch);
        c.fillStyle = '#ddd';
        c.font = '13px monospace';
        c.fillText(`${t.toFixed(2)} s`, x + 2, y + 13);
      });
      return cv.toDataURL('image/png').split(',')[1]!;
    },
    {times, cols, s: SAMPLES, sh: SHUTTER},
  );
  const out = path.resolve(opt('out', 'out/sheet.png')!);
  mkdirSync(path.dirname(out), {recursive: true});
  await Bun.write(out, Buffer.from(png, 'base64'));
  console.log(path.relative(process.cwd(), out));
}

async function video(pages: Page[], duration: number, audioPath: string) {
  const from = Number(opt('from', '0'));
  const to = Number(opt('to', String(duration)));
  const out = path.resolve(opt('out', 'out/video.mp4')!);
  mkdirSync(path.dirname(out), {recursive: true});
  const audio = path.join(APP, 'public', audioPath);
  if (audioPath === 'soundtrack.wav' && !existsSync(audio)) {
    await Bun.spawn([process.execPath, 'scripts/soundtrack.ts'], {cwd: APP, stdout: 'inherit'}).exited;
  }
  if (!flag('noaudio') && !existsSync(audio)) throw new Error(`falta el audio: ${audio}`);

  const withAudio = !flag('noaudio');
  const venc = await encoderArgs();
  const ff = Bun.spawn(
    [
      'ffmpeg', '-y', '-loglevel', 'error',
      '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', IMAGE === 'jpeg' ? 'mjpeg' : 'png', '-i', '-',
      ...(withAudio ? ['-ss', String(from), '-i', audio] : []),
      ...venc,
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      ...(withAudio ? ['-c:a', 'aac', '-b:a', '192k', '-shortest'] : []),
      out,
    ],
    {stdin: 'pipe', stdout: 'inherit', stderr: 'inherit'},
  );

  const first = Math.round(from * FPS);
  const last = Math.round(to * FPS);
  const t0 = performance.now();
  const n = pages.length;
  // Cada pestaña renderiza un fotograma de cada tanda de N; se escriben siempre en orden.
  for (let i = first; i < last; i += n) {
    const batch = pages.map((p, w) => (i + w < last ? frame(p, (i + w) / FPS, IMAGE) : null));
    for (let w = 0; w < n; w++) {
      const img = batch[w];
      if (!img) continue;
      ff.stdin.write(Buffer.from(await img, 'base64'));
      await ff.stdin.flush();
      const done = i + w - first + 1;
      if (done % FPS === 0 || i + w === last - 1) {
        const per = (performance.now() - t0) / done;
        const eta = ((last - i - w - 1) * per) / 1000;
        process.stdout.write(`\r${done}/${last - first} fotogramas · ${per.toFixed(0)} ms/fotograma · faltan ${eta.toFixed(0)} s   `);
      }
    }
  }
  ff.stdin.end();
  if ((await ff.exited) !== 0) throw new Error('ffmpeg falló');
  console.log(`\n${path.relative(process.cwd(), out)}`);
}

const server = await startServer();
let browser: Browser | undefined;
try {
  browser = await launch();
  const workers = mode === 'video' ? Math.max(1, Number(opt('workers', '1'))) : 1;
  const opened = await Promise.all(Array.from({length: workers}, () => openPage(browser!, server.url)));
  const main = opened[0]!;
  reportGpu(main.gpu);
  if (workers > 1) console.log(`${workers} pestañas en paralelo`);
  if (mode === 'stills') await stills(main.page);
  else if (mode === 'sheet') await sheet(main.page, main.duration);
  else if (mode === 'video') await video(opened.map((o) => o.page), main.duration, main.audio);
  else throw new Error(`modo desconocido: ${mode}`);
} finally {
  await browser?.close();
  server.stop();
}
