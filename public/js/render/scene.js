// Three.js scene: renderer, image-based lighting that follows the visitor's
// local time, the temple, characters, particles, name tags and bubbles.
import * as THREE from '../../vendor/three/build/three.module.min.js';
import { buildTemple } from './temple.js';
import { Character } from './people.js';
import { Effects } from './effects.js';
import { CameraRig } from './camera.js';
import { PostFX } from './post.js';
import { skyTexture, softDotTexture } from './textures.js';
import { stationAtPoint } from '../sim/world.js';
import { ANIM } from '../sim/ritual.js';

const MOODS = {
  day: { sky: ['#5f9fe0', '#b3d3f0', '#ece6da'], fog: '#e0ddd3', hemi: ['#dce8ff', '#a8916f', 0.55], sun: ['#fff1d8', 3.1], sunPos: [16, 26, 18], env: 0.6, night: false, exposure: 1.0, disc: '#fff4d6', hills: ['#8ea596', '#a3b5ad', '#bccac6'] },
  dusk: { sky: ['#3b4a86', '#de8a60', '#f5cc9b'], fog: '#e0aa82', hemi: ['#ffcfa8', '#5d4234', 0.5], sun: ['#ffa864', 2.3], sunPos: [-22, 9, 12], env: 0.5, night: false, exposure: 1.0, disc: '#ffb070', hills: ['#7d6a76', '#9a8088', '#b9989a'] },
  night: { sky: ['#0a1130', '#223061', '#47416a'], fog: '#2f3256', hemi: ['#7d8fd2', '#4f3e33', 0.8], sun: ['#c3d0ff', 0.75], sunPos: [-12, 28, -10], env: 0.35, night: true, exposure: 1.25, disc: '#dfe6ff', hills: ['#2b3355', '#363d63', '#454a72'] },
};

export function moodForHour(h) {
  if (h >= 6 && h < 17) return 'day';
  if (h >= 17 && h < 19) return 'dusk';
  return 'night';
}

// A soft, lumpy cloud sprite.
function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const x = 40 + Math.random() * 176;
    const y = 50 + Math.random() * 40;
    const r = 22 + Math.random() * 30;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A ring of hills with a noisy ridge line, faded by fog with distance.
function hillRing(radius, base, amp, seed, color) {
  const pos = [];
  const steps = 180;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const n = Math.sin(a * 3 + seed) * 0.5 + Math.sin(a * 7.3 + seed * 2.1) * 0.3 + Math.sin(a * 17.1 + seed * 0.7) * 0.2;
    const h = base + amp * (0.55 + 0.45 * n);
    const x = 16 + Math.cos(a) * radius;
    const z = 20 + Math.sin(a) * radius;
    pos.push(x, -3, z, x, h, z);
  }
  const idx = [];
  for (let i = 0; i < steps; i++) {
    const k = i * 2;
    idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  return new THREE.Mesh(g, m);
}

export class TempleScene {
  constructor(canvas, overlay, { quality = 'high' } = {}) {
    this.quality = quality;
    const high = quality === 'high';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !high, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = high;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.pixelCap = high ? 1.5 : 1.4;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 260);
    this.rig = new CameraRig(this.camera);
    this.overlay = overlay;
    this.pmrem = new THREE.PMREMGenerator(this.renderer);

    this.hemi = new THREE.HemisphereLight('#e6efff', '#b8a17f', 0.6);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff0d2', 3);
    this.sun.castShadow = high;
    if (high) {
      this.sun.shadow.mapSize.set(2048, 2048);
      const sc = this.sun.shadow.camera;
      sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 90;
      this.sun.shadow.bias = -0.0005;
      this.sun.shadow.normalBias = 0.025;
    }
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.sun.target.position.set(16, 0, 20);

    const temple = buildTemple({ shadows: high, detail: high ? 'high' : 'low' });
    this.temple = temple;
    this.scene.add(temple.root);
    this.addScenery();

