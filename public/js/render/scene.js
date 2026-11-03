// Three.js scene: renderer, lighting (follows the visitor's local time),
// the temple, characters, particles, floating name tags and speech bubbles.
import * as THREE from '../../vendor/three/build/three.module.min.js';
import { buildTemple } from './temple.js';
import { Character } from './people.js';
import { Effects } from './effects.js';
import { CameraRig } from './camera.js';
import { skyTexture } from './textures.js';
import { stationAtPoint } from '../sim/world.js';
import { ANIM } from '../sim/ritual.js';

const MOODS = {
  day: { sky: ['#7fb6ef', '#bcdcf7', '#f3eee4'], fog: '#e9e6dc', hemi: ['#e6efff', '#b8a17f', 1.25], sun: ['#fff0d2', 2.5], sunPos: [14, 24, 16], night: false, exposure: 1.0 },
  dusk: { sky: ['#4c5f9c', '#e79a6b', '#f8d7a8'], fog: '#e7b78f', hemi: ['#ffd2b0', '#6b4b3a', 0.9], sun: ['#ffae6a', 1.6], sunPos: [-18, 8, 10], night: false, exposure: 1.0 },
  night: { sky: ['#0b1230', '#23305e', '#4a4366'], fog: '#33355a', hemi: ['#8193d6', '#5a4536', 1.15], sun: ['#c3d0ff', 0.9], sunPos: [-10, 26, -8], night: true, exposure: 1.3 },
};

export function moodForHour(h) {
  if (h >= 6 && h < 17) return 'day';
  if (h >= 17 && h < 19) return 'dusk';
  return 'night';
}

export class TempleScene {
  constructor(canvas, overlay, { quality = 'high' } = {}) {
    this.quality = quality;
    const high = quality === 'high';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: high, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = high;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.pixelCap = high ? 2 : 1.4;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 400);
    this.rig = new CameraRig(this.camera);
    this.overlay = overlay;

    this.hemi = new THREE.HemisphereLight('#e6efff', '#b8a17f', 1.2);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff0d2', 2.4);
    this.sun.castShadow = high;
    if (high) {
      this.sun.shadow.mapSize.set(2048, 2048);
      const sc = this.sun.shadow.camera;
      sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 90;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.03;
    }
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.sun.target.position.set(16, 0, 20);

    const temple = buildTemple({ shadows: high });
    this.temple = temple;
    this.scene.add(temple.root);
    this.addScenery();

    this.effects = new Effects(this.scene, { maxSmoke: high ? 420 : 220 });
    this.chars = new Map();
    this.selfChar = null;
    this.selfRing = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 32), new THREE.MeshBasicMaterial({ color: '#f3c74f', transparent: true, opacity: 0.85, depthWrite: false }));
    this.selfRing.rotation.x = -Math.PI / 2;
    this.selfRing.position.y = 0.02;
    this.scene.add(this.selfRing);
    this.targetMark = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.24, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.0, depthWrite: false }));
    this.targetMark.rotation.x = -Math.PI / 2;
    this.targetMark.position.y = 0.02;
    this.scene.add(this.targetMark);
    this.targetMarkT = 0;

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
    // Distant hills and a hazy skyline so the temple sits in a place.
    const group = new THREE.Group();
    const hillMat = new THREE.MeshLambertMaterial({ color: '#7f9a86' });
    const cityMat = new THREE.MeshLambertMaterial({ color: '#a8aeb8' });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = 120 + (i % 3) * 18;
      const h = 18 + ((i * 7) % 5) * 6;
      const m = new THREE.Mesh(new THREE.ConeGeometry(28 + (i % 4) * 6, h, 7), hillMat);
      m.position.set(16 + Math.cos(a) * r, h / 2 - 2, 20 + Math.sin(a) * r);
      group.add(m);
    }
    // A hazy skyline behind the temple (north), never in front of the street.
    for (let i = 0; i < 26; i++) {
      const a = Math.PI * 1.15 + (i / 25) * Math.PI * 0.7;
      const r = 85 + (i % 4) * 9;
      const h = 10 + ((i * 13) % 9) * 3.5;
      const m = new THREE.Mesh(new THREE.BoxGeometry(7, h, 7), cityMat);
      m.position.set(16 + Math.cos(a) * r, h / 2, 20 + Math.sin(a) * r);
      group.add(m);
    }
    // The street in front of the plaza, and a row of trees across it.
    const road = new THREE.Mesh(new THREE.PlaneGeometry(140, 7), new THREE.MeshLambertMaterial({ color: '#5d5f63' }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(16, 0.004, 44.6);
    road.receiveShadow = true;
    group.add(road);
    const curb = new THREE.Mesh(new THREE.PlaneGeometry(140, 0.25), new THREE.MeshLambertMaterial({ color: '#d8d2c6' }));
    curb.rotation.x = -Math.PI / 2;
    curb.position.set(16, 0.006, 41.15);
    group.add(curb);
    const leaf = new THREE.MeshLambertMaterial({ color: '#5d8a46' });
    const bark = new THREE.MeshLambertMaterial({ color: '#6b4c37' });
    for (let i = 0; i < 18; i++) {
      const x = -26 + i * 5.4;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 2.2, 6), bark);
      trunk.position.set(x, 1.1, 49.5);
      group.add(trunk);
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6 + (i % 3) * 0.3, 0), leaf);
      crown.position.set(x, 3.2, 49.5);
      group.add(crown);
    }
    this.scene.add(group);
    this.skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), this.skyMat);
    sky.position.set(16, 0, 20);
    sky.renderOrder = -1;
    this.scene.add(sky);
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
    this.scene.fog = new THREE.Fog(m.fog, 45, 230);
    this.scene.background = new THREE.Color(m.sky[2]);
    this.hemi.color.set(m.hemi[0]);
    this.hemi.groundColor.set(m.hemi[1]);
    this.hemi.intensity = m.hemi[2];
    this.sun.color.set(m.sun[0]);
    this.sun.intensity = m.sun[1];
    this.sun.position.set(16 + m.sunPos[0], m.sunPos[1], 20 + m.sunPos[2]);
    this.renderer.toneMappingExposure = m.exposure;
    this.night = m.night;
  }

  resize(width, height) {
    const ratio = Math.min(window.devicePixelRatio || 1, this.pixelCap);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const pxPerUnit = (height * ratio) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.effects.setScale(pxPerUnit);
    this.viewW = width;
    this.viewH = height;
  }

  lowerQuality() {
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
    this.renderer.render(this.scene, this.camera);
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
