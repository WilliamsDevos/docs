import * as THREE from 'three';
import {Layer2D} from '../engine/gl';
import {Scene, type Frame} from '../engine/scene';
import {ease, prog, spring} from '../engine/util';
import {BEAT, DURATION, TYPE_END, TYPE_START, typedAt} from '../music';
import {Backdrop, C, MONO, drawSpark, drawWindow, font, roundRect, shakeFrom} from './_kit';

const WIN_W = 1380;
const WIN_H = 820;

const THINK_START = TYPE_END + 0.2;
const TOOLS_START = 9.0;
const TOOLS = [
  {name: 'Write', arg: 'src/scenes/intro.ts', result: 'Wrote 72 lines'},
  {name: 'Write', arg: 'src/scenes/terminal.ts', result: 'Wrote 148 lines'},
  {name: 'Write', arg: 'scripts/soundtrack.ts', result: 'Wrote 131 lines'},
  {name: 'Bash', arg: 'bun scripts/render.ts video', result: null},
];
const RENDER_START = TOOLS_START + BEAT * 3;
const RENDER_END = RENDER_START + 2;
const DONE_AT = RENDER_END;

/** La terminal se dibuja en Canvas2D y se proyecta en un plano 3D que se acerca a cámara. */
export default class Terminal extends Scene {
  bg = new Backdrop();
  ui = new Layer2D(WIN_W, WIN_H);
  hot = new Layer2D(WIN_W, WIN_H);
  scene3 = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1920 / 1080, 10, 10000);
  group = new THREE.Group();
  hotMat = new THREE.MeshBasicMaterial({
    map: this.hot.texture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });

  async init() {
    const geo = new THREE.PlaneGeometry(WIN_W, WIN_H);
    const base = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({map: this.ui.texture, transparent: true, depthTest: false, depthWrite: false}));
    const glow = new THREE.Mesh(geo, this.hotMat);
    glow.renderOrder = 1;
    this.group.add(base, glow);
    this.scene3.add(this.group);
  }

  private drawTerminal(t: number, lt: number, fps: number) {
    const c = this.ui.ctx;
    const h = this.hot.ctx;
    this.ui.clear();
    this.hot.clear();
    let y = drawWindow(c, 0, 0, WIN_W, WIN_H, '~/mi-video — claude');
    const x0 = 44;
    const lh = 42;
    c.font = font(400, 25, MONO);
    h.font = font(400, 25, MONO);
    c.textBaseline = h.textBaseline = 'alphabetic';

    // Cabecera de bienvenida.
    y += 34;
    roundRect(c, x0, y, 560, 104, 14);
    c.strokeStyle = C.accent;
    c.lineWidth = 2;
    c.stroke();
    drawSpark(h, x0 + 40, y + 38, 34, {rotation: lt * 40});
    c.fillStyle = C.text;
    c.fillText('Bienvenido a ', x0 + 74, y + 47);
    c.font = font(700, 25, MONO);
    c.fillText('Claude Code', x0 + 74 + c.measureText('Bienvenido a ').width + 8, y + 47);
    c.font = font(400, 21, MONO);
    c.fillStyle = C.muted;
    c.fillText('cwd: ~/mi-video', x0 + 74, y + 82);
    c.font = font(400, 25, MONO);
    y += 104 + 56;

    // Prompt tecleado, con ajuste de línea.
    const typed = typedAt(t);
    c.fillStyle = C.muted;
    c.fillText('>', x0, y);
    const maxW = WIN_W - x0 * 2 - 40;
    const words = typed.split(/(?<= )/);
    let line = '';
    let cy = y;
    const lines: string[] = [];
    for (const w of words) {
      if (c.measureText(line + w).width > maxW && line) {
        lines.push(line);
        line = '';
      }
      line += w;
    }
    lines.push(line);
    c.fillStyle = C.text;
    lines.forEach((l, i) => {
      c.fillText(l, x0 + 36, cy);
      if (i < lines.length - 1) cy += lh;
    });
    if (t < TOOLS_START) {
      const typing = t > TYPE_START && t < TYPE_END;
      if (typing || Math.floor(t / 0.5) % 2 === 0) {
        c.fillStyle = C.text;
        c.fillRect(x0 + 36 + c.measureText(lines[lines.length - 1]!).width + 2, cy - 22, 13, 28);
      }
    }
    y = Math.max(y + lh, cy + lh) + 24;

    // Pensando…
    if (t >= THINK_START && t < TOOLS_START) {
      drawSpark(h, x0 + 12, y - 9, 26, {rotation: lt * 360});
      h.fillStyle = C.accentSoft;
      h.globalAlpha = 0.55 + 0.45 * Math.sin(t * 8);
      h.fillText('Pensando…', x0 + 40, y);
      h.globalAlpha = 1;
    }

    // Llamadas a herramientas, una por golpe.
    TOOLS.forEach((tool, i) => {
      const at = TOOLS_START + i * BEAT;
      if (t < at) return;
      const k = prog(t, at, at + 0.15, ease.outCubic);
      const yy = y + (1 - k) * 12;
      c.globalAlpha = k;
      h.globalAlpha = k;
      const running = tool.result === null && t < DONE_AT;
      const on = !running || Math.floor(t / 0.25) % 2 === 0;
      (on ? h : c).fillStyle = on ? C.green : C.muted;
      (on ? h : c).beginPath();
      (on ? h : c).arc(x0 + 10, yy - 9, 8, 0, Math.PI * 2);
      (on ? h : c).fill();
      c.font = font(700, 25, MONO);
      c.fillStyle = C.text;
      c.fillText(tool.name, x0 + 36, yy);
      let xx = x0 + 36 + c.measureText(tool.name).width;
      c.font = font(400, 25, MONO);
      c.fillStyle = C.muted;
      c.fillText('(', xx, yy);
      xx += c.measureText('(').width;
      c.fillStyle = C.text;
      c.fillText(tool.arg, xx, yy);
      xx += c.measureText(tool.arg).width;
      c.fillStyle = C.muted;
      c.fillText(')', xx, yy);
      const ry = yy + lh;
      c.fillText('└', x0 + 36, ry);
      if (tool.result) {
        c.fillText(tool.result, x0 + 76, ry);
      } else {
        const p = prog(t, RENDER_START, RENDER_END);
        const total = Math.round(DURATION * fps);
        c.fillText('Renderizando', x0 + 76, ry);
        const bx = x0 + 76 + c.measureText('Renderizando ').width + 8;
        const cells = 26;
        for (let k2 = 0; k2 < cells; k2++) {
          const filled = k2 < Math.round(p * cells);
          const ctx = filled ? h : c;
          ctx.fillStyle = filled ? C.accent : C.border;
          ctx.fillRect(bx + k2 * 16, ry - 22, 13, 26);
        }
        c.fillStyle = C.text;
        c.fillText(`${String(Math.round(p * total)).padStart(4, ' ')}/${total}`, bx + cells * 16 + 18, ry);
      }
      c.globalAlpha = 1;
      h.globalAlpha = 1;
      y += lh * 2 + 6;
    });

    // ¡Listo!
    if (t >= DONE_AT) {
      const k = prog(t, DONE_AT, DONE_AT + 0.15);
      h.globalAlpha = c.globalAlpha = k;
      h.fillStyle = C.accent;
      h.beginPath();
      h.arc(x0 + 10, y + 4, 8, 0, Math.PI * 2);
      h.fill();
      c.fillStyle = C.text;
      c.fillText('¡Listo! Video guardado en', x0 + 36, y + 13);
      h.fillStyle = C.green;
      h.fillText('out/video.mp4', x0 + 36 + c.measureText('¡Listo! Video guardado en ').width, y + 13);
      h.globalAlpha = c.globalAlpha = 1;
    }
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const {renderer} = this.ctx;
    const {lt, t} = f;
    this.bg.render(renderer, out, {t, kick: f.kick, glow: [0.5, 0.45], glowAmt: 1.2});
    this.drawTerminal(t, lt, this.ctx.fps);
    this.ui.upload();
    this.hot.upload();

    // Entrada inclinada con resorte, luego un travelling lento hacia la terminal.
    const enter = spring(lt - 0.05, 9, 0.7);
    const dolly = prog(lt, 0, 10, ease.inOutCubic);
    this.group.rotation.x = (1 - enter) * -0.9 + Math.sin(lt * 0.6) * 0.03;
    this.group.rotation.y = Math.sin(lt * 0.45) * 0.06 - (1 - enter) * 0.25;
    this.group.position.y = (1 - enter) * -260 + dolly * 40;
    const dist = 1080 / 2 / Math.tan((15 * Math.PI) / 180);
    this.camera.position.set(0, 0, dist * (0.93 - dolly * 0.1 - f.kick * 0.006));
    this.camera.lookAt(0, 0, 0);
    this.hotMat.color.setScalar(1.7 + f.kick * 1.2);

    renderer.setRenderTarget(out);
    renderer.autoClear = false;
    renderer.render(this.scene3, this.camera);

    return {
      shake: shakeFrom(f.kick, t, 3),
      ca: 1.2 + f.kick * 2.5,
      flash: 0.85 * Math.exp(-lt / 0.1),
    };
  }
}