    this.effects = new Effects(this.scene, { maxSmoke: high ? 420 : 220 });
    this.chars = new Map();
    this.selfChar = null;
    this.selfRing = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.41, 40), new THREE.MeshBasicMaterial({ color: '#f3c74f', transparent: true, opacity: 0.8, depthWrite: false }));
    this.selfRing.rotation.x = -Math.PI / 2;
    this.selfRing.position.y = 0.02;
    this.scene.add(this.selfRing);
    this.targetMark = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.24, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.0, depthWrite: false }));
    this.targetMark.rotation.x = -Math.PI / 2;
    this.targetMark.position.y = 0.02;
    this.scene.add(this.targetMark);
    this.targetMarkT = 0;

    this.post = high ? new PostFX(this.renderer, this.scene, this.camera) : null;
    document.body.classList.toggle('lite', !this.post);

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.tags = new Map();
    this.bubbles = [];
    this.moodName = '';
    this.setMood('auto');
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
  }

  addScenery() {
    const group = new THREE.Group();
    // Layered hills around the basin; fog turns the far ones into haze.
    this.hills = [hillRing(95, 4, 14, 1.3, '#8ea596'), hillRing(130, 8, 22, 4.1, '#a3b5ad'), hillRing(175, 12, 34, 7.7, '#bccac6')];
    for (const h of this.hills) group.add(h);
    // The street in front of the plaza, and a row of trees across it.
    const road = new THREE.Mesh(new THREE.PlaneGeometry(140, 7), new THREE.MeshStandardMaterial({ color: '#55585d', roughness: 0.95 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(16, 0.004, 44.6);
    road.receiveShadow = true;
    group.add(road);
    const curb = new THREE.Mesh(new THREE.PlaneGeometry(140, 0.25), new THREE.MeshStandardMaterial({ color: '#d8d2c6', roughness: 0.9 }));
    curb.rotation.x = -Math.PI / 2;
    curb.position.set(16, 0.006, 41.15);
    group.add(curb);
    const leafA = new THREE.MeshStandardMaterial({ color: '#557f41', roughness: 0.95 });
    const leafB = new THREE.MeshStandardMaterial({ color: '#6d9550', roughness: 0.95 });
    const bark = new THREE.MeshStandardMaterial({ color: '#5e4433', roughness: 0.95 });
    const crownGeo = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < 18; i++) {
      const x = -26 + i * 5.4;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 2.4, 7), bark);
      trunk.position.set(x, 1.2, 49.5);
      group.add(trunk);
      for (const [dx, dy, s, m] of [[0, 3.3, 1.7, leafA], [0.8, 2.9, 1.1, leafB], [-0.7, 3.0, 1.2, leafB]]) {
        const crown = new THREE.Mesh(crownGeo, m);
        crown.position.set(x + dx, dy, 49.5 + (i % 2 ? 0.4 : -0.4));
        crown.scale.set(s, s * 0.82, s);
        group.add(crown);
      }
    }
    this.scene.add(group);
    this.skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(220, 32, 16), this.skyMat);
    sky.position.set(16, 0, 20);
    sky.renderOrder = -2;
    this.scene.add(sky);
    // Sun (or moon) glow and a few clouds, drawn behind everything.
    this.discMat = new THREE.SpriteMaterial({ map: softDotTexture(), color: '#fff4d6', transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    this.disc = new THREE.Sprite(this.discMat);
    this.disc.scale.set(40, 40, 1);
    this.disc.renderOrder = -1;
    this.scene.add(this.disc);
    const cloudMat = new THREE.SpriteMaterial({ map: cloudTexture(), transparent: true, depthWrite: false, fog: false, opacity: 0.8 });
    this.clouds = [];
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Sprite(cloudMat);
      const a = -Math.PI * 0.15 - (i / 9) * Math.PI * 1.7;
      c.position.set(16 + Math.cos(a) * 170, 46 + (i % 3) * 14, 20 + Math.sin(a) * 170);
      c.scale.set(70 + (i % 4) * 16, 30 + (i % 3) * 8, 1);
      c.renderOrder = -1;
      this.scene.add(c);
      this.clouds.push(c);
    }
    this.cloudMat = cloudMat;
  }

  // Image-based lighting rendered from a tiny sky + ground + sun scene, so
  // glazed tiles, gold leaf and bronze pick up the time of day.
  buildEnvironment(m) {
    const env = new THREE.Scene();
    const skyTex = skyTexture(...m.sky);
    const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide });
    const skyGeo = new THREE.SphereGeometry(50, 32, 16);
    env.add(new THREE.Mesh(skyGeo, skyMat));
    const groundGeo = new THREE.CircleGeometry(50, 32);
    const groundMat = new THREE.MeshBasicMaterial({ color: m.night ? '#2a2420' : '#b3a48d' });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2;
    env.add(ground);
    const sunGeo = new THREE.SphereGeometry(4, 16, 8);
    const sunMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(m.disc).multiplyScalar(m.night ? 1.5 : 7) });
    const sun = new THREE.Mesh(sunGeo, sunMat);
    sun.position.copy(new THREE.Vector3(...m.sunPos).normalize().multiplyScalar(40));
    env.add(sun);
    const rt = this.pmrem.fromScene(env, 0.02);
    for (const o of [skyGeo, groundGeo, sunGeo, skyMat, groundMat, sunMat, skyTex]) o.dispose();
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = m.env;
  }

  setMood(mode) {
    this.moodMode = mode;
    const name = mode === 'auto' ? moodForHour(new Date().getHours()) : mode;
    if (name === this.moodName) return;
    this.moodName = name;
    const m = MOODS[name];
    if (this.skyMat.map) this.skyMat.map.dispose();
    this.skyMat.map = skyTexture(...m.sky);
    this.skyMat.needsUpdate = true;
    this.scene.fog = new THREE.Fog(m.fog, 50, 210);
    this.scene.background = new THREE.Color(m.sky[2]);
    this.hemi.color.set(m.hemi[0]);
    this.hemi.groundColor.set(m.hemi[1]);
    this.hemi.intensity = m.hemi[2];
    this.sun.color.set(m.sun[0]);
    this.sun.intensity = m.sun[1];
    this.sun.position.set(16 + m.sunPos[0], m.sunPos[1], 20 + m.sunPos[2]);
    this.renderer.toneMappingExposure = m.exposure;
    this.night = m.night;
    m.hills.forEach((c, i) => this.hills[i].material.color.set(c));
    const dir = new THREE.Vector3(...m.sunPos).normalize();
    this.disc.position.set(16 + dir.x * 200, Math.max(18, dir.y * 200), 20 + dir.z * 200);
    this.discMat.color.set(m.disc);
    this.disc.scale.setScalar(m.night ? 18 : 46);
    this.cloudMat.opacity = m.night ? 0.18 : 0.8;
    this.cloudMat.color.set(m.night ? '#8a93c0' : name === 'dusk' ? '#ffd9c0' : '#ffffff');
    this.buildEnvironment(m);
    this.post?.setNight(m.night);
  }

  resize(width, height) {
    const ratio = Math.min(window.devicePixelRatio || 1, this.pixelCap);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const pxPerUnit = (height * ratio) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.effects.setScale(pxPerUnit);
    this.post?.setSize(width, height, ratio);
    this.viewW = width;
    this.viewH = height;
  }

  // Called when frames stay slow: drop the costliest effects first.
  lowerQuality() {
    if (this.post && this.post.degrade()) return;
    this.pixelCap = Math.max(0.8, this.pixelCap - 0.3);
    if (this.renderer.shadowMap.enabled && this.pixelCap < 1.3) {
      this.renderer.shadowMap.enabled = false;
      this.sun.castShadow = false;
    }
    this.resize(this.viewW, this.viewH);
  }

  ensureSelf(look) {
    if (this.selfChar) return;
    this.selfChar = new Character(look, { blobShadow: !this.renderer.shadowMap.enabled, castShadow: true });
    this.scene.add(this.selfChar.root);
  }

  setSelfLook(look) {
    if (this.selfChar) {
      this.scene.remove(this.selfChar.root);
      this.selfChar.dispose();
      this.selfChar = null;
    }
    this.ensureSelf(look);
  }

  // others: [{ id, x, y, heading, anim, speed, flags, kind, name, look }]
  syncAgents(others, now, dt) {
    const seen = new Set();
    for (const o of others) {
      seen.add(o.id);
      let c = this.chars.get(o.id);
      if (!c) {
        c = new Character(o.look, { blobShadow: !this.renderer.shadowMap.enabled, castShadow: this.quality === 'high' });
        this.chars.set(o.id, c);
        this.scene.add(c.root);
      }
      c.setAnim(o.anim, now);
      c.update(dt, now, { x: o.x, y: o.y, heading: o.heading, speed: o.speed, incense: (o.flags & 2) !== 0 });
      if (o.kind === 1 && o.name) this.tagFor(o.id, o.name, c);
      const tip = c.incenseTip(this.tmp);
      if (tip) {
        this.effects.addGlow(tip.x, tip.y, tip.z, 0.07, 0.9, this.effects.tipColor);
        if (Math.random() < dt * 2.5) this.effects.emit(tip.x, tip.y + 0.02, tip.z, { size: 0.07, grow: 0.35, life: 2.2, rise: 0.3, spread: 0.01, alpha: 0.22 });
      }
    }
    for (const [id, c] of this.chars) {
      if (seen.has(id)) continue;
      this.scene.remove(c.root);
      c.dispose();
      this.chars.delete(id);
      const tag = this.tags.get(id);
      if (tag) { tag.el.remove(); this.tags.delete(id); }
    }
  }

  updateSelf(state, now, dt) {
    if (!this.selfChar) return;
    this.selfChar.setAnim(state.anim, now);
    this.selfChar.update(dt, now, state);
    const pulse = 1 + Math.sin(now * 3) * 0.06;
    this.selfRing.position.set(state.x, 0.02, state.y);
    this.selfRing.scale.setScalar(pulse * this.selfChar.scale);
    const tip = this.selfChar.incenseTip(this.tmp);
    if (tip) {
      this.effects.addGlow(tip.x, tip.y, tip.z, 0.07, 0.9, this.effects.tipColor);
      if (Math.random() < dt * 3) this.effects.emit(tip.x, tip.y + 0.02, tip.z, { size: 0.07, grow: 0.35, life: 2.2, rise: 0.3, spread: 0.01, alpha: 0.22 });
    }
  }

  showTarget(x, y) {
    this.targetMark.position.set(x, 0.02, y);
    this.targetMarkT = 1.2;
  }

  tagFor(id, name, c) {
    let tag = this.tags.get(id);
    if (!tag) {
      const el = document.createElement('div');
      el.className = 'name-tag';
      el.textContent = name;
      this.overlay.appendChild(el);
      tag = { el, c };
      this.tags.set(id, tag);
    }
    tag.c = c;
  }

  bubble(id, text, tone = '') {
    const c = id === 'self' ? this.selfChar : this.chars.get(id);
    if (!c) return;
    const el = document.createElement('div');
    el.className = `bubble ${tone}`;
    el.textContent = text;
    this.overlay.appendChild(el);
    this.bubbles.push({ el, c, t: 0, life: 2.6 });
    if (this.bubbles.length > 14) {
      const old = this.bubbles.shift();
      old.el.remove();
    }
  }

  project(c, lift = 0) {
    c.headPosition(this.tmp2);
    this.tmp2.y += lift;
    const v = this.tmp2.project(this.camera);
    if (v.z > 1 || v.z < -1) return null;
    return { x: (v.x * 0.5 + 0.5) * this.viewW, y: (-v.y * 0.5 + 0.5) * this.viewH };
  }

  updateOverlay(dt) {
    for (const [, tag] of this.tags) {
      const p = this.project(tag.c, 0.12);
      const d = tag.c.root.position.distanceTo(this.camera.position);
      if (!p || d > 28) { tag.el.style.display = 'none'; continue; }
      tag.el.style.display = '';
      tag.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
    }
    this.bubbles = this.bubbles.filter((b) => {
      b.t += dt;
      if (b.t > b.life) { b.el.remove(); return false; }
      const p = this.project(b.c, 0.35 + b.t * 0.12);
      if (!p) { b.el.style.display = 'none'; return true; }
      b.el.style.display = '';
      b.el.style.opacity = String(b.t > b.life - 0.5 ? (b.life - b.t) / 0.5 : 1);
      b.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
      return true;
    });
  }

  update(dt, now, shared, self, autoAlign) {
    if (this.moodMode === 'auto' && Math.floor(now) % 30 === 0) this.setMood('auto');
    this.temple.update(dt, now, shared, this.night);
    for (const f of this.temple.flames) {
      const flick = 0.8 + Math.sin(now * 13 + f.x * 3) * 0.12 + Math.sin(now * 7.7 + f.z) * 0.08;
      this.effects.addGlow(f.x, f.y, f.z, f.size * flick * (this.night ? 1.4 : 1), this.night ? 0.95 : 0.75);
    }
    this.effects.emitters(this.temple.smoke, dt);
    this.effects.update(dt, now);
    if (this.targetMarkT > 0) {
      this.targetMarkT -= dt;
      this.targetMark.material.opacity = Math.max(0, Math.min(0.9, this.targetMarkT));
      this.targetMark.scale.setScalar(1 + (1.2 - this.targetMarkT) * 0.6);
    }
    this.rig.update(dt, now, self, autoAlign);
    this.updateOverlay(dt);
  }

  render() {
    if (this.post) this.post.render();
    else this.renderer.render(this.scene, this.camera);
  }

  // What is under the pointer: a station (tapped object or its floor area) or a ground point.
  pick(clientX, clientY, rect) {
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.temple.pickables, false);
    const ground = this.raycaster.ray.intersectPlane(this.groundPlane, new THREE.Vector3());
    if (hits.length) return { stationId: hits[0].object.userData.stationId, point: ground ? { x: ground.x, y: ground.z } : null };
    if (!ground) return null;
    const st = stationAtPoint(ground.x, ground.z);
    if (st) return { stationId: st.id, point: { x: ground.x, y: ground.z } };
    return { point: { x: ground.x, y: ground.z } };
  }
}

export { ANIM };
