import type * as THREE from 'three';
import {FSPass, Layer2D} from '../engine/gl';
import {Scene, type Frame} from '../engine/scene';
import {ease, prog, spring} from '../engine/util';
import {C, MONO, font, revealWords, shakeFrom} from './_kit';

const COLS = 4;
const ROWS = 3;
const TILE_W = 360;
const TILE_H = 202.5;
const GAP = 36;
const GRID_W = COLS * TILE_W + (COLS - 1) * GAP;
const GRID_H = ROWS * TILE_H + (ROWS - 1) * GAP;
const GRID_X = (1920 - GRID_W) / 2;
const GRID_Y = 262;
const GRID_CX = GRID_X + GRID_W / 2;
const GRID_CY = GRID_Y + GRID_H / 2;
const TILE_DT = 0.5; // cada miniatura va medio segundo por delante de la anterior
const GRID_AT = 4; // segundo local en el que el campo se parte en fotogramas

/**
 * El "drop": un campo de humo/fuego que es literalmente color = f(x, y, t).
 * A mitad de escena el mismo shader se evalúa en 12 instantes distintos: una tira de fotogramas.
 */
export default class Field extends Scene {
  ui = new Layer2D();
  hot = new Layer2D();
  field = new FSPass(
    /* glsl */ `
    uniform float t, kick, grid, gridScale;
    uniform vec4 gridRect; // x, y, w, h en px
    uniform vec2 tile, gap, cells;
    uniform float tileDt;
    varying vec2 vUv;

    vec3 heat(float x) {
      x = clamp(x, 0.0, 1.0);
      vec3 a = mix(C_INK, C_ACCENT * 0.35, smoothstep(0.0, 0.5, x));
      a = mix(a, C_ACCENT * 1.3, smoothstep(0.45, 0.85, x));
      return mix(a, vec3(1.5, 1.15, 0.85), smoothstep(0.88, 1.0, x));
    }

    // El campo: fbm con deformación de dominio en dos niveles.
    vec3 field(vec2 p, float time, float k) {
      vec2 q = vec2(fbm(p + vec2(0.0, time * 0.25)), fbm(p + vec2(5.2, 1.3) - time * 0.2));
      vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + time * 0.15), fbm(p + 3.0 * q + vec2(8.3, 2.8)));
      float v = fbm(p + 3.5 * r);
      float rings = 0.5 + 0.5 * sin(length(p - vec2(1.78, 1.0)) * 6.0 - time * 3.0);
      v = (v - 0.45) * 2.0 + rings * 0.1 * (0.4 + k);
      return heat(v + k * 0.1);
    }

    void main() {
      vec2 px = vUv * vec2(1920.0, 1080.0);
      px.y = 1080.0 - px.y;
      vec2 p = vUv * vec2(1.78, 1.0) * 2.0;
      vec3 full = field(p, t, kick);

      // Rejilla de fotogramas, con un pequeño zoom de entrada.
      vec2 center = gridRect.xy + gridRect.zw * 0.5;
      vec2 gp = (px - center) / gridScale + gridRect.zw * 0.5;
      vec2 stepPx = tile + gap;
      vec2 cell = floor(gp / stepPx);
      vec2 inCell = gp - cell * stepPx;
      float inside = step(0.0, cell.x) * step(cell.x, cells.x - 1.0) * step(0.0, cell.y) * step(cell.y, cells.y - 1.0)
                   * step(inCell.x, tile.x) * step(inCell.y, tile.y);
      float idx = cell.y * cells.x + cell.x;
      vec2 tp = inCell / tile.y * vec2(1.0, -1.0) * 2.0 + vec2(0.0, 2.0);
      vec3 tileCol = field(tp, t + idx * tileDt, 0.0) * 0.75;
      vec3 gridCol = mix(C_INK, tileCol, inside);

      gl_FragColor = vec4(mix(full, gridCol, grid), 1.0);
    }`,
    {
      t: {value: 0},
      kick: {value: 0},
      grid: {value: 0},
      gridScale: {value: 1},
      gridRect: {value: [GRID_X, GRID_Y, GRID_W, GRID_H]},
      tile: {value: [TILE_W, TILE_H]},
      gap: {value: [GAP, GAP]},
      cells: {value: [COLS, ROWS]},
      tileDt: {value: TILE_DT},
    },
  );

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const {renderer, comp} = this.ctx;
    const {lt, t} = f;
    const grid = prog(lt, GRID_AT, GRID_AT + 0.35, ease.inOutCubic);
    const gridScale = 1 + (1 - spring(lt - GRID_AT, 10, 0.75)) * 0.25;
    const u = this.field.u;
    u.t!.value = t;
    u.kick!.value = f.kick * (1 - grid);
    u.grid!.value = grid;
    u.gridScale!.value = gridScale;
    this.field.render(renderer, out);

