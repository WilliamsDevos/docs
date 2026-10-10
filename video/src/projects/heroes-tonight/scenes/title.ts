import type {Frame} from '../../../engine/scene';
import {clamp, ease, prog, spring} from '../../../engine/util';
import {BEAT, bar, barAt} from '../../../songs/heroes-tonight/music';
import {C, TypeScene, note, ribbon, rule, setType} from '../kit';

/** Intro: HEROES se compone letra a letra, una por tiempo; la cinta firma debajo. */
export default class Title extends TypeScene {
  draw(c: CanvasRenderingContext2D, h: CanvasRenderingContext2D, f: Frame) {
    const {t} = f;
    this.plate(c, C.ink);
    const fadeIn = prog(t, 0, 0.8);

    // Retícula suiza: márgenes y filetes, con compás y tiempo en mono (los créditos van al final).
    c.globalAlpha = fadeIn;
    rule(c, 120, 150, 1800, 150);
    rule(c, 120, 930, 1800, 930);
    const b = Math.max(0, barAt(t));
    note(c, `bar ${Math.floor(b) + 1}.${Math.floor((b % 1) * 4) + 1}`, 120, 962);
    note(c, `${t.toFixed(3)} s`, 1800, 962, {align: 'right'});
    c.globalAlpha = 1;

    // Una letra por tiempo desde el compás 0; cada una entra condensada y se expande de golpe.
    const word = 'HEROES';
    const out = prog(t, bar(3.5), bar(3.95), ease.inOutCubic);
    setType(c, 300, {weight: 900, width: 125});
    let x = 120;
    for (let i = 0; i < word.length; i++) {
      const at = bar(0) + (i + 1) * BEAT;
      const s = spring(t - at, 18, 0.7);
      if (s <= 0.001) break;
      const width = s > 0.5 ? 125 - out * 62 : 62.5;
      setType(c, 300, {weight: 900 - out * 600, width});
      c.fillStyle = C.paper;
      c.globalAlpha = clamp(s * 2) * (1 - out * 0.7);
      c.fillText(word[i]!, x, 640 + (1 - Math.min(1, s)) * 60);
      setType(c, 300, {weight: 900, width: 125});
      x += c.measureText(word[i]!).width - 6;
    }
    c.globalAlpha = 1;

    // "tonight", en serif itálica, como una nota a mano.
    const ton = spring(t - bar(2.5), 10, 0.9);
    if (ton > 0.001) {
      setType(c, 96, {family: 'serif', italic: true});
      c.fillStyle = C.ash;
      c.globalAlpha = Math.min(1, ton) * (1 - out);
      c.fillText('tonight', 1430, 760);
      c.globalAlpha = 1;
    }

    // La cinta firma bajo la palabra en el compás 3.
    ribbon(h, [[120, 700], [1800, 700]], prog(t, bar(3), bar(3.5), ease.inOutCubic), 4);
    return {fade: 1 - fadeIn};
  }
}
