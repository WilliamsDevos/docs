import * as THREE from 'three';
import {FSPass} from '../../engine/gl';

export const HORIZON = 620;

/** Calle en perspectiva con línea discontinua, bordillos y farolas con su charco de luz. */
export class Street {
  pass = new FSPass(
    /* glsl */ `
    uniform float scroll, camY, lamps;
    varying vec2 vUv;
    const float HZ = ${HORIZON}.0;
    const float F = 900.0;
    void main() {
      vec2 px = vec2(vUv.x * 1920.0, (1.0 - vUv.y) * 1080.0 + camY);
      vec3 c = vec3(0.0);
      float a = 0.0;
      if (px.y > HZ + 0.5) {
        float z = F / (px.y - HZ);
        float x = (px.x - 960.0) * z / F;
        float zw = z + scroll;
        float ax = abs(x);
        c = vec3(0.012, 0.012, 0.022) + 0.004 * hash12(floor(vec2(x * 8.0, zw * 8.0)));
        c = mix(c, vec3(0.03, 0.028, 0.04), step(3.0, ax));                              // acera
        c += vec3(0.12) * step(ax, 0.07) * step(fract(zw / 4.0), 0.45) * smoothstep(60.0, 5.0, z); // línea central
        c += vec3(0.05) * smoothstep(0.06, 0.0, abs(ax - 3.0));                          // bordillo
        // Charcos de luz de las farolas (cada 8 unidades, a ambos lados).
        float zl = floor(zw / 8.0) * 8.0;
        for (int k = 0; k < 2; k++) {
          float lz = zl + float(k) * 8.0 + 4.0;
          for (int s = -1; s <= 1; s += 2) {
            vec2 d = vec2(x - float(s) * 3.6, (zw - lz) * 0.6);
            c += vec3(1.0, 0.55, 0.22) * 0.22 * exp(-dot(d, d) * 0.35) * lamps;
          }
        }
        // Niebla hacia el horizonte.
        c = mix(c, vec3(0.09, 0.04, 0.12), smoothstep(8.0, 70.0, z));
        a = 1.0;
      }
      // Postes y bombillas.
      for (int k = 0; k < 9; k++) {
        float lz = floor(scroll / 8.0) * 8.0 + float(k) * 8.0 + 4.0 - scroll;
        if (lz < 1.2) continue;
        for (int s = -1; s <= 1; s += 2) {
          float sx = 960.0 + float(s) * 3.6 * F / lz;
          float by = HZ + F / lz;
          float ty = by - 4.2 * F / lz;
          float w = max(1.0, 0.09 * F / lz);
          float pole = step(abs(px.x - sx), w) * step(ty, px.y) * step(px.y, by);
          c = mix(c, vec3(0.006, 0.005, 0.012), pole);
          a = max(a, pole);
          vec2 bulb = vec2(sx - float(s) * 0.5 * F / lz, ty);
          float bd = length(px - bulb) / (F / lz);
          c += vec3(1.0, 0.65, 0.3) * (smoothstep(0.18, 0.1, bd) * 3.0 + 0.25 * exp(-bd * 2.5)) * lamps;
          a = max(a, smoothstep(0.6, 0.0, bd));
        }
      }
      gl_FragColor = vec4(c, a);
    }`,
    {scroll: {value: 0}, camY: {value: 0}, lamps: {value: 1}},
    THREE.NormalBlending,
  );

  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, o: {scroll: number; camY?: number; lamps?: number}) {
    this.pass.u.scroll!.value = o.scroll;
    this.pass.u.camY!.value = o.camY ?? 0;
    this.pass.u.lamps!.value = o.lamps ?? 1;
    this.pass.render(renderer, out);
  }
}
