# Videos con código

Nuestra herramienta personal para hacer videos solo con código: sin editor, sin clips y sin
plantillas. Cada fotograma es una función pura del tiempo `t`. El motor es común y cada video es
un proyecto en `src/projects/<id>/`:

| Proyecto | Qué es |
|---|---|
| `prompt-to-video` | 40 s de motion graphics sobre cómo se hacen videos con código. La banda sonora se sintetiza desde cero a partir de la misma partitura que mueve los visuales. |
| `heroes-tonight` | Video con letra para *Janji – Heroes Tonight (feat. Johnning)* [NCS Release]: la historia de un "héroe de luz", sincronizada con el tempo, los golpes y la voz reales de la canción. |
 El repositorio
[mexicat/pdoom-video](https://github.com/mexicat/pdoom-video) sirvió solo como referencia de
enfoque (render determinista en el navegador, Chromium headless y ffmpeg). El motor, las
escenas y el audio de este proyecto están escritos desde cero.

## Cómo funciona (prompt-to-video)

```
music.ts ──► scripts/soundtrack.ts ──► public/soundtrack.wav ─────────────┐
     │                                                                        │
     └─► escenas (scenes/*.ts): render(t) con Canvas2D + GLSL (three.js)      │
              │                                                               ▼
              └─► motor (src/engine/): mezcla, desenfoque, bloom ──► Chromium ──► ffmpeg ──► out/video.mp4
```

1. **Partitura** (`src/projects/prompt-to-video/music.ts`): tempo (120 BPM), secciones, bombos, palmas, acordes y el
   texto que se teclea. La comparten el audio y la imagen, así que todo cae a tiempo.
2. **Banda sonora** (`scripts/soundtrack.ts`): pad, bajo, arpegio, batería, subidas de ruido y
   clics de teclado, sintetizados muestra a muestra en TypeScript. Sale un WAV determinista.
3. **Escenas** (`src/projects/prompt-to-video/scenes/`): cada una es una clase con `render(f, out)` que dibuja el
   fotograma del instante `f.t`. Usan Canvas2D para la tipografía y las interfaces, y shaders
   GLSL para fondos, el campo de fuego y la terminal en 3D.
4. **Motor** (`src/engine/`): elige las escenas activas, funde las que se solapan, promedia
   sub-fotogramas (desenfoque de movimiento) y aplica el post-procesado: bloom, aberración
   cromática, viñeta, grano, destellos y sacudidas de cámara.
5. **Render** (`scripts/render.ts`): arranca Vite, abre la app en Chromium headless con
   playwright-core, pide cada fotograma como PNG y lo envía a ffmpeg junto con el WAV.

## Cómo funciona con una canción (heroes-tonight)

Con música real no hay partitura, así que se extrae del audio:

1. **Análisis** (`analysis/analyze.py`, Python con uv y librosa): tempo constante (128 BPM), rejilla
   de tiempos y compases, golpes de bombo, caja y charles, envolventes de energía y voz aislada
   con REPET-SIM. El resultado va a `audio.json`.
2. **Letra** (`analysis/align.py`): Whisper (faster-whisper, `large-v3-turbo`) transcribe la voz
   con tiempos por palabra. Un alineamiento global por programación dinámica empareja lo oído con
   la letra real, así que la letra manda sobre el texto y Whisper solo aporta los tiempos. Con
   `--rescan INICIO:FIN` se vuelve a transcribir un tramo donde la voz queda tapada por el drop.
   El resultado va a `lyrics.json`.
3. **Escenas**: leen `music.ts` (secciones, bombos, envolventes) y `lyrics.ts` (`findLine`,
   `findWord`). Así, un arco del globo se dibuja exactamente mientras suena *"From London to
   Taiwan"* y la dinamita estalla en la palabra *"explode"*.

```sh
cd video/analysis
uv sync
uv run python analyze.py ../public/audio/heroes-tonight.mp3 ../src/projects/heroes-tonight/audio.json --plots ../out/analysis
uv run python align.py ../public/audio/heroes-tonight.mp3 ../src/projects/heroes-tonight/lyrics.txt \
  ../src/projects/heroes-tonight/lyrics.json --rescan 138:190
```

El MP3 no está en el repositorio. Descárgalo de [ncs.io/HeroesTonight](https://ncs.io/HeroesTonight)
y guárdalo como `public/audio/heroes-tonight.mp3`. Música: *Janji – Heroes Tonight (feat. Johnning)*
[NCS Release]. Music provided by NoCopyrightSounds.

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

Para otro proyecto añade `?project=heroes-tonight` a la URL de la vista previa, o
`--project heroes-tonight` a `scripts/render.ts`. Con `?nooverlay` se ocultan las capas superpuestas
(la letra).

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
| `--project id` | Proyecto a renderizar (por defecto `prompt-to-video`) |
| `--noaudio` | Video sin banda sonora |

## Estructura

```
video/
├── index.html               Vista previa
├── analysis/                Python (uv): análisis de audio y alineación de letra
│   ├── analyze.py
│   └── align.py
├── scripts/
│   ├── render.ts            Render offline (Chromium headless → ffmpeg)
│   └── soundtrack.ts        Sintetizador de la banda sonora de prompt-to-video
└── src/
    ├── main.ts              Arranque, vista previa y API window.__video para el render
    ├── kit.ts               Piezas compartidas: fondo, chispa, revelado de palabras, ventanas
    ├── engine/              Motor reutilizable
    │   ├── engine.ts        Escenas activas, fundidos, capas superpuestas, sub-fotogramas
    │   ├── gl.ts            Pasadas GLSL, capas Canvas2D, compositor
    │   ├── post.ts          Bloom, tono, CA, viñeta, grano, destellos
    │   ├── project.ts       Tipos Project, Entry y Rhythm
    │   ├── scene.ts         Clase base Scene y tipo Frame
    │   └── util.ts          Curvas, resortes, azar con semilla, envolventes de golpes
    └── projects/
        ├── index.ts         Registro de proyectos
        ├── prompt-to-video/ music.ts (partitura), timeline.ts, scenes/
        └── heroes-tonight/  audio.json y lyrics.json (análisis), music.ts, lyrics.ts,
                             sky/street/hero/particles (piezas), scenes/, timeline.ts
```

Un proyecto exporta un `Project` con su duración, su audio (ruta dentro de `public/`), su ritmo
(`Rhythm`: tiempo, bombo, palmas y envolventes), su montaje (`timeline`) y, si quiere, capas
superpuestas (`overlays`), como la letra.

## Crear una escena nueva

```ts
// src/projects/mi-video/scenes/mi-escena.ts
import type * as THREE from 'three';
import {Layer2D} from '../../../engine/gl';
import {Scene, type Frame} from '../../../engine/scene';
import {Backdrop, C, revealWords} from '../../../kit';

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

Después la añades al `timeline.ts` del proyecto con su intervalo de tiempo.

Reglas:

- **Determinismo.** La salida depende solo de `f.t`. Nada de `Math.random()`, `Date.now()` ni
  estado entre fotogramas. Para azar usa `mulberry32(semilla)` o `hash(n)` de `engine/util.ts`.
  Así la vista previa y el render coinciden, y los sub-fotogramas se pueden calcular en
  cualquier orden.
- **Al ritmo.** Usa `f.kick` y `f.clap` (envolventes 0..1), `f.a` (energía y voz) o los tiempos
  del `music.ts` del proyecto para sincronizar con el audio.
- **Escenas 3D.** Los destinos tienen buffer de profundidad: llama a `renderer.clearDepth()` antes
  de dibujar una escena de three.js con oclusión. Los quads orientados según el movimiento
  necesitan `side: THREE.DoubleSide`, o la mitad desaparece por el culling de caras.
- **Canvas2D ignora `globalAlpha` mayor que 1.** Si la opacidad sale de un resorte que rebota,
  acótala con `Math.min(1, …)`.
- **Colores.** En GLSL los colores son lineales y por encima de ~0.75 producen bloom. En Canvas2D
  usa la paleta `C` de `kit.ts`. Para que algo brille, dibújalo en una segunda capa y compónla en
  modo `add` con `gain` mayor que 1.
