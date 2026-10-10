import type {Frame} from '../../../engine/scene';
import {clamp, ease, lerp, prog, spring} from '../../../engine/util';
import {type Line, findLine, findWord} from '../../../songs/heroes-tonight/lyrics';
import {C, TypeScene, inkOf, lineIn, note, ribbon, setType} from '../kit';

type City = {name: string; lat: number; lon: number};
const CITIES: Record<string, City> = {
  london: {name: 'London', lat: 51.507, lon: -0.128},
  paris: {name: 'Paris', lat: 48.857, lon: 2.352},
  berlin: {name: 'Berlin', lat: 52.52, lon: 13.405},
  istanbul: {name: 'Istanbul', lat: 41.008, lon: 28.978},
  dubai: {name: 'Dubai', lat: 25.204, lon: 55.27},
  delhi: {name: 'Delhi', lat: 28.614, lon: 77.209},
  bangkok: {name: 'Bangkok', lat: 13.756, lon: 100.502},
  taipei: {name: 'Taipei', lat: 25.033, lon: 121.565},
};
const HOPS = ['paris', 'berlin', 'istanbul', 'dubai', 'delhi', 'bangkok'];

const fmt = (c: City) =>
  `${Math.abs(c.lat).toFixed(2)}°${c.lat >= 0 ? 'N' : 'S'} ${Math.abs(c.lon).toFixed(2)}°${c.lon >= 0 ? 'E' : 'W'}`;

/** Distancia de círculo máximo en km. */
function km(a: City, b: City) {
  const r = Math.PI / 180;
  const d = Math.acos(Math.sin(a.lat * r) * Math.sin(b.lat * r) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r));
  return d * 6371;
}

/** Interpolación de círculo máximo entre dos ciudades (0..1) → lat/lon. */
function gc(a: City, b: City, k: number): [number, number] {
  const r = Math.PI / 180;
  const v = (c: City) => [Math.cos(c.lat * r) * Math.cos(c.lon * r), Math.cos(c.lat * r) * Math.sin(c.lon * r), Math.sin(c.lat * r)];
  const A = v(a);
  const B = v(b);
  const p = A.map((x, i) => lerp(x, B[i]!, k));
  const n = Math.hypot(...p);
  return [Math.asin(p[2]! / n) / r, Math.atan2(p[1]!, p[0]!) / r];
}

/**
 * Pre-estribillo como atlas tipográfico: meridianos finos, ciudades en mono con coordenadas,
 * la cinta trazando la ruta. "around the globe" curva el mapa en un globo; "protect your soul"
 * cierra un círculo alrededor de SOUL. La segunda vez el plato va en papel con tinta.
 */
export default class Atlas extends TypeScene {
  lines: Line[];
  london: number;
  taiwan: number;
  protect: number;
  constructor(private n: number) {
    super();
    this.lines = [findLine('flying from town', n), findLine('From London', n), findLine('around the globe', n), findLine('protect your soul', n)];
    this.london = findWord(this.lines[1]!, 'London').start;
    this.taiwan = findWord(this.lines[1]!, 'Taiwan').end;
    this.protect = findWord(this.lines[3]!, 'protect').start;
  }

