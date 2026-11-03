// Point-sprite particles in one draw call per system: incense smoke (soft,
// normal blending) and glows (candle flames, incense tips; additive).
import * as THREE from '../../vendor/three/build/three.module.min.js';
import { softDotTexture } from './textures.js';

const VERT = /* glsl */ `
attribute float size;
attribute float alpha;
attribute vec3 tint;
varying float vAlpha;
varying vec3 vTint;
uniform float scale;
void main() {
  vAlpha = alpha;
  vTint = tint;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * scale / max(0.2, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform sampler2D map;
varying float vAlpha;
varying vec3 vTint;
void main() {
  vec4 t = texture2D(map, gl_PointCoord);
  gl_FragColor = vec4(vTint, t.a * vAlpha);
  if (gl_FragColor.a < 0.004) discard;
  #include <colorspace_fragment>
}`;

let dotTexture = null;

class PointBuffer {
  constructor(max, additive) {
    if (!dotTexture) dotTexture = softDotTexture();
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.tint = new Float32Array(max * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('tint', new THREE.BufferAttribute(this.tint, 3).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(16, 2, 20), 60);
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: dotTexture }, scale: { value: 600 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    this.geometry = g;
    this.count = 0;
  }

  begin() { this.count = 0; }

  push(x, y, z, size, alpha, color) {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.size[i] = size;
    this.alpha[i] = alpha;
    this.tint[i * 3] = color.r; this.tint[i * 3 + 1] = color.g; this.tint[i * 3 + 2] = color.b;
  }

  end() {
    this.geometry.setDrawRange(0, this.count);
    for (const name of ['position', 'size', 'alpha', 'tint']) this.geometry.attributes[name].needsUpdate = true;
  }
}

export class Effects {
  constructor(scene, { maxSmoke = 420 } = {}) {
    this.smokeBuf = new PointBuffer(maxSmoke, false);
    this.glowBuf = new PointBuffer(260, true);
    scene.add(this.smokeBuf.points);
    scene.add(this.glowBuf.points);
    this.particles = [];
    this.maxSmoke = maxSmoke;
    this.smokeColor = new THREE.Color('#e9e6e1');
    this.darkSmoke = new THREE.Color('#8d8a86');
    this.flameColor = new THREE.Color('#ffb057');
    this.tipColor = new THREE.Color('#ff6a2a');
    this.glows = [];
    this.wind = 0;
  }

  setScale(pixelsPerUnitAtOne) {
    this.smokeBuf.material.uniforms.scale.value = pixelsPerUnitAtOne;
    this.glowBuf.material.uniforms.scale.value = pixelsPerUnitAtOne;
  }

  emit(x, y, z, { size = 0.3, grow = 0.9, life = 4, rise = 0.45, spread = 0.05, alpha = 0.32, dark = false } = {}) {
    if (this.particles.length >= this.maxSmoke) return;
    this.particles.push({
      x: x + (Math.random() - 0.5) * spread, y, z: z + (Math.random() - 0.5) * spread,
      vx: (Math.random() - 0.5) * 0.05, vy: rise * (0.8 + Math.random() * 0.4), vz: (Math.random() - 0.5) * 0.05,
      age: 0, life: life * (0.8 + Math.random() * 0.4), size, grow, alpha, dark,
      wob: Math.random() * 6,
    });
  }

  // Continuous emitters: { x, y, z, rate (0..1) }.
  emitters(list, dt) {
    for (const e of list) {
      if (!e.rate) continue;
      e.acc = (e.acc || 0) + dt * (e.dark ? 5 : 9) * e.rate;
      while (e.acc > 1) {
        e.acc -= 1;
        if (e.dark) this.emit(e.x, e.y, e.z, { size: 0.5, grow: 1.6, life: 3.5, rise: 0.7, spread: 0.2, alpha: 0.22, dark: true });
        else this.emit(e.x, e.y, e.z, { size: e.id === 'tiangong' ? 0.32 : 0.2, grow: e.id === 'tiangong' ? 0.95 : 0.6, life: 4.2, rise: 0.42, spread: e.id === 'tiangong' ? 0.5 : 0.08, alpha: e.id === 'tiangong' ? 0.2 : 0.24 });
      }
    }
  }

  addGlow(x, y, z, size, alpha, color = this.flameColor) {
    this.glows.push(x, y, z, size, alpha, color);
  }

  update(dt, time) {
    this.wind = Math.sin(time * 0.13) * 0.08;
    const smoke = this.smokeBuf;
    smoke.begin();
    const keep = [];
    for (const p of this.particles) {
      p.age += dt;
      if (p.age >= p.life) continue;
      p.wob += dt * 1.3;
      p.x += (p.vx + this.wind + Math.sin(p.wob) * 0.04) * dt;
      p.y += p.vy * dt;
      p.z += (p.vz + Math.cos(p.wob * 0.8) * 0.03) * dt;
      p.vy *= 1 - dt * 0.12;
      const k = p.age / p.life;
      const fade = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      smoke.push(p.x, p.y, p.z, p.size + p.grow * k, p.alpha * fade, p.dark ? this.darkSmoke : this.smokeColor);
      keep.push(p);
    }
    this.particles = keep;
    smoke.end();
    const glow = this.glowBuf;
    glow.begin();
    const g = this.glows;
    for (let i = 0; i < g.length; i += 6) glow.push(g[i], g[i + 1], g[i + 2], g[i + 3], g[i + 4], g[i + 5]);
    glow.end();
    g.length = 0;
  }
}
