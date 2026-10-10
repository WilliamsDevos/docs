import type {Frame} from '../../../engine/scene';
import {clamp, ease, mulberry32, prog, spring} from '../../../engine/util';
import {type Line, findLine, findWord} from '../../../songs/heroes-tonight/lyrics';
import {rhythm} from '../../../songs/heroes-tonight/music';
import {C, TypeScene, inkOf, lineIn, note, ribbon, rule, setType} from '../kit';

/** La mecha: curva suave de izquierda a derecha por la parte baja. */
const fuse = (k: number): [number, number] => [120 + k * 1680, 860 - Math.sin(k * Math.PI * 2.2) * 40 - k * 120];
const FUSE_PTS = (from: number, to: number) => Array.from({length: 81}, (_, i) => fuse(from + ((to - from) * i) / 80));

/**
 * Estrofa 2: "I'm feeling like a dynamite / Ready to explode right up in the sky /
 * I need you to listen, I need you to hear / And don't show any fear".
 * La cinta es una mecha que arde hasta la palabra "explode"; EXPLODE salta letra a letra;
 * LISTEN y HEAR descansan sobre un osciloscopio con la envolvente real de la voz; FEAR tiembla y se encoge.
 */
export default class Dynamite extends TypeScene {
  l1: Line = findLine('dynamite');
  l2: Line = findLine('explode');
  l3: Line = findLine('need you to listen');
  l4: Line = findLine("don't show any fear");
  boom = findWord(this.l2, 'explode').start;
  pieces = (() => {
    const r = mulberry32(31);
    return 'EXPLODE'.split('').map((ch) => ({ch, vx: (r() - 0.5) * 1400, vy: -500 - r() * 900, spin: (r() - 0.5) * 12}));
  })();

  draw(c: CanvasRenderingContext2D, h: CanvasRenderingContext2D, f: Frame) {
    const {t} = f;
    this.plate(c, C.ink);
    if (t < this.l3.start - 0.3) return this.fuseAndBoom(c, h, f);
    return this.listen(c, h, f);
  }

  private fuseAndBoom(c: CanvasRenderingContext2D, h: CanvasRenderingContext2D, f: Frame) {
    const {t} = f;
    const k = prog(t, this.l1.start, this.boom);
    // Lo que queda de mecha en gris; lo que arde, la cinta.
    c.strokeStyle = C.graphite;
    c.lineWidth = 3;
    c.beginPath();
    FUSE_PTS(k, 1).forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.stroke();
    if (t < this.boom) ribbon(h, FUSE_PTS(Math.max(0, k - 0.04), k), 1, 5, true);

    // "I'm feeling like a": pequeño sobre la mecha. DYNAMITE: cartuchos apretados.
    setType(c, 46, {weight: 500});
    let x = 120;
    for (const w of this.l1.words.slice(0, -1)) {
      c.fillStyle = C.paper;
      c.globalAlpha = lineIn(this.l1, t) * inkOf(w, t);
      c.fillText(w.w, x, 300);
      x += c.measureText(w.w + ' ').width;
    }
    c.globalAlpha = 1;
    const dyn = this.l1.words[this.l1.words.length - 1]!;
    if (t >= dyn.start - 0.3 && t < this.boom) {
      setType(c, 220, {weight: 900, width: 62.5});
      const letters = 'DYNAMITE'.split('');
      let lx = 120;
      letters.forEach((ch, i) => {
        const w = c.measureText(ch).width;
        const on = t >= dyn.start + i * 0.04;
        c.fillStyle = on ? C.signal : C.ink2;
        c.fillRect(lx - 4, 330, w + 8, 250);
        c.fillStyle = on ? C.paper : C.graphite;
        c.fillText(ch, lx, 540);
        lx += w + 14;
      });
      rule(c, 110, 455, lx, 455, C.ink, 6); // la cinta que ata los cartuchos
    }

    // "Ready to": antes de la explosión. EXPLODE: letras que salen volando con gravedad.
    if (t >= this.l2.start - 0.4 && t < this.boom) {
      setType(c, 46, {weight: 500});
      c.fillStyle = C.paper;
      c.globalAlpha = inkOf(this.l2.words[0]!, t);
      c.fillText('Ready to', 120, 680);
      c.globalAlpha = 1;
    }
    if (t >= this.boom) {
      const a = t - this.boom;
      const [ex, ey] = fuse(1);
      setType(c, 200, {weight: 900, width: 112.5});
      this.pieces.forEach((p, i) => {
        const px = ex - 700 + i * 150 + p.vx * a * 0.6;
        const py = ey - 80 + p.vy * a + 1300 * a * a;
        c.save();
        c.translate(px, py);
        c.rotate(p.spin * a);
        c.fillStyle = i % 2 ? C.paper : C.ash;
        c.fillText(p.ch, -60, 70);
        c.restore();
      });
      const g = h.createRadialGradient(ex, ey, 0, ex, ey, 600);
      g.addColorStop(0, `rgba(255,240,230,${Math.exp(-a / 0.15)})`);
      g.addColorStop(0.2, `rgba(255,59,47,${0.8 * Math.exp(-a / 0.3)})`);
      g.addColorStop(1, 'rgba(255,59,47,0)');
      h.fillStyle = g;
      h.fillRect(0, 0, 1920, 1080);
      // "right up in the sky": las palabras suben.
      setType(c, 90, {weight: 800, width: 112.5});
      this.l2.words.slice(3).forEach((w, i) => {
        if (t < w.start - 0.1) return;
        const rise = prog(t, w.start, w.start + 1.6, ease.outCubic);
        c.fillStyle = C.paper;
        c.globalAlpha = inkOf(w, t);
        c.fillText(w.w.toUpperCase(), 160 + i * 330, 820 - rise * 520 - i * 30);
      });
      c.globalAlpha = 1;
      return {shake: [Math.sin(t * 95) * 18 * Math.exp(-a / 0.25), Math.cos(t * 71) * 14 * Math.exp(-a / 0.25)] as [number, number], ca: 0.5 + 6 * Math.exp(-a / 0.3), flash: 0.9 * Math.exp(-a / 0.12)};
    }
  }

