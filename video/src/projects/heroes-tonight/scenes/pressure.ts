import type {Frame} from '../../../engine/scene';
import {clamp, ease, prog, spring} from '../../../engine/util';
import {LINES, type Line} from '../../../songs/heroes-tonight/lyrics';
import {KICKS, barAt} from '../../../songs/heroes-tonight/music';
import {C, TypeScene, fitSize, note, setType} from '../kit';

const PHRASE = 'HEROES TONIGHT · ';
const WIDTHS = [62.5, 87.5, 125, 75, 112.5, 100];

/**
 * Drops: presión tipográfica. Franjas de HEROES TONIGHT que corren en sentidos opuestos,
 * un empujón y un cambio de anchura en cada bombo, y tinta/papel que se invierten en cada compás.
 * Si en la ventana se canta "Night, yeah", todo se congela y NIGHT ocupa la pantalla.
 * Con `hold`, es la subida 2: HEROES se acumula fila a fila sobre la nota sostenida.
 */
export default class Pressure extends TypeScene {
  night: Line | undefined;
  held: Line | undefined;
  constructor(private hold = false) {
    super();
  }

  async init() {
    this.night = LINES.find((l) => /^night/i.test(l.text) && l.start >= this.ctx.start && l.start < this.ctx.end);
    this.held = LINES.find((l) => l.start >= this.ctx.start - 0.5 && l.start < this.ctx.end && /^we are/i.test(l.text));
  }

  draw(c: CanvasRenderingContext2D, h: CanvasRenderingContext2D, f: Frame) {
    return this.hold ? this.drawHold(c, h, f) : this.drawBands(c, h, f);
  }

  private drawBands(c: CanvasRenderingContext2D, h: CanvasRenderingContext2D, f: Frame) {
    const {t, lt} = f;
    const b = Math.floor(barAt(t));
    const inv = b % 2 === 1;
    this.plate(c, inv ? C.paper : C.ink);
    const pushes = KICKS.filter((k) => k >= this.ctx.start && k <= t).length;
    const freeze = this.night ? prog(t, this.night.start - 0.05, this.night.start + 0.1) : 0;
    const travel = lt * 260 + pushes * 90 + (1 - f.kick) * 40;
    const rows = 8;
    for (let r = 0; r < rows; r++) {
      const width = WIDTHS[(r + pushes) % WIDTHS.length]!;
      setType(c, 132, {weight: 900, width});
      const unit = c.measureText(PHRASE).width;
      const dir = r % 2 ? 1 : -1;
      const off = (((dir * travel * (0.6 + (r % 3) * 0.25)) % unit) + unit) % unit;
      const y = 130 + r * 128;
      const hotRow = r === b % rows && !freeze;
      const ctx = hotRow ? h : c;
      if (hotRow) setType(h, 132, {weight: 900, width});
      ctx.fillStyle = hotRow ? C.signal : inv ? (r % 2 ? C.ink : '#B7B1A6') : r % 2 ? C.paper : C.graphite;
      ctx.globalAlpha = 1 - freeze * 0.85;
      for (let x = off - unit; x < 1920; x += unit) ctx.fillText(PHRASE, x, y);
      ctx.globalAlpha = 1;
    }

    if (this.night && freeze > 0) {
      const [nightW, yeahW] = this.night.words as [{start: number; end: number; w: string}, {start: number; end: number; w: string}];
      const s = spring(t - nightW.start, 18, 0.6);
      const size = fitSize(c, 'NIGHT,', 1700, {weight: 900, width: 125}, 600);
      c.save();
      c.translate(960, 540);
      c.scale(1 + (1 - Math.min(1, s)) * 0.2, 1 + (1 - Math.min(1, s)) * 0.2);
      setType(c, size, {weight: 900, width: 125});
      c.fillStyle = inv ? C.ink : C.paper;
      c.textAlign = 'center';
      c.fillText('NIGHT,', 0, size * 0.2);
      c.restore();
      if (t >= yeahW.start) {
        const g = prog(t, yeahW.start, yeahW.end + 0.3, ease.outCubic);
        setType(h, 120, {weight: 300 + g * 600, width: 62.5 + g * 62.5});
        h.fillStyle = C.signal;
        h.textAlign = 'center';
        h.fillText('YEAH', 960, 540 + size * 0.2 + 140);
        h.textAlign = 'left';
      }
    }
    note(c, `drop · bar ${b + 1}`, 120, 50, {color: inv ? C.graphite : C.ash});
    return {
      shake: [Math.sin(t * 91) * 9 * f.kick, Math.cos(t * 77) * 7 * f.kick] as [number, number],
      zoom: 1 + f.kick * 0.02,
      ca: 0.5 + f.kick * 3,
      flash: lt < 0.3 ? 0.8 * Math.exp(-lt / 0.12) : 0,
    };
  }

  /** Subida 2: "We are heroes tonight, yeah" con la nota larga; HEROES se acumula en filas. */
  private drawHold(c: CanvasRenderingContext2D, h: CanvasRenderingContext2D, f: Frame) {
    const {t, p} = f;
    this.plate(c, C.ink);
    const line = this.held;
    if (!line) return;
    // La frase entera arriba, en karaoke.
    setType(c, 64, {weight: 800});
    let x = 120;
    for (const w of line.words) {
      c.fillStyle = t >= w.start ? C.paper : C.graphite;
      c.fillText(w.w.toUpperCase(), x, 140);
      x += c.measureText(w.w.toUpperCase() + ' ').width;
    }
    // HEROES se acumula fila a fila, cada vez más deprisa, sobre la nota sostenida.
    const beats = Math.floor(f.beat);
    const n = Math.min(8, 1 + Math.floor(prog(t, line.start, this.ctx.end, ease.inCubic) * 8));
    for (let i = 0; i < n; i++) {
      const y = 1020 - i * 104;
      const width = WIDTHS[(i + beats) % WIDTHS.length]!;
      const ctx = i === n - 1 ? h : c;
      setType(ctx, 120, {weight: 900, width});
      ctx.fillStyle = i === n - 1 ? C.signal : i % 2 ? C.paper : C.graphite;
      ctx.fillText('HEROES', 120, y);
    }
    note(c, `× ${n}`, 1800, 140, {align: 'right'});
    const k = prog(p, 0, 1, ease.inCubic);
    return {shake: [Math.sin(t * 90) * k * 8, Math.cos(t * 70) * k * 5] as [number, number], zoom: 1 + k * 0.04, exposure: 1 + clamp(k - 0.8) * 2};
  }
}
