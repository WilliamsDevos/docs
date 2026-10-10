import type * as THREE from 'three';
import {Layer2D} from '../../../engine/gl';
import {Scene, type Frame} from '../../../engine/scene';
import {clamp} from '../../../engine/util';
import {C} from '../kit';

const HALF = 0.2; // la cortinilla dura 0.4 s, centrada en el corte

/**
 * Capa de transiciones: en cada corte de escena cruza una franja diagonal de tinta, rojo y papel.
 * El corte ocurre justo debajo de la franja, así que nunca se ve un salto seco.
 */
export default class Cuts extends Scene {
  ui = new Layer2D();
  constructor(private cuts: number[]) {
    super();
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const cut = this.cuts.find((c) => Math.abs(f.t - c) < HALF);
    if (cut === undefined) return;
    const k = clamp((f.t - (cut - HALF)) / (HALF * 2));
    const c = this.ui.ctx;
    this.ui.clear();
    // Bandas inclinadas que barren de izquierda a derecha: papel y rojo delante, un cuerpo de tinta
    // lo bastante ancho para tapar toda la pantalla en el instante del corte (k = 0.5), y rojo detrás.
    const SKEW = 420;
    const bands: [string, number][] = [[C.paper, 160], [C.signal, 70], [C.ink, 3200], [C.signal, 40]];
    const total = bands.reduce((a, b) => a + b[1], 0);
    const p0 = -200;
    const p1 = 1920 + SKEW + total;
    let x = p0 + k * (p1 - p0);
    for (const [color, w] of bands) {
      c.fillStyle = color;
      c.beginPath();
      c.moveTo(x - w, 0);
      c.lineTo(x, 0);
      c.lineTo(x - SKEW, 1080);
      c.lineTo(x - w - SKEW, 1080);
      c.closePath();
      c.fill();
      x -= w;
    }
    this.ctx.comp.draw(this.ctx.renderer, this.ui.upload(), out);
    return {rotate: (k - 0.5) * 0.01};
  }
}