  private listen(c: CanvasRenderingContext2D, h: CanvasRenderingContext2D, f: Frame) {
    const {t} = f;
    // Osciloscopio: los últimos 3 s de la envolvente de la voz, desplazándose.
    const y0 = 640;
    for (let i = 0; i <= 8; i++) rule(c, 120, y0 - 240 + i * 60, 1800, y0 - 240 + i * 60, C.ink2);
    for (let i = 0; i <= 14; i++) rule(c, 120 + i * 120, y0 - 240, 120 + i * 120, y0 + 240, C.ink2);
    c.strokeStyle = C.paper;
    c.lineWidth = 2;
    c.beginPath();
    for (let i = 0; i <= 420; i++) {
      const tt = t - 3 + (i / 420) * 3;
      const v = rhythm.audio!(tt).vocal;
      const wave = Math.sin(tt * 220) * v;
      const x = 120 + (i / 420) * 1680;
      const y = y0 - wave * 220;
      if (i) c.lineTo(x, y);
      else c.moveTo(x, y);
    }
    c.stroke();
    note(c, 'voz · envolvente real', 120, y0 + 280);

    if (t < this.l4.start - 0.3) {
      // LISTEN / HEAR grandes; el resto pequeño.
      setType(c, 46, {weight: 500});
      let x = 120;
      for (const w of this.l3.words) {
        const key = /listen|hear/i.test(w.w);
        if (key) continue;
        c.fillStyle = C.paper;
        c.globalAlpha = inkOf(w, t) * lineIn(this.l3, t);
        c.fillText(w.w, x, 200);
        x += c.measureText(w.w + ' ').width;
      }
      c.globalAlpha = 1;
      for (const w of this.l3.words.filter((w) => /listen|hear/i.test(w.w))) {
        if (t < w.start - 0.1) continue;
        const s = spring(t - w.start, 16, 0.6);
        const text = w.w.replace(/[^a-z]/gi, '').toUpperCase();
        setType(c, 230, {weight: 900, width: text === 'HEAR' ? 125 : 87.5});
        c.fillStyle = C.paper;
        c.globalAlpha = clamp(s);
        c.fillText(text, text === 'HEAR' ? 1050 : 120, y0 + 80 - (1 - Math.min(1, s)) * 40);
        c.globalAlpha = 1;
      }
      return;
    }
    // "And don't show any fear": FEAR, trazo finísimo, tiembla y se encoge hasta desaparecer.
    setType(c, 46, {weight: 500});
    let x = 120;
    for (const w of this.l4.words.slice(0, -1)) {
      c.fillStyle = C.paper;
      c.globalAlpha = inkOf(w, t);
      c.fillText(w.w, x, 200);
      x += c.measureText(w.w + ' ').width;
    }
    c.globalAlpha = 1;
    const fear = this.l4.words[this.l4.words.length - 1]!;
    if (t >= fear.start - 0.2) {
      const shrink = prog(t, fear.start + 0.3, fear.start + 1.6, ease.inCubic);
      const size = 300 * (1 - shrink * 0.95);
      const jitter = (1 - shrink) * 6;
      setType(c, size, {weight: 100, width: 100});
      c.fillStyle = C.paper;
      c.textAlign = 'center';
      c.fillText('FEAR', 960 + Math.sin(t * 131) * jitter, y0 + size * 0.35 + Math.cos(t * 117) * jitter);
      c.textAlign = 'left';
      ribbon(h, [[700, y0 + 10], [1220, y0 + 10]], prog(t, fear.start + 0.2, fear.start + 0.5), 6, false);
    }
  }
}
