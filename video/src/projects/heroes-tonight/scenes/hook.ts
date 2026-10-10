import type {Frame} from '../../../engine/scene';
import {clamp, ease, prog, spring} from '../../../engine/util';
import {LINES, type Line, type Word} from '../../../songs/heroes-tonight/lyrics';
import {BAR, BEAT, barAt} from '../../../songs/heroes-tonight/music';
import {C, TypeScene, fitSize, inkOf, note, ribbon, rule, setType} from '../kit';

export type HookVariant = 'clean' | 'stack' | 'quiet' | 'max';

const clean = (w: string) => w.replace(/[^a-z']/gi, '').toUpperCase();

/**
 * Estribillo "We are heroes tonight / We will fly above the sky / We are heroes tonight, yeah".
 * Cuatro variantes que escalan a lo largo de la canción:
 *  clean: una palabra a pantalla completa por golpe de voz; ABOVE sobre un horizonte, SKY despega.
 *  stack: plato de papel; las palabras se apilan en filas condensadas mientras sube la tensión.
 *  quiet: el estribillo sin bombo: trazo fino, mucho negro, la cinta dibuja un horizonte lento.
 *  max:   tinta y papel se alternan en cada tiempo, la palabra cantada en rojo señal.
 */
export default class Hook extends TypeScene {
  lines: Line[] = [];
  constructor(private variant: HookVariant) {
    super();
  }

  async init() {
    this.lines = LINES.filter((l) => l.start >= this.ctx.start - 0.5 && l.start < this.ctx.end);
  }

  /** Frase y palabra actuales (la última que ha empezado). */
  private current(t: number): {line: Line; word: Word; index: number} | null {
    let found: {line: Line; word: Word; index: number} | null = null;
    for (const line of this.lines) {
      line.words.forEach((word, index) => {
        if (t >= word.start - 0.02) found = {line, word, index};
      });
    }
    return found;
  }

  draw(c: CanvasRenderingContext2D, h: CanvasRenderingContext2D, f: Frame) {
    switch (this.variant) {
      case 'clean':
        return this.drawClean(c, h, f, false);
      case 'max':
        return this.drawClean(c, h, f, true);
      case 'stack':
        return this.drawStack(c, h, f);
      case 'quiet':
        return this.drawQuiet(c, h, f);
    }
  }

  private drawClean(c: CanvasRenderingContext2D, h: CanvasRenderingContext2D, f: Frame, max: boolean) {
    const {t} = f;
    const flip = max && Math.floor(f.beat) % 2 === 1;
    const bg = flip ? C.paper : C.ink;
    const fg = flip ? C.ink : C.paper;
    this.plate(c, bg);
    const cur = this.current(t);
    if (!cur) return;
    const {line, word} = cur;
    const text = clean(word.w);
    const age = t - word.start;
    const s = spring(age, 18, 0.6);

    // En "max", el fondo se llena de la palabra repetida en filas alternas.
    if (max) {
      setType(c, 90, {weight: 900, width: 62.5});
      c.fillStyle = flip ? '#CFC9BD' : C.ink2;
      const unit = c.measureText(text + ' ').width;
      for (let row = 0; row < 12; row++) {
        const off = ((row % 2 ? 1 : -1) * (t * 300 + row * 97)) % unit;
        for (let x = off - unit; x < 1920 + unit; x += unit) c.fillText(text, x, 90 + row * 90);
      }
    }

    // La palabra, a pantalla completa.
    const special = text === 'SKY' || text === 'ABOVE' || text === 'FLY' || text === 'YEAH';
    let width = text.length > 6 ? 75 : 125;
    let weight = 900;
    if (text === 'YEAH') {
      const g = prog(age, 0, Math.max(0.6, word.end - word.start + 0.4), ease.outCubic);
      width = 62.5 + g * 62.5;
      weight = 300 + g * 600;
    }
    const size = fitSize(c, text, 1680, {weight, width}, 520);
    setType(c, size, {weight, width});
    let y = 540 + size * 0.36;
    if (text === 'FLY') y -= prog(age, 0, 1.2, ease.outCubic) * 80;
    if (text === 'ABOVE') y = 470;
    if (text === 'SKY') y -= prog(age, 0.15, 1.6, ease.inCubic) * 900;
    const slam = 1 + (1 - Math.min(1, s)) * 0.18;
    const target = max && barAt(word.start) % 1 < 0.26 ? h : c; // en "max", las palabras en el 1 del compás van en rojo
    for (const ctx of target === h ? [c, h] : [c]) {
      ctx.save();
      ctx.translate(960, y - size * 0.36);
      ctx.scale(slam, slam);
      setType(ctx, size, {weight, width});
      ctx.fillStyle = ctx === h ? C.signal : fg;
      ctx.textAlign = 'center';
      ctx.fillText(text, 0, size * 0.36);
      ctx.restore();
    }
    if (text === 'ABOVE') {
      // Horizonte: ABOVE queda por encima.
      ribbon(h, [[120, 560], [1800, 560]], prog(age, 0, 0.4, ease.outCubic), 3, false);
    }
    if (text === 'YEAH') ribbon(h, [[120, 900], [1800, 900]], prog(age, 0, word.end - word.start + 0.3), 4);

    // Transcripción pequeña: la frase entera en mono, abajo, para que se lea.
    this.transcript(c, line, t, flip ? C.graphite : C.ash, fg);
    const kickShake = max ? 9 : special ? 2 : 4;
    return {
      shake: [Math.sin(t * 97) * kickShake * Math.exp(-age / 0.1), Math.cos(t * 83) * kickShake * Math.exp(-age / 0.1)] as [number, number],
      ca: 0.5 + (max ? f.kick * 3 : 0),
    };
  }

  private drawStack(c: CanvasRenderingContext2D, h: CanvasRenderingContext2D, f: Frame) {
    const {t, p} = f;
    // Estrobo de tinta/papel en corcheas durante el último compás antes del drop.
    const strobe = t > this.ctx.end - BAR && Math.floor((t - (this.ctx.end - BAR)) / (BEAT / 2)) % 2 === 1;
    const bg = strobe ? C.ink : C.paper;
    const fg = strobe ? C.paper : C.ink;
    this.plate(c, bg);
    const cur = this.current(t);
    if (cur) {
      const {line} = cur;
      const words = line.words.filter((w) => t >= w.start - 0.02);
      const rows = words.length;
      const rowH = Math.min(260, 900 / Math.max(1, rows));
      words.forEach((w, i) => {
        const text = clean(w.w);
        const y = 90 + rowH * (i + 1) - rowH * 0.12;
        const size = Math.min(fitSize(c, text, 1680, {weight: 900, width: 62.5}, 400), rowH * 1.18);
        setType(c, size, {weight: 900, width: 62.5});
        c.fillStyle = i === rows - 1 ? fg : strobe ? C.graphite : '#B7B1A6';
        c.fillText(text, 120, y);
        if (i === rows - 1) ribbon(h, [[120, y + 14], [120 + c.measureText(text).width, y + 14]], prog(t, w.start, w.start + 0.2), 5, false);
      });
    }
    note(c, `tensión ${(p * 100).toFixed(0).padStart(3, '0')} %`, 1800, 60, {align: 'right', color: strobe ? C.ash : C.graphite});
    const k = prog(p, 0, 1, ease.inCubic);
    return {shake: [Math.sin(t * 90) * (1 + k * 10) * Math.max(f.kick, k * 0.5), Math.cos(t * 77) * k * 6] as [number, number], zoom: 1 + k * 0.03};
  }

  private drawQuiet(c: CanvasRenderingContext2D, h: CanvasRenderingContext2D, f: Frame) {
    const {t, p} = f;
    this.plate(c, C.ink);
    // Horizonte lento a lo largo de todo el estribillo.
    ribbon(h, [[120, 700], [1800, 700]], prog(p, 0, 1), 2, true);
    const altitude = Math.round(prog(p, 0, 1, ease.inOutCubic) * 10000);
    note(c, `altitud ${altitude.toLocaleString('en')} m`, 1800, 740, {align: 'right'});
    for (const line of this.lines) {
      const a = clamp((t - (line.start - 0.5)) / 0.4) * (1 - clamp((t - line.end - 0.1) / 0.4));
      if (a <= 0) continue;
      let x = 120;
      const y = 520;
      for (const w of line.words) {
        const sky = clean(w.w) === 'SKY';
        setType(c, sky ? 150 : 120, sky ? {family: 'serif', italic: true} : {weight: 200, width: 100});
        c.fillStyle = C.paper;
        c.globalAlpha = a * inkOf(w, t);
        c.fillText(sky ? 'sky' : w.w.replace(/,$/, ''), x, y - (sky ? prog(t, w.start, w.start + 2, ease.outCubic) * 60 : 0));
        x += c.measureText(w.w + ' ').width;
      }
      c.globalAlpha = 1;
    }
    rule(c, 120, 1000, 1800, 1000, C.ink2);
    note(c, 'heroes tonight — ii', 120, 1030, {color: C.graphite});
  }

  /** La frase completa en pequeño (karaoke) para que siempre se pueda leer. */
  private transcript(c: CanvasRenderingContext2D, line: Line, t: number, dim: string, fg: string) {
    setType(c, 22, {family: 'mono', tracking: 0.04});
    let x = 120;
    for (const w of line.words) {
      c.fillStyle = t >= w.start ? fg : dim;
      c.fillText(w.w.toUpperCase(), x, 1010);
      x += c.measureText(w.w.toUpperCase() + ' ').width;
    }
  }
}
