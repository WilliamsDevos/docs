// El héroe: una silueta con capa dibujada en Canvas2D. Todo depende de `phase` (paso) y `t`.
import {P} from './palette';

export type Pose = 'walk' | 'stand' | 'fly';

/**
 * Dibuja la silueta de espaldas con los pies en (x, y) y altura `h`.
 * `aura` 0..1 añade un contorno de luz en `glow` (la capa aditiva) para que brille.
 */
export function drawHero(
  c: CanvasRenderingContext2D,
  glow: CanvasRenderingContext2D | null,
  x: number,
  y: number,
  h: number,
  o: {pose: Pose; phase?: number; t: number; aura?: number; color?: string; wind?: number},
) {
  const {pose, phase = 0, t, aura = 0, color = P.gold, wind = 1} = o;
  const u = h / 100; // unidades: el héroe mide 100
  const swing = pose === 'walk' ? Math.sin(phase * Math.PI) : 0;
  const bob = pose === 'walk' ? Math.abs(Math.cos(phase * Math.PI)) * 1.5 : 0;

  const shape = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    ctx.translate(x, y - bob * u);
    if (pose === 'fly') ctx.rotate(-0.08);
    ctx.beginPath();
    // Capa: se ondula con el viento.
    const flap = Math.sin(t * 7) * 3 * wind;
    const flap2 = Math.sin(t * 5.3 + 1) * 4 * wind;
    ctx.moveTo(-9 * u, -74 * u);
    ctx.bezierCurveTo(-16 * u, -50 * u, -20 * u + flap * u, -25 * u, -22 * u + flap2 * u, (pose === 'fly' ? -10 : -6) * u);
    ctx.lineTo(22 * u - flap2 * u, (pose === 'fly' ? -10 : -6) * u);
    ctx.bezierCurveTo(20 * u - flap * u, -25 * u, 16 * u, -50 * u, 9 * u, -74 * u);
    ctx.closePath();
    // Cabeza.
    ctx.moveTo(7 * u, -86 * u);
    ctx.arc(0, -86 * u, 7 * u, 0, Math.PI * 2);
    // Torso.
    ctx.moveTo(-10 * u, -76 * u);
    ctx.quadraticCurveTo(-12 * u, -55 * u, -7 * u, -44 * u);
    ctx.lineTo(7 * u, -44 * u);
    ctx.quadraticCurveTo(12 * u, -55 * u, 10 * u, -76 * u);
    ctx.closePath();
    ctx.fill();
    // Piernas y brazos como trazos gruesos.
    ctx.lineCap = 'round';
    ctx.lineWidth = 6.5 * u;
    const limb = (x0: number, y0: number, x1: number, y1: number) => {
      ctx.beginPath();
      ctx.moveTo(x0 * u, y0 * u);
      ctx.lineTo(x1 * u, y1 * u);
      ctx.stroke();
    };
    if (pose === 'fly') {
      limb(-4, -45, -6, -12);
      limb(4, -45, 7, -14);
      limb(-9, -72, -12, -112);
      limb(9, -72, 12, -112);
    } else {
      limb(-4, -45, -5 + swing * 6, -2);
      limb(4, -45, 5 - swing * 6, -2);
      ctx.lineWidth = 5 * u;
      limb(-10, -72, -14 - swing * 3, -46);
      limb(10, -72, 14 + swing * 3, -46);
    }
    ctx.restore();
  };

  c.fillStyle = c.strokeStyle = '#04030a';
  shape(c);
  if (glow && aura > 0) {
    glow.save();
    glow.globalAlpha = Math.min(1, aura);
    glow.shadowColor = color;
    glow.shadowBlur = 30 * u * aura;
    glow.fillStyle = glow.strokeStyle = color;
    shape(glow);
    glow.restore();
    // Recorta el interior para dejar solo el contorno de luz.
    glow.save();
    glow.globalCompositeOperation = 'destination-out';
    glow.fillStyle = glow.strokeStyle = '#000';
    glow.translate(0, 0);
    shape(glow);
    glow.restore();
  }
}
