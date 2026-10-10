# Prompt → Video

Un video de motion graphics de 40 segundos hecho solo con código. No hay editor de video,
ni clips, ni plantillas, ni música de stock. Cada fotograma es una función pura del tiempo `t`.
La banda sonora se sintetiza a partir de la misma partitura que mueve los visuales.

Es nuestra herramienta personal para hacer videos con código. El repositorio
[mexicat/pdoom-video](https://github.com/mexicat/pdoom-video) sirvió solo como referencia de
enfoque (render determinista en el navegador, Chromium headless y ffmpeg). El motor, las
escenas y el audio de este proyecto están escritos desde cero.

## Cómo funciona

```
src/music.ts ──► scripts/soundtrack.ts ──► public/soundtrack.wav ─────────────┐
     │                                                                        │
     └─► escenas (src/scenes/*.ts): render(t) con Canvas2D + GLSL (three.js)  │
              │                                                               ▼
              └─► motor (src/engine/): mezcla, desenfoque, bloom ──► Chromium ──► ffmpeg ──► out/video.mp4
```

1. **Partitura** (`src/music.ts`): tempo (120 BPM), secciones, bombos, palmas, acordes y el
   texto que se teclea. La comparten el audio y la imagen, así que todo cae a tiempo.
2. **Banda sonora** (`scripts/soundtrack.ts`): pad, bajo, arpegio, batería, subidas de ruido y
   clics de teclado, sintetizados muestra a muestra en TypeScript. Sale un WAV determinista.
3. **Escenas** (`src/scenes/`): cada una es una clase con `render(f, out)` que dibuja el
   fotograma del instante `f.t`. Usan Canvas2D para la tipografía y las interfaces, y shaders
   GLSL para fondos, el campo de fuego y la terminal en 3D.
4. **Motor** (`src/engine/`): elige las escenas activas, funde las que se solapan, promedia
   sub-fotogramas (desenfoque de movimiento) y aplica el post-procesado: bloom, aberración
   cromática, viñeta, grano, destellos y sacudidas de cámara.
5. **Render** (`scripts/render.ts`): arranca Vite, abre la app en Chromium headless con
   playwright-core, pide cada fotograma como PNG y lo envía a ffmpeg junto con el WAV.

## Requisitos

- [bun](https://bun.sh)
- ffmpeg con libx264
- Google Chrome o Chromium. Por defecto se usa el Chrome instalado. Con `--chrome <ruta>` (o la
  variable `CHROME_PATH`) eliges otro binario.

## Uso

```sh
cd video
bun install
bun run soundtrack            # genera public/soundtrack.wav
bunx vite                     # vista previa en http://localhost:5173
```

En la vista previa: **espacio** reproduce o pausa, **←/→** salta ±1 s (±5 s con shift),
**,** y **.** avanzan un fotograma, **h** oculta la barra. Con `?t=22` empiezas en un segundo concreto.

### Renderizar

```sh
bun scripts/render.ts video --samples 2 --out out/video.mp4      # video completo
bun scripts/render.ts stills --t 2.5,10,23 --only intro,field   # fotogramas sueltos (PNG)
bun scripts/render.ts sheet --n 40 --cols 5                     # hoja de contactos
```

| Opción | Qué hace |
|---|---|
| `--fps 30` | Fotogramas por segundo |
| `--samples N` | Promedia N sub-fotogramas por fotograma (desenfoque de movimiento) |
| `--shutter 0.5` | Fracción del tiempo de fotograma que cubre el obturador |
| `--crf 18` | Calidad de x264 (más bajo es mejor) |
| `--from` / `--to` | Rango de tiempo en segundos |
| `--only a,b` | Carga solo esas escenas del montaje |
| `--swiftshader` | WebGL por CPU, para máquinas o contenedores sin GPU |
| `--noaudio` | Video sin banda sonora |

## Estructura

```
video/
├── index.html            Vista previa
├── scripts/
│   ├── render.ts         Render offline (Chromium headless → ffmpeg)
│   └── soundtrack.ts     Sintetizador de la banda sonora
└── src/
    ├── main.ts           Arranque, vista previa y API window.__video para el render
    ├── music.ts          Partitura compartida por audio e imagen
    ├── timeline.ts       Montaje: qué escena ocupa cada sección
    ├── engine/           Motor reutilizable
    │   ├── engine.ts     Escenas activas, fundidos, sub-fotogramas
    │   ├── gl.ts         Pasadas GLSL, capas Canvas2D, compositor
    │   ├── post.ts       Bloom, tono, CA, viñeta, grano, destellos
    │   ├── scene.ts      Clase base Scene y tipo Frame
    │   └── util.ts       Curvas, resortes, azar con semilla
    └── scenes/           El contenido de este video
        ├── _kit.ts       Paleta, fondo, chispa, revelado de palabras, ventanas
        ├── intro.ts      "Un prompt. Un poco de código. Un video."
        ├── terminal.ts   Terminal en 3D: el prompt, las herramientas y el render
        ├── code.ts       Editor con el código y su vista previa en vivo
        ├── field.ts      El "drop": color = f(x, y, t) y la tira de 12 fotogramas
        ├── stats.ts      Contadores
        └── outro.ts      "Hecho con código."
```

## Crear una escena nueva

```ts
// src/scenes/mi-escena.ts
import type * as THREE from 'three';
import {Layer2D} from '../engine/gl';
import {Scene, type Frame} from '../engine/scene';
import {Backdrop, C, revealWords} from './_kit';

export default class MiEscena extends Scene {
  bg = new Backdrop();
  ui = new Layer2D();

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    this.bg.render(this.ctx.renderer, out, {t: f.t, kick: f.kick});
    this.ui.clear();
    revealWords(this.ui.ctx, 'Hola, mundo.', 960, 560, f.lt, {size: 120, align: 'center'});
    this.ctx.comp.draw(this.ctx.renderer, this.ui.upload(), out);
    return {shake: [0, 0], bloom: 1}; // ajustes de post opcionales
  }
}
```

Después la añades a `src/timeline.ts` con su intervalo de tiempo.

Reglas:

- **Determinismo.** La salida depende solo de `f.t`. Nada de `Math.random()`, `Date.now()` ni
  estado entre fotogramas. Para azar usa `mulberry32(semilla)` o `hash(n)` de `engine/util.ts`.
  Así la vista previa y el render coinciden, y los sub-fotogramas se pueden calcular en
  cualquier orden.
- **Al ritmo.** Usa `f.kick` y `f.clap` (envolventes 0..1) o los tiempos de `music.ts` para
  sincronizar con el audio.
- **Canvas2D ignora `globalAlpha` mayor que 1.** Si la opacidad sale de un resorte que rebota,
  acótala con `Math.min(1, …)`.
- **Colores.** En GLSL los colores son lineales y por encima de ~0.75 producen bloom. En Canvas2D
  usa la paleta `C` de `_kit.ts`. Para que algo brille, dibújalo en una segunda capa y compónla en
  modo `add` con `gain` mayor que 1.