    const c = this.ui.ctx;
    const h = this.hot.ctx;
    this.ui.clear();
    this.hot.clear();

    // Primera mitad: la fórmula sobre el campo.
    if (lt < GRID_AT + 0.4) {
      const away = 1 - prog(lt, GRID_AT - 0.1, GRID_AT + 0.3);
      c.globalAlpha = away;
      h.globalAlpha = away;
      c.fillStyle = 'rgba(14,13,11,0.78)';
      c.fillRect(0, 380, 1920, 330);
      revealWords(c, 'Cada píxel es', 960, 470, lt, {size: 52, weight: 600, color: C.text, align: 'center', tracking: -0.02, start: 0.1});
      revealWords(c, 'color = f(x, y, t)', 960, 630, lt, {size: 128, weight: 700, family: MONO, align: 'center', tracking: -0.03, start: 0.35, stagger: 0.1, colors: {2: C.accentSoft}});
      c.globalAlpha = h.globalAlpha = 1;
    }

    // Lectura de tiempo, siempre visible.
    c.font = font(400, 26, MONO);
    c.fillStyle = 'rgba(14,13,11,0.8)';
    c.fillRect(104, 966, 260, 48);
    c.fillStyle = C.muted;
    c.fillText('t =', 120, 1000);
    h.font = font(700, 26, MONO);
    h.fillStyle = C.accent;
    h.fillText(`${t.toFixed(3)} s`, 120 + c.measureText('t = ').width, 1000);

    // Segunda mitad: la tira de fotogramas.
    if (grid > 0) {
      revealWords(c, 'El mismo shader, 12 instantes distintos.', 960, 190, lt, {
        size: 60,
        align: 'center',
        start: GRID_AT + 0.1,
        stagger: 0.05,
        colors: {3: C.accent},
      });
      c.font = font(400, 19, MONO);
      for (let i = 0; i < COLS * ROWS; i++) {
        const k = prog(lt, GRID_AT + 0.3 + i * 0.04, GRID_AT + 0.5 + i * 0.04);
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const x = GRID_CX + (GRID_X + col * (TILE_W + GAP) - GRID_CX) * gridScale;
        const y = GRID_CY + (GRID_Y + row * (TILE_H + GAP) - GRID_CY) * gridScale;
        c.globalAlpha = k;
        c.fillStyle = 'rgba(14,13,11,0.75)';
        c.fillRect(x + 10, y + TILE_H * gridScale - 40, 150, 30);
        c.fillStyle = C.text;
        c.fillText(`t + ${(i * TILE_DT).toFixed(1)} s`, x + 20, y + TILE_H * gridScale - 18);
      }
      c.globalAlpha = 1;
      revealWords(c, 'Mismo t → misma imagen. Siempre.', 960, 1012, lt, {
        size: 34,
        weight: 600,
        family: MONO,
        align: 'center',
        start: GRID_AT + 1.2,
        tracking: -0.01,
        color: C.muted,
        colors: {5: C.text},
      });
    }

    comp.draw(renderer, this.ui.upload(), out);
    comp.draw(renderer, this.hot.upload(), out, {mode: 'add', gain: 1.6});

    return {
      shake: shakeFrom(f.kick, t, 7 * (1 - grid) + 2),
      ca: 1.5 + f.kick * 5 * (1 - grid),
      zoom: 1 + f.kick * 0.015 * (1 - grid),
      bloom: 1.1,
      flash: 0.95 * Math.exp(-lt / 0.12) + 0.3 * Math.exp(-Math.max(0, lt - GRID_AT) / 0.1) * (lt >= GRID_AT ? 1 : 0),
    };
  }
}