  draw(c: CanvasRenderingContext2D, h: CanvasRenderingContext2D, f: Frame) {
    const {t, lt} = f;
    const paper = this.n === 1;
    const bg = paper ? C.paper : C.ink;
    const fg = paper ? C.ink : C.paper;
    const dim = paper ? '#B7B1A6' : C.graphite;
    this.plate(c, bg);
    const [town, from, globe, soul] = this.lines as [Line, Line, Line, Line];

    // Proyección: equirectangular que se curva en ortográfica durante "around the globe".
    const morph = prog(t, globe.start - 0.2, globe.start + 0.6, ease.inOutCubic) * (1 - prog(t, soul.end - 0.2, soul.end + 0.3));
    const spin = prog(t, globe.start, globe.end + 0.4, ease.inOutCubic) * 360;
    const lon0 = 60 - spin;
    const R = 400 - prog(t, soul.start, soul.start + 0.6, ease.inOutCubic) * 60;
    const proj = (lat: number, lon: number): [number, number, boolean] => {
      const ex = 120 + ((lon + 20) / 160) * 1680;
      const ey = 170 + ((72 - lat) / 72) * 700;
      const r = Math.PI / 180;
      const dl = (lon - lon0) * r;
      const ox = 960 + R * Math.cos(lat * r) * Math.sin(dl);
      const oy = 560 - R * (Math.cos(0.35) * Math.sin(lat * r) - Math.sin(0.35) * Math.cos(lat * r) * Math.cos(dl));
      const front = Math.sin(0.35) * Math.sin(lat * r) + Math.cos(0.35) * Math.cos(lat * r) * Math.cos(dl) > 0;
      return [lerp(ex, ox, morph), lerp(ey, oy, morph), morph < 0.5 || front];
    };
    const path = (pts: [number, number][]) => {
      c.beginPath();
      let pen = false;
      for (const [lat, lon] of pts) {
        const [x, y, vis] = proj(lat, lon);
        if (!vis) {
          pen = false;
          continue;
        }
        if (pen) c.lineTo(x, y);
        else c.moveTo(x, y);
        pen = true;
      }
      c.stroke();
    };
    // Retícula cada 10°.
    c.strokeStyle = dim;
    c.lineWidth = 1;
    c.globalAlpha = prog(lt, 0, 0.6);
    for (let lon = -180; lon <= 180; lon += 10) path(Array.from({length: 37}, (_, i) => [-90 + i * 5, lon] as [number, number]));
    for (let lat = -80; lat <= 80; lat += 10) path(Array.from({length: 73}, (_, i) => [lat, -180 + i * 5] as [number, number]));
    if (morph > 0.01) {
      c.globalAlpha = morph;
      c.beginPath();
      c.arc(960, 560, R, 0, Math.PI * 2);
      c.strokeStyle = fg;
      c.stroke();
    }
    c.globalAlpha = 1;

    // Ruta: saltos de ciudad en ciudad durante "town to town", luego el gran arco a Taipéi.
    const hopStart = town.words[2]!.start;
    const hopEnd = from.start;
    const route: City[] = [CITIES.london!, ...HOPS.map((k) => CITIES[k]!)];
    const pts: [number, number][] = [];
    route.forEach((city, i) => {
      if (i === 0) return;
      const a = route[i - 1]!;
      const k0 = (i - 1) / (route.length - 1);
      const k1 = i / (route.length - 1);
      const k = clamp((prog(t, hopStart, hopEnd) - k0) / (k1 - k0));
      for (let s = 0; s <= 12; s++) {
        if (s / 12 > k) break;
        const [lat, lon] = gc(a, city, s / 12);
        const [x, y, vis] = proj(lat, lon);
        if (vis) pts.push([x, y]);
      }
    });
    ribbon(h, pts, 1, 3, false);
    const big: [number, number][] = [];
    const kBig = prog(t, this.london, this.taiwan, ease.inOutCubic);
    for (let s = 0; s <= 60; s++) {
      if (s / 60 > kBig) break;
      const [lat, lon] = gc(CITIES.london!, CITIES.taipei!, s / 60);
      const [x, y, vis] = proj(lat, lon);
      if (vis) big.push([x, y]);
    }
    if (big.length > 1) ribbon(h, big, 1, 5, kBig < 1);

    // Ciudades: punto y etiqueta en mono con coordenadas (las del salto se encienden al llegar).
    Object.values(CITIES).forEach((city, i) => {
      const [x, y, vis] = proj(city.lat, city.lon);
      if (!vis) return;
      const lit = city === CITIES.london || city === CITIES.taipei ? t >= this.london : prog(t, hopStart, hopEnd) >= (HOPS.indexOf(Object.keys(CITIES)[i]!) + 1) / HOPS.length;
      c.fillStyle = lit ? fg : dim;
      c.beginPath();
      c.arc(x, y, lit ? 5 : 3, 0, Math.PI * 2);
      c.fill();
      if (morph < 0.5) {
        c.globalAlpha = 1 - morph * 2;
        const dec = lit ? 1 : prog(f.lt, 0.2 + i * 0.08, 0.9 + i * 0.08);
        note(c, city.name, x + 12, y - 8, {color: lit ? fg : dim, size: 15, decode: dec, t});
        note(c, fmt(city), x + 12, y + 12, {color: dim, size: 12, decode: dec, t, seed: i * 13});
        c.globalAlpha = 1;
      }
    });

    // LONDON y TAIWAN gigantes sobre sus ciudades.
    for (const [w, city, dy] of [['London', CITIES.london!, -40], ['Taiwan', CITIES.taipei!, 120]] as const) {
      const word = findWord(from, w);
      const s = spring(t - word.start, 14, 0.7);
      if (s <= 0.001 || t > from.end + 0.6) continue;
      const [x, y] = proj(city.lat, city.lon);
      setType(c, 120, {weight: 900, width: 112.5});
      c.fillStyle = fg;
      c.globalAlpha = Math.min(1, s) * (1 - prog(t, from.end + 0.2, from.end + 0.6));
      c.textAlign = w === 'Taiwan' ? 'right' : 'left';
      c.fillText(w.toUpperCase(), x + (w === 'Taiwan' ? 40 : -20), y + dy);
      c.textAlign = 'left';
      c.globalAlpha = 1;
    }
    if (t >= this.london) {
      const d = km(CITIES.london!, CITIES.taipei!) * kBig;
      note(c, `${Math.round(d).toLocaleString('en')} km`, 1800, 1000, {align: 'right', color: fg, size: 22});
    }

    // La letra: arriba a la izquierda, grande, karaoke palabra a palabra.
    const line = [town, from, globe, soul].find((l) => t >= l.start - 0.4 && t < l.end + 0.3);
    if (line && line !== from) {
      setType(c, 64, {weight: 800, width: 100});
      let x = 120;
      for (const w of line.words) {
        c.fillStyle = fg;
        c.globalAlpha = lineIn(line, t) * inkOf(w, t);
        c.fillText(w.w, x, 120);
        x += c.measureText(w.w + ' ').width;
      }
      c.globalAlpha = 1;
    }

    // "protect your soul": SOUL en el centro del globo y la cinta lo rodea.
    const soulWord = soul.words[soul.words.length - 1]!;
    if (t >= soulWord.start - 0.3) {
      setType(c, 150, {weight: 900, width: 125});
      c.fillStyle = fg;
      c.globalAlpha = inkOf(soulWord, t);
      c.textAlign = 'center';
      c.fillText('SOUL', 960, 612);
      c.textAlign = 'left';
      c.globalAlpha = 1;
    }
    const ring = prog(t, this.protect, soulWord.start + 0.4, ease.inOutCubic);
    if (ring > 0) {
      const pts2: [number, number][] = Array.from({length: 97}, (_, i) => {
        const a = -Math.PI / 2 + (i / 96) * Math.PI * 2;
        return [960 + Math.cos(a) * (R + 30), 560 + Math.sin(a) * (R + 30)];
      });
      ribbon(h, pts2, ring, 5);
    }
    note(c, paper ? 'Atlas · II' : 'Atlas · I', 120, 1000, {color: dim});
  }
}
