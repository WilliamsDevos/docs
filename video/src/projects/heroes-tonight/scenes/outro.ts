import type {Frame} from '../../../engine/scene';
import {clamp, ease, prog} from '../../../engine/util';
import {LINES} from '../../../songs/heroes-tonight/lyrics';
import {DURATION} from '../../../songs/heroes-tonight/music';
import {C, TypeScene, inkOf, note, ribbon, rule, setType} from '../kit';

/**
 * Outro, en papel: el último "I've been flying from town to town…" viaja sobre la cinta,
 * y cierra la cartela final con los créditos.
 */
export default class Outro extends TypeScene {
  lines = LINES.slice(-4);
  card = this.lines[this.lines.length - 1]!.end + 0.4;

  draw(c: CanvasRenderingContext2D, h: CanvasRenderingContext2D, f: Frame) {
    const {t, lt} = f;
    this.plate(c, C.paper);
    // La cinta cruza el plato en diagonal suave.
    const path: [number, number][] = Array.from({length: 61}, (_, i) => [120 + i * 28, 760 - Math.sin(i / 9) * 40 - i * 4]);
    const cardIn = prog(t, this.card, this.card + 0.8, ease.outCubic);
    h.globalAlpha = 1 - cardIn;
    ribbon(h, path, prog(lt, 0, 2.5, ease.inOutCubic), 3, false);
    h.globalAlpha = 1;
    // Las frases: grandes, en tinta, una encima de la cinta.
    for (const line of this.lines) {
      const a = clamp((t - (line.start - 0.4)) / 0.2) * (1 - clamp((t - line.end - 0.05) / 0.3));
      if (a <= 0) continue;
      setType(c, 88, {weight: 800, width: 100});
      let x = 120 - prog(t, line.start, line.end + 0.3) * 60;
      for (const w of line.words) {
        c.fillStyle = C.ink;
        c.globalAlpha = a * inkOf(w, t) * (1 - cardIn);
        c.fillText(w.w, x, 600);
        x += c.measureText(w.w + ' ').width;
      }
      c.globalAlpha = 1;
    }

    // Cartela final, rejilla suiza.
    if (cardIn > 0) {
      c.globalAlpha = cardIn;
      setType(c, 210, {weight: 900, width: 100});
      c.fillStyle = C.ink;
      c.fillText('HEROES', 110, 470);
      setType(c, 140, {family: 'serif', italic: true});
      c.fillText('tonight', 120, 610);
      rule(c, 1250, 300, 1250, 660, '#B7B1A6');
      const credits = ['Janji — Heroes Tonight', 'feat. Johnning', '', 'NCS Release', 'Music provided by NoCopyrightSounds', 'Free download / stream:', 'ncs.io/HeroesTonight'];
      credits.forEach((line, i) => note(c, line, 1290, 340 + i * 46, {color: i < 2 ? C.ink : C.graphite, size: 24}));
      c.globalAlpha = cardIn * prog(t, this.card + 1, this.card + 2);
      note(c, 'tipografía con código · three.js · Canvas2D · Whisper · ffmpeg', 120, 1000, {color: C.graphite});
      c.globalAlpha = 1;
      ribbon(h, [[120, 650], [1100, 650]], prog(t, this.card + 0.3, this.card + 1.2, ease.inOutCubic), 5, false);
    }
    return {fade: prog(t, DURATION - 2.5, DURATION - 0.2, ease.inOutCubic), vignette: 0.15};
  }
}
