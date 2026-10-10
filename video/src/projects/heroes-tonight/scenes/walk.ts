import type {Frame} from '../../../engine/scene';
import {clamp, ease, prog, spring} from '../../../engine/util';
import {LINES, type Line, findWord} from '../../../songs/heroes-tonight/lyrics';
import {C, TypeScene, inkOf, lineIn, note, ribbon, rule, setType, sung} from '../kit';

const [L0, L1, L2, L3] = LINES as [Line, Line, Line, Line];

/**
 * Estrofa 1, cuatro frases y cuatro ideas tipográficas:
 * calle vacía (palabras pequeñas en mucho negro), SILHOUETTE en tinta sobre papel,
 * STRONGER que gana peso y anchura y una escalera, y un reloj cuya aguja es la cinta.
 */
export default class Walk extends TypeScene {
  silhouette = findWord(L1, 'silhouette');
  stronger = findWord(L2, 'stronger');
  regrets = findWord(L3, 'regrets');

  draw(c: CanvasRenderingContext2D, h: CanvasRenderingContext2D, f: Frame) {
    const {t} = f;
    if (t < L1.start - 0.2) return this.empty(c, h, t);
    if (t < L2.start - 0.2) return this.silhouetteLine(c, h, t);
    if (t < L3.start - 0.2) return this.strongerLine(c, h, t);
    return this.clock(c, h, t, f.beat);
  }

  /** "I'm walking alone, the streets are empty": pasos sueltos en la oscuridad. */
  private empty(c: CanvasRenderingContext2D, h: CanvasRenderingContext2D, t: number) {
    this.plate(c, C.ink);
    const pan = prog(t, L0.start - 0.5, L1.start, ease.inOutCubic) * 260;
    L0.words.forEach((w, i) => {
      const x = 160 + i * 230 - pan + (i === L0.words.length - 1 ? 260 : 0);
      const y = 560 + (i % 2 ? -26 : 26); // izquierda, derecha: pasos
      setType(c, 46, {weight: w.w.startsWith('alone') ? 700 : 400, width: 100});
      c.fillStyle = w.w.startsWith('alone') ? C.paper : C.ash;
      c.globalAlpha = lineIn(L0, t) * inkOf(w, t);
      c.fillText(w.w, x, y);
      // Huella: dos marcas cortas bajo la palabra en cuanto se canta, que se van apagando.
      const step = t - w.start;
      if (step > 0) {
        c.globalAlpha = Math.max(0.15, Math.exp(-step / 1.5)) * lineIn(L0, t);
        rule(c, x, y + 22, x + 34, y + 22, C.paper, 2);
        rule(c, x + 10, y + 30, x + 28, y + 30, C.graphite, 2);
      }
    });
    c.globalAlpha = lineIn(L0, t) * sung(L0.words[L0.words.length - 1]!, t);
    const last = L0.words[L0.words.length - 1]!;
    note(c, '0 personas · 03:12', 1660 - pan, 520, {decode: prog(t, last.start, last.start + 0.8), t});
    c.globalAlpha = 1;
  }

  /** "The only thing I can see is my own silhouette": la palabra ES la silueta. */
  private silhouetteLine(c: CanvasRenderingContext2D, h: CanvasRenderingContext2D, t: number) {
    const hit = t >= this.silhouette.start;
    this.plate(c, hit ? C.paper : C.ink);
    if (!hit) {
      setType(c, 72, {weight: 500});
      let x = 160;
      for (const w of L1.words.slice(0, -1)) {
        c.fillStyle = C.paper;
        c.globalAlpha = lineIn(L1, t) * inkOf(w, t);
        c.fillText(w.w, x, 560);
        x += c.measureText(w.w + ' ').width;
      }
      c.globalAlpha = 1;
      return;
    }
    const s = spring(t - this.silhouette.start, 16, 0.8);
    setType(c, 330, {weight: 900, width: 62.5, tracking: -0.03});
    c.fillStyle = C.ink;
    c.textAlign = 'center';
    c.fillText('SILHOUETTE', 960, 660 + (1 - Math.min(1, s)) * 80);
    c.textAlign = 'left';
    note(c, 'fig. 1 — the only thing I can see', 120, 960, {color: C.graphite, decode: prog(t, this.silhouette.start, this.silhouette.start + 0.7), t});
    ribbon(h, [[120, 720], [1800, 720]], prog(t, this.silhouette.start, this.silhouette.start + 0.8, ease.outCubic), 4, false);
    return {shake: [Math.sin(t * 90) * 6 * Math.exp(-(t - this.silhouette.start) / 0.12), 0] as [number, number]};
  }

