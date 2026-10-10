// Utilidades puras. Todo lo visual es función de `t`: nada de Math.random() ni Date.now().

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, x: number) => a + (b - a) * x;
export const remap = (x: number, a: number, b: number, c = 0, d = 1) =>
  lerp(c, d, clamp((x - a) / (b - a)));
export const smoothstep = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};

export const ease = {
  linear: (x: number) => x,
  inCubic: (x: number) => x * x * x,
  outCubic: (x: number) => 1 - Math.pow(1 - x, 3),
  inOutCubic: (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  outExpo: (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  outBack: (x: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  },
};

/** Progreso 0..1 de `t` entre `a` y `b`, con curva opcional. */
export const prog = (t: number, a: number, b: number, e: (x: number) => number = ease.linear) =>
  e(clamp((t - a) / (b - a)));

/** Resorte críticamente amortiguado (forma cerrada): 0 en t<=0, tiende a 1. */
export const spring = (t: number, stiffness = 14, damping = 0.55) => {
  if (t <= 0) return 0;
  const w = stiffness;
  const z = damping;
  if (z >= 1) return 1 - (1 + w * t) * Math.exp(-w * t);
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
};

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Envolvente 0..1 que decae tras el último evento anterior a `t`. */
export function hit(events: number[], t: number, halfLife = 0.12) {
  // Búsqueda binaria: los eventos están ordenados.
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid]! <= t) lo = mid + 1;
    else hi = mid;
  }
  const last = lo > 0 ? events[lo - 1]! : -Infinity;
  return last === -Infinity ? 0 : Math.pow(0.5, (t - last) / halfLife);
}
