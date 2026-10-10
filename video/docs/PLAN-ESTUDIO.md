# Plan: Estudio, generador de videos con letra

Herramienta propia para hacer videos con letra sin repetir el proceso manual: subes la canción y la
letra, describes lo que quieres y recibes el video. Este documento es la especificación para que
Claude Code la construya por fases. Cada fase es una sesión o un PR independiente, con criterios de
aceptación comprobables.

Parte de lo que ya existe en `video/`: el motor de render, el análisis de audio y letra, y dos
estilos (`heroes-tonight` tipográfico y `heroes-neon`). Todo se hizo a mano para una canción; aquí
se generaliza.

## 1. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Dónde vive | **Servidor + PC.** El servidor tiene la web, el análisis y la cola de trabajos. El PC con Windows y la RX 6600 actúa como *worker* de render: pide trabajos al servidor, renderiza con la GPU y sube el resultado. |
| Libertad creativa | **Estilos + Claude a medida.** Una librería de escenas paramétricas que Claude configura a partir de la descripción, y un modo "a medida" en el que Claude Code programa escenas nuevas, que pasan a la librería si se aprueban. |
| Interfaz | **Página web**, usable también desde el móvil. |

## 2. Flujo de uso

1. **Nuevo proyecto**: subes el audio (MP3/WAV) y pegas la letra. Rellenas título, artista y créditos
   (licencia; por ejemplo, la línea de NCS). Escribes qué quieres ("tipográfico, tinta y papel, que el
   drop explote, rojo como acento") y, si quieres, eliges un estilo base.
2. **Análisis automático** (~5–8 min en CPU): tempo, compases, secciones, golpes, voz aislada y letra
   alineada palabra a palabra. La web muestra la forma de onda con las secciones y la letra con su
   confianza. Puedes corregir a mano un corte de sección o el inicio de una frase.
3. **Guion (storyboard)**: Claude ("el director") convierte tu descripción en una `VideoSpec`. La web
   la muestra como tarjetas por sección, con 2–3 fotogramas reales de cada una y una hoja de contactos.
4. **Ajustes por chat**: "la letra del estribillo más grande", "menos glitch en el drop 2". El director
   revisa la spec. Si pides algo que ningún estilo sabe hacer, propone el modo a medida.
5. **Previsualización** a baja resolución (540p, 15 fps) con audio, en el reproductor de la web.
6. **Render final** en el worker con GPU. Descargas el master y una versión ligera para compartir.

## 3. Arquitectura

```
                 ┌─────────────────────── Servidor (Linux, Docker) ───────────────────────┐
 navegador/móvil │  web (Bun + Hono + React)  ──  API  ──  SQLite (proyectos, trabajos)   │
 ───────────────►│        │                                                               │
                 │        ├─► análisis (Python/uv: librosa, Demucs, Whisper, CTC)  [CPU]  │
                 │        ├─► director (Claude API: descripción → VideoSpec)              │
                 │        ├─► a medida (Claude Agent SDK en sandbox: escenas nuevas)       │
                 │        └─► render de previsualización (Chrome, CPU, 540p)              │
                 │  almacenamiento: data/projects/<id>/{audio, analysis, spec, renders}   │
                 └──────────────────────────────▲─────────────────────────────────────────┘
                                                │ HTTPS saliente (el PC pide trabajo; no abre puertos)
                 ┌──────────────── PC Windows (RX 6600) ───────────────┐
                 │  worker (Bun): descarga paquete → render GPU → sube │
                 └─────────────────────────────────────────────────────┘
```

- **Acceso**: recomiendo [Tailscale](https://tailscale.com) entre el servidor, el PC y el móvil. Así
  la web es privada y no hay que exponer puertos a internet. Alternativa: proxy inverso con HTTPS y
  contraseña.
- **Cola de trabajos** en SQLite (`jobs`: tipo, estado, progreso, log). Cada trabajo corre en su
  propio proceso.
- **Sin GPU disponible** (PC apagado): el servidor puede renderizar por CPU como respaldo (~1 h por
  canción), avisando del tiempo estimado.

## 4. Optimización del render (fase 0, antes que nada)

Medido en la RX 6600: **167 ms/fotograma** (≈17 min por canción). La GPU no es el cuello de botella.
El tiempo se va en convertir cada fotograma a PNG en la CPU (el grano lo hace grande y lento de
comprimir), pasarlo en base64 de Chrome a Bun y que ffmpeg lo vuelva a decodificar.

**Solución: codificar dentro del navegador con WebCodecs.**

1. `new VideoFrame(canvas, {timestamp})` toma el fotograma directamente de la GPU, sin copia a CPU.
2. `VideoEncoder` con H.264 por hardware (`hardwareAcceleration: 'prefer-hardware'`; en Windows usa
   Media Foundation, es decir, el codificador AMD) produce fragmentos de unos 50–200 KB en lugar de
   PNG de 3–5 MB.
3. Los fragmentos se pasan a Bun como binario (Annex B) y ffmpeg los empaqueta con el audio sin
   recodificar: `-c:v copy`. Alternativa: empaquetar en el navegador con `mp4-muxer`.
4. El render debe seguir siendo **determinista**: cada fotograma se dibuja en su `t` exacto y el
   `timestamp` del `VideoFrame` es `i / fps`, sin relojes reales.
5. **Paralelismo por segmentos**: dividir la canción en N trozos que se renderizan y codifican en
   paralelo, y unirlos con `ffmpeg -f concat -c copy`. Los cortes deben caer en fotogramas clave, así
   que cada segmento empieza con uno. Sustituye al paralelismo por fotogramas alternos actual.
6. **Calidad**: modo `quantizer` del encoder si está disponible; si no, bitrate alto (~25 Mbps para
   el master). Se mantiene la ruta PNG actual como `--exact` para archivo o comparación.
7. **Grano**: parámetro `grain` por proyecto, y dos salidas: master y "compartir" (~8–10 Mbps).

Objetivo: **< 3 min** por canción en la RX 6600, con PSNR > 40 dB frente a la ruta PNG.

## 5. La VideoSpec

Es el contrato entre el director (Claude), la web y el motor. Es JSON validado con zod, y el motor
la compila a un `timeline` sin código específico de cada canción.

```jsonc
{
  "version": 1,
  "format": {"width": 1920, "height": 1080, "fps": 30},        // también 1080x1920 (vertical)
  "style": "ink-paper",                                          // paquete de estilo base
  "palette": {"ink": "#0B0B0C", "paper": "#ECE7DC", "signal": "#FF3B2F"},
  "type": {"display": "Archivo", "mono": "JetBrains Mono", "serif": "Instrument Serif"},
  "motif": "ribbon",                                             // hilo conductor visual
  "effects": {"grain": 0.07, "glitch": 0.6, "shake": 0.8, "transitions": "wipe"},
  "credits": {"intro": false, "end": ["Janji — Heroes Tonight", "Music provided by NoCopyrightSounds"]},
  "sections": [
    {"id": "verse1", "plate": "footsteps",   "params": {"emphasis": ["alone", "silhouette"]}},
    {"id": "pre1",   "plate": "atlas",       "params": {"places": ["London", "Taipei"]}},
    {"id": "chorus1","plate": "hook-slam",   "params": {"variant": "clean"}},
    {"id": "drop1",  "plate": "marquee",     "params": {"phrase": "HEROES TONIGHT"}},
    {"id": "verse2", "plate": "fuse",        "params": {"trigger": "explode"}}
  ]
}
```

- Las secciones salen del análisis. La spec solo dice qué plancha va en cada una y con qué parámetros.
- Cada plancha declara su **esquema de parámetros** (zod). Ese esquema es lo que el director "ve"
  para saber qué puede pedir.

## 6. Librería de planchas (escenas paramétricas)

Se extraen de `video/src/projects/heroes-tonight/scenes/`, quitando lo específico de la canción.
Por ejemplo, `findLine('dynamite')` pasa a ser `params.trigger`.

| Plancha | Origen | Parámetros principales |
|---|---|---|
| `title-card` | `title.ts` | título, subtítulo, fondo |
| `footsteps` | `walk.ts` (línea 1) | palabras de énfasis, ritmo de pasos |
| `hero-word` | `walk.ts` (SILHOUETTE/STRONGER) | palabra, efecto (invertir, engordar, escalera) |
| `clock` | `walk.ts` (reloj) | palabra tachada |
| `atlas` | `atlas.ts` | lugares (geocodificados de una tabla local), ruta |
| `hook-slam` | `hook.ts` | variante: clean, stack, quiet, max |
| `marquee` | `pressure.ts` | frase, filas, inversión por compás |
| `hold-stack` | `pressure.ts` (hold) | palabra sostenida |
| `fuse` | `dynamite.ts` | palabra detonante, metralla |
| `scope` | `dynamite.ts` (osciloscopio) | palabras clave sobre la envolvente de la voz |
| `end-card` | `outro.ts` | créditos |

Paquetes de estilo: `ink-paper` (el tipográfico actual), `neon` (de `heroes-neon`) y
`motion-graphics` (de `prompt-to-video`). Un paquete define la paleta, las fuentes, el post por
defecto y qué planchas sugiere para cada tipo de sección.

## 7. Análisis automático

Un solo comando, con los scripts actuales de `video/analysis/` encadenados:

```
uv run python pipeline.py <audio> <letra.txt> <salida/>   →  audio.json, lyrics.json, report.html
```

1. `analyze.py`: tempo, rejilla, golpes, envolventes.
2. **Secciones automáticas (nuevo)**. Aquí las etiqueté a mano: compases de 8 desde el 4, por energía,
   bombo y voz. Se automatiza con energía y presencia de bombo por compás, matriz de
   auto-similitud (`librosa.segment`) para detectar repeticiones, y la letra para distinguir
   estrofas de estribillos. Etiquetas: intro, verse, pre, chorus, build, drop, break, outro.
3. `align.py` (Whisper) → `separate.py` (Demucs) → `ctc_align.py` (CTC). La re-escucha de tramos
   tapados (`--rescan`) se hace automática donde haya frases sin pareja.
4. **Informe de calidad**: confianza por frase y espectrogramas de las frases dudosas, para que la web
   los muestre y se puedan corregir a mano.
5. **Modelos**: los pesos de Demucs se descargan de Hugging Face y se verifican por SHA-256, con carga
   `weights_only` (ya implementado en `separate.py`). Whisper y MMS se cachean.
6. **Idiomas**: Whisper y MMS soportan español. MMS necesita romanizar con `uroman` para alfabetos no
   latinos.

## 8. Claude en la herramienta

### Director (Claude API)
- **Entrada**: descripción del usuario, resumen del análisis (secciones, energía, letra con tiempos),
  catálogo de planchas con sus esquemas y la spec anterior si es una revisión.
- **Salida**: `VideoSpec` con salida estructurada (JSON schema), validada con zod. Si no es válida, se
  reintenta con el error.
- **Coste**: una llamada de ~20–40 k tokens. Céntimos por video.
- Modelo configurable. Por defecto el más capaz disponible; uno más barato para revisiones pequeñas.

### Modo a medida (Claude Agent SDK)
- Se activa cuando la descripción pide algo que ninguna plancha hace.
- Corre en un **sandbox**: un worktree aparte del repo, sin acceso a secretos, con permisos limitados
  a editar `planchas/`, ejecutar typecheck y renderizar fotogramas.
- **Tarea**: crear una plancha nueva siguiendo las reglas del kit (determinismo, karaoke, paleta).
  Debe pasar el typecheck, renderizar sus fotogramas y revisarlos ella misma, igual que en este
  proyecto.
- **Aprobación humana**: la web muestra los fotogramas y el diff. Al aprobar, la plancha entra en la
  librería.
- **Coste**: algunos dólares por plancha nueva. Se muestra una estimación antes de lanzar.

## 9. Web

- **Stack**: Bun + Hono (API), React + Vite (interfaz), SQLite (`bun:sqlite`).
- **Pantallas**: proyectos, nuevo proyecto (subida, letra, descripción), análisis (onda, secciones,
  letra editable), guion (tarjetas por sección, fotogramas, chat con el director), previsualización
  (reproductor) y renders (descargas).
- El progreso de los trabajos se envía en tiempo real (SSE).
- **Seguridad**: un solo usuario con contraseña (o solo por Tailscale). La API key de Claude, solo en
  el servidor. Los archivos subidos se validan con `ffprobe` y tienen límite de tamaño.

## 10. Worker de render (PC Windows)

- Un proceso Bun (`worker.ts`) configurado con la URL del servidor y un token. Arranca con Windows
  (tarea programada) o con un `.cmd`.
- Pide trabajos (`GET /jobs/next?kind=render`), descarga el paquete (spec, análisis, audio y la
  versión exacta de las planchas, por hash de commit), renderiza con la ruta WebCodecs y sube el MP4
  por partes, reportando progreso.
- **Modo "no molestar"**: no acepta trabajos si detecta un juego a pantalla completa o una GPU muy
  ocupada, y permite configurar un horario.
- Reutiliza los ajustes ya probados en la RX 6600: `--angle d3d11`, `--force_high_performance_gpu`
  y la comprobación de GPU y codificador (`render.ts check`).

## 11. Fases

Cada fase es una sesión de Claude Code con su rama y su PR.

| Fase | Entrega | Criterio de aceptación |
|---|---|---|
| **0. Render rápido** | Ruta WebCodecs en `render.ts` y paralelismo por segmentos | *Heroes Tonight* completo en < 3 min en la RX 6600. PSNR > 40 dB frente a la ruta PNG. Audio sincronizado (comprobar un golpe de bombo contra el fotograma del destello). |
| **1. Análisis en una orden** | `pipeline.py`, secciones automáticas, informe | En *Heroes Tonight*, reproduce el `lyrics.json` actual con una mediana de error < 50 ms y las secciones a ±1 compás. |
| **2. Planchas y VideoSpec** | Librería de planchas, esquemas zod, compilador spec → timeline | *Heroes Tonight* tipográfico recreado solo desde un JSON, sin código de la canción. Una segunda canción NCS se renderiza cambiando solo la spec. |
| **3. Director** | Llamada a Claude API → VideoSpec, revisiones por chat | Tres descripciones distintas producen specs válidas y visiblemente distintas. "Más grande en el estribillo" modifica solo lo que toca. |
| **4. Servidor y web** | API, cola, interfaz completa, previsualización en CPU | Flujo completo desde el navegador del móvil con una canción nueva, hasta ver la previsualización. |
| **5. Worker GPU** | `worker.ts` en Windows, subida por partes, modo "no molestar" | Un render pedido desde el móvil se hace en el PC y aparece para descargar. Con el PC apagado, cae al respaldo por CPU. |
| **6. Modo a medida** | Agent SDK en sandbox, flujo de aprobación | Pedir "que la letra caiga como lluvia en el puente" crea una plancha nueva que pasa typecheck, se ve en fotogramas y queda en la librería al aprobarla. |
| **7. Pulido** | `docker compose`, Tailscale, formato vertical 9:16, documentación | Instalación desde cero siguiendo el README en < 30 min. |

### Cómo arrancar cada fase con Claude Code

En la raíz del repo:

> Lee `video/docs/PLAN-ESTUDIO.md` y haz la **fase N**. Trabaja en una rama nueva, cumple los
> criterios de aceptación de la tabla y demuéstralos (mediciones, fotogramas, comandos). Sigue las
> convenciones de `video/README.md` (determinismo, kit tipográfico, sin código específico de una
> canción).

## 12. Riesgos y cómo se cubren

| Riesgo | Mitigación |
|---|---|
| WebCodecs sin hardware en Chrome headless en Windows | Comprobarlo en `render.ts check`. Si no hay hardware, `--headed` o encoder por software (sigue siendo mucho más rápido que PNG). Mantener la ruta PNG. |
| Alineación de letra floja en estribillos con voces dobladas | Informe de confianza, corrección manual en la web y `--rescan` automático. |
| Secciones automáticas erróneas | La web permite moverlas. El director puede reinterpretarlas con la letra. |
| Código generado por el modo a medida | Sandbox sin secretos, typecheck, fotogramas y aprobación humana antes de usarlo. |
| Licencias musicales | La herramienta pide los créditos al crear el proyecto y los pone en la cartela final. El audio nunca se publica en el repo. |
| Coste de API | Estimación visible antes de cada llamada cara y límite mensual configurable. |

## 13. Preguntas abiertas (confirmar antes de la fase 4)

1. ¿Qué sistema y recursos tiene el servidor (CPU, RAM, disco, alguna GPU)?
2. ¿Tailscale está bien para el acceso remoto, o prefieres un dominio público con contraseña?
3. ¿Quieres formato vertical (9:16) para Shorts/Reels/TikTok desde el principio?
4. ¿Canciones en otros idiomas (español) desde el inicio?
5. ¿Tienes una API key de Anthropic para el director y el modo a medida, y qué presupuesto mensual?