  /** "I'm getting stronger, step by step". */
  private strongerLine(c: CanvasRenderingContext2D, h: CanvasRenderingContext2D, t: number) {
    this.plate(c, C.ink);
    const [im, getting] = L2.words;
    setType(c, 44, {weight: 400});
    c.fillStyle = C.ash;
    c.globalAlpha = inkOf(im!, t) * lineIn(L2, t);
    c.fillText(`${im!.w} ${getting!.w}`, 160, 300);
    // STRONGER engorda y se ensancha mientras se canta.
    const g = prog(t, this.stronger.start, this.stronger.end + 0.5, ease.outCubic);
    if (t >= this.stronger.start - 0.4) {
      const width = 62.5 + g * 62.5;
      setType(c, 210, {weight: 200 + g * 700, width});
      c.fillStyle = C.paper;
      c.globalAlpha = inkOf(this.stronger, t);
      c.fillText('STRONGER', 160, 520);
    }
    c.globalAlpha = 1;
    // step / by / step: una escalera, peldaño a peldaño.
    const steps = L2.words.slice(3);
    const pts: [number, number][] = [[160, 900]];
    steps.forEach((w, i) => {
      const x = 640 + i * 360;
      const y = 900 - i * 110;
      const s = spring(t - w.start, 16, 0.7);
      if (t >= w.start - 0.4) {
        setType(c, 84, {weight: 800, width: 112.5});
        c.fillStyle = C.paper;
        c.globalAlpha = inkOf(w, t);
        c.fillText(w.w.replace(/[^a-z]/gi, '').toUpperCase(), x, y - 20 - (1 - Math.min(1, s)) * 30);
        c.globalAlpha = 1;
        rule(c, x, y, x + 320, y, C.graphite);
      }
      pts.push([x, y], [x + 320, y]);
    });
    const k = prog(t, steps[0]!.start, steps[steps.length - 1]!.start + 0.3);
    ribbon(h, pts, k, 4);
  }

  /** "The clock is ticking but there's no time for regrets": la cinta es la aguja. */
  private clock(c: CanvasRenderingContext2D, h: CanvasRenderingContext2D, t: number, beat: number) {
    this.plate(c, C.ink);
    const cx = 1240;
    const cy = 540;
    const r = 330;
    const open = prog(t, L3.start - 0.3, L3.start + 0.4, ease.outCubic);
    c.strokeStyle = C.graphite;
    c.lineWidth = 1;
    c.beginPath();
    c.arc(cx, cy, r * open, 0, Math.PI * 2);
    c.stroke();
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const len = i % 5 === 0 ? 22 : 8;
      rule(c, cx + Math.sin(a) * (r - len) * open, cy - Math.cos(a) * (r - len) * open, cx + Math.sin(a) * r * open, cy - Math.cos(a) * r * open, i % 5 ? C.graphite : C.ash);
    }
    // Las palabras ocupan las horas, una por palabra cantada.
    L3.words.forEach((w, i) => {
      const a = ((i + 1) / 12) * Math.PI * 2;
      const rr = r + 70;
      if (t < w.start - 0.4) return;
      setType(c, w === this.regrets ? 58 : 40, {weight: w === this.regrets ? 900 : 600, width: 100});
      c.fillStyle = w === this.regrets ? C.paper : C.ash;
      c.globalAlpha = inkOf(w, t);
      c.textAlign = 'center';
      c.fillText(w.w.toUpperCase(), cx + Math.sin(a) * rr, cy - Math.cos(a) * rr + 14);
      c.textAlign = 'left';
      c.globalAlpha = 1;
    });
    // "regrets": tachado por la cinta.
    if (t >= this.regrets.start) {
      const a = ((L3.words.indexOf(this.regrets) + 1) / 12) * Math.PI * 2;
      const x = cx + Math.sin(a) * (r + 70);
      const y = cy - Math.cos(a) * (r + 70) - 4;
      ribbon(h, [[x - 120, y], [x + 120, y]], prog(t, this.regrets.start, this.regrets.start + 0.25), 5, false);
    }
    // Aguja: salta en cada tiempo.
    const ang = (Math.floor(beat) / 60) * Math.PI * 2;
    ribbon(h, [[cx, cy], [cx + Math.sin(ang) * (r - 30), cy - Math.cos(ang) * (r - 30)]], open, 4, false);
    c.fillStyle = C.paper;
    c.beginPath();
    c.arc(cx, cy, 6, 0, Math.PI * 2);
    c.fill();
    // A la izquierda, en grande, lo que importa.
    const nt = L3.words.find((w) => w.w === 'time')!;
    if (t >= nt.start - 0.4) {
      setType(c, 150, {family: 'serif', italic: true});
      c.fillStyle = C.paper;
      c.globalAlpha = inkOf(nt, t) * clamp(open);
      c.fillText('no time', 120, 600);
      c.globalAlpha = 1;
    }
    note(c, `t = ${t.toFixed(2)} s`, 120, 660);
  }
}
