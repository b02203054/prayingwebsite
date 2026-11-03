// Chibi visitors with procedural animation. Each character's colors are baked
// into vertex colors so every body part shares one material.
import * as THREE from '../../vendor/three/build/three.module.min.js';
import { ANIM } from '../sim/ritual.js';
import { mergeList, paint, matrixAt } from './merge.js';
import { blobShadowTexture } from './textures.js';

export const PALETTE = {
  skin: ['#f6d7bf', '#eec3a0', '#d9a477', '#a8714a'],
  hair: ['#1f1a17', '#3b2a20', '#5b3b26', '#7a4b2a', '#6a2333', '#b9b4ad'],
  top: ['#e76f51', '#2a9d8f', '#e9c46a', '#5aa9e6', '#9b8bd6', '#7cc6a4', '#f4e9d8', '#264653', '#c8553d', '#7a8a3a', '#e5989b', '#fafafa'],
  bottom: ['#3d5a80', '#2f2f36', '#b08d57', '#151515', '#6b4f3a', '#8d99ae'],
};

let sharedMaterial = null;
let shadowMaterial = null;
let shadowGeometry = null;
const itemMaterials = {};

function material() {
  if (!sharedMaterial) sharedMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 });
  return sharedMaterial;
}

function itemMat(color, emissive) {
  const key = color + (emissive || '');
  if (!itemMaterials[key]) {
    const opts = { color, roughness: 0.6 };
    if (emissive) Object.assign(opts, { emissive: new THREE.Color(emissive), emissiveIntensity: 1.4 });
    itemMaterials[key] = new THREE.MeshStandardMaterial(opts);
  }
  return itemMaterials[key];
}

function part(geometry, color, m) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  if (m) g.applyMatrix4(m);
  return paint(g, color);
}

// Darken (k < 1) or lighten (k > 1, toward white) a hex colour.
function tint(hex, k) {
  const c = new THREE.Color(hex);
  if (k <= 1) c.multiplyScalar(k);
  else c.lerp(new THREE.Color('#ffffff'), k - 1);
  return `#${c.getHexString()}`;
}

function buildUpper(look) {
  const skin = PALETTE.skin[look.skin];
  const hair = PALETTE.hair[look.age === 2 ? 5 : look.hair];
  const top = PALETTE.top[look.top];
  const parts = [];
  // Torso (lathe) from the hip pivot upward, softly rounded.
  const torso = new THREE.LatheGeometry([
    new THREE.Vector2(0.0, -0.02), new THREE.Vector2(0.13, 0.0), new THREE.Vector2(0.168, 0.07), new THREE.Vector2(0.175, 0.2),
    new THREE.Vector2(0.162, 0.32), new THREE.Vector2(0.125, 0.41), new THREE.Vector2(0.07, 0.45), new THREE.Vector2(0.0, 0.46),
  ], 22);
  parts.push(part(torso, top));
  parts.push(part(new THREE.TorusGeometry(0.088, 0.022, 8, 20), tint(top, 0.72), matrixAt(0, 0.435, 0, Math.PI / 2, 0, 0)));
  if (look.bottom === 5) {
    // Long robe with a sash.
    parts.push(part(new THREE.CylinderGeometry(0.165, 0.225, 0.3, 22, 1, true), top, matrixAt(0, -0.12, 0)));
    parts.push(part(new THREE.TorusGeometry(0.168, 0.02, 6, 24), '#c9a227', matrixAt(0, 0.07, 0, Math.PI / 2, 0, 0)));
  } else if (look.top % 3 === 0) {
    for (const y of [0.32, 0.2]) parts.push(part(new THREE.SphereGeometry(0.013, 8, 6), tint(top, 1.55), matrixAt(0, y, 0.171)));
  }
  parts.push(part(new THREE.SphereGeometry(0.2, 28, 20), skin, matrixAt(0, 0.62, 0)));
  // Hair: crown, back, style pieces, and a fringe over the forehead.
  const style = look.age === 2 ? (look.style % 2 === 0 ? 0 : 3) : look.style;
  parts.push(part(new THREE.SphereGeometry(0.214, 26, 12, 0, Math.PI * 2, 0, 1.25), hair, matrixAt(0, 0.635, -0.01)));
  const backLen = style === 1 ? 2.35 : style === 2 ? 2.2 : 1.95;
  parts.push(part(new THREE.SphereGeometry(0.212, 22, 12, Math.PI, Math.PI, 0, backLen), hair, matrixAt(0, 0.63, -0.005)));
  if (style === 2) parts.push(part(new THREE.CapsuleGeometry(0.11, 0.18, 4, 12), hair, matrixAt(0, 0.4, -0.15, 0, 0, 0, 1.35, 1, 0.55)));
  if (style === 3) parts.push(part(new THREE.SphereGeometry(0.095, 16, 12), hair, matrixAt(0, 0.86, -0.08)));
  if (style === 4) parts.push(part(new THREE.CapsuleGeometry(0.05, 0.18, 4, 10), hair, matrixAt(0, 0.56, -0.24, 0.5, 0, 0)));
  if (style === 5) parts.push(part(new THREE.SphereGeometry(0.16, 16, 8, 0, Math.PI * 2, 0, 0.9), hair, matrixAt(0.03, 0.73, 0.07, 0.5, 0, -0.2)));
  else parts.push(part(new THREE.SphereGeometry(0.17, 20, 8, 0, Math.PI * 2, 0, 0.85), hair, matrixAt(0, 0.7, 0.06, 0.62, 0, 0, 1.05, 0.7, 1)));
  if (style !== 1 && style !== 2) for (const sx of [-1, 1]) parts.push(part(new THREE.SphereGeometry(0.042, 10, 8), skin, matrixAt(sx * 0.196, 0.6, 0.0, 0, 0, 0, 0.6, 1, 0.9)));
  // Face: eyes with a highlight, brows, cheeks and a small smile.
  for (const sx of [-1, 1]) {
    parts.push(part(new THREE.SphereGeometry(0.027, 12, 10), '#241a15', matrixAt(sx * 0.072, 0.61, 0.182, 0, 0, 0, 1, 1.3, 0.6)));
    parts.push(part(new THREE.SphereGeometry(0.0085, 8, 6), '#ffffff', matrixAt(sx * 0.072 + 0.01, 0.624, 0.197)));
    parts.push(part(new THREE.BoxGeometry(0.048, 0.011, 0.01), tint(hair, 0.8), matrixAt(sx * 0.074, 0.664, 0.186, 0, 0, sx * -0.18)));
    parts.push(part(new THREE.CircleGeometry(0.03, 14), '#f0a196', matrixAt(sx * 0.115, 0.56, 0.163, 0, sx * 0.55, 0)));
  }
  parts.push(part(new THREE.TorusGeometry(0.02, 0.0055, 4, 12, Math.PI), '#8a3b30', matrixAt(0, 0.548, 0.193, 0, 0, Math.PI)));
  // Accessories.
  if (look.acc === 1) {
    parts.push(part(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 24), '#e8d9b5', matrixAt(0, 0.79, 0)));
    parts.push(part(new THREE.CylinderGeometry(0.17, 0.19, 0.12, 20), '#e8d9b5', matrixAt(0, 0.86, 0)));
    parts.push(part(new THREE.CylinderGeometry(0.193, 0.193, 0.03, 20), '#c8553d', matrixAt(0, 0.81, 0)));
  } else if (look.acc === 2) {
    for (const sx of [-1, 1]) parts.push(part(new THREE.TorusGeometry(0.03, 0.006, 6, 16), '#2b2b2b', matrixAt(sx * 0.072, 0.612, 0.192)));
    parts.push(part(new THREE.BoxGeometry(0.05, 0.008, 0.008), '#2b2b2b', matrixAt(0, 0.618, 0.197)));
  } else if (look.acc === 3) {
    parts.push(part(new THREE.CapsuleGeometry(0.1, 0.08, 4, 10), '#5c6b73', matrixAt(0, 0.25, -0.19, 0, 0, 0, 1.15, 1, 0.65)));
    for (const sx of [-1, 1]) parts.push(part(new THREE.TorusGeometry(0.14, 0.012, 4, 16, Math.PI), '#4a565c', matrixAt(sx * 0.08, 0.3, -0.02, 0, Math.PI / 2, Math.PI / 2)));
  } else if (look.acc === 4) {
    parts.push(part(new THREE.TorusGeometry(0.12, 0.042, 10, 22), '#d1495b', matrixAt(0, 0.43, 0, Math.PI / 2, 0, 0)));
  }
  return mergeList(parts);
}

function buildArm(look) {
  const top = PALETTE.top[look.top];
  const skin = PALETTE.skin[look.skin];
  return mergeList([
    part(new THREE.CapsuleGeometry(0.048, 0.17, 4, 10), top, matrixAt(0, -0.12, 0)),
    part(new THREE.TorusGeometry(0.047, 0.012, 6, 14), tint(top, 0.72), matrixAt(0, -0.215, 0, Math.PI / 2, 0, 0)),
    part(new THREE.SphereGeometry(0.052, 12, 10), skin, matrixAt(0, -0.255, 0)),
  ]);
}

function buildLeg(look) {
  const bottom = PALETTE.bottom[look.bottom === 5 ? 1 : look.bottom];
  return mergeList([
    part(new THREE.CapsuleGeometry(0.058, 0.2, 4, 10), bottom, matrixAt(0, -0.16, 0)),
    part(new THREE.SphereGeometry(0.066, 14, 10), '#2e231d', matrixAt(0, -0.302, 0.035, 0, 0, 0, 1, 0.62, 1.45)),
  ]);
}

const bow = (t, start, each, count, depth) => {
  if (t < start) return 0;
  const k = (t - start) / each;
  if (k >= count) return 0;
  const f = k - Math.floor(k);
  return Math.sin(f * Math.PI) ** 2 * depth;
};
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export class Character {
  constructor(look, { blobShadow = false, castShadow = true } = {}) {
    this.look = look;
    const scale = look.age === 0 ? 0.78 : look.age === 2 ? 0.96 : 1.0;
    this.scale = scale;
    const mat = material();
    const root = new THREE.Group();
    const body = new THREE.Group();
    body.position.y = 0.34;
    root.add(body);
    const upper = new THREE.Mesh(buildUpper(look), mat);
    body.add(upper);
    const armGeo = buildArm(look);
    const legGeo = buildLeg(look);
    const mk = (geo, parent, x, y) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const mesh = new THREE.Mesh(geo, mat);
      pivot.add(mesh);
      parent.add(pivot);
      return pivot;
    };
    this.armL = mk(armGeo, body, 0.19, 0.38);
    this.armR = mk(armGeo, body, -0.19, 0.38);
    this.legL = mk(legGeo, root, 0.08, 0.34);
    this.legR = mk(legGeo, root, -0.08, 0.34);
    if (look.age === 2) body.rotation.x = 0.08;
    // Held items.
    // Incense held in the right hand (one merged mesh); counter-rotated every
    // frame so it stays upright whatever the arm does.
    const sticks = [];
    for (const dx of [-0.018, 0, 0.018]) {
      sticks.push(part(new THREE.CylinderGeometry(0.006, 0.006, 0.34, 4), '#9c3b26', matrixAt(dx, 0.17, 0)));
      sticks.push(part(new THREE.SphereGeometry(0.012, 6, 4), '#ff7a2a', matrixAt(dx, 0.34, 0)));
    }
    const incense = new THREE.Group();
    incense.add(new THREE.Mesh(mergeList(sticks), mat));
    incense.position.set(0, -0.255, 0.035);
    incense.visible = false;
    this.armR.add(incense);
    this.incense = incense;
    this.tipAnchor = new THREE.Object3D();
    this.tipAnchor.position.set(0, 0.35, 0);
    incense.add(this.tipAnchor);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.065, 0.24, 10), itemMat('#c8a96a'));
    tube.position.set(0.19, 0.16, 0.26);
    tube.visible = false;
    body.add(tube);
    this.tube = tube;
    const paper = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.14), itemMat('#e7c45a'));
    paper.position.set(0.19, 0.12, 0.28);
    paper.visible = false;
    body.add(paper);
    this.paper = paper;
    const amulet = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.015), itemMat('#c0392b'));
    amulet.position.set(0, -0.29, 0.03);
    amulet.visible = false;
    this.armR.add(amulet);
    this.amulet = amulet;
    if (blobShadow) {
      if (!shadowMaterial) {
        shadowMaterial = new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false });
        shadowGeometry = new THREE.PlaneGeometry(0.75, 0.75);
        shadowGeometry.rotateX(-Math.PI / 2);
      }
      const sh = new THREE.Mesh(shadowGeometry, shadowMaterial);
      sh.position.y = 0.015;
      root.add(sh);
    }
    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = castShadow && o.material === mat;
        o.receiveShadow = false;
      }
    });
    root.scale.setScalar(scale);
    this.root = root;
    this.body = body;
    this.phase = Math.random() * 6;
    this.anim = ANIM.idle;
    this.animStart = 0;
    this.headLocal = new THREE.Vector3(0, 0.34 + 0.95, 0);
  }

  setAnim(anim, now) {
    if (anim !== this.anim) {
      this.anim = anim;
      this.animStart = now;
    }
  }

  // state: { x, y, heading, speed, incense (bool) }
  update(dt, now, state) {
    const s = this.scale;
    const t = now - this.animStart;
    const a = this.anim;
    let lift = 0;
    let forward = 0;
    let bodyPitch = this.look.age === 2 ? 0.08 : 0;
    let armLX = 0; let armLZ = 0.06; let armRX = 0; let armRZ = -0.06;
    let legL = 0; let legR = 0;
    const walking = state.speed > 0.08 && (a === ANIM.walk || a === ANIM.idle);
    if (walking) {
      this.phase += state.speed * dt * 7.2;
      const k = Math.min(1, state.speed / 0.9);
      const sw = Math.sin(this.phase) * 0.62 * k;
      legL = sw;
      legR = -sw;
      armLX = -sw * 0.7;
      armRX = sw * 0.7;
      lift = Math.abs(Math.sin(this.phase)) * 0.028 * k;
      bodyPitch += 0.05 * k;
    } else {
      // Breathing; legs settle back to straight.
      lift = Math.sin(now * 2.1 + this.phase) * 0.004;
      this.phase += (Math.round(this.phase / Math.PI) * Math.PI - this.phase) * Math.min(1, dt * 6);
    }
    const holding = state.incense && (a === ANIM.walk || a === ANIM.idle || a === ANIM.pray);
    if (holding && a !== ANIM.pray) {
      armRX = -0.7;
      armRZ = -0.1;
    }
    switch (a) {
      case ANIM.pray: {
        const up = ease(t / 0.5);
        armLX = armRX = -1.2 * up;
        armLZ = -0.5 * up;
        armRZ = 0.5 * up;
        bodyPitch += bow(t, 0.6, 1.25, 3, 0.45);
        break;
      }
      case ANIM.kneel: {
        const down = ease(t / 0.6);
        lift = -0.22 * down;
        legL = legR = 1.45 * down;
        armLX = armRX = -0.55 * down;
        armLZ = -0.2 * down;
        armRZ = 0.2 * down;
        bodyPitch += bow(t, 0.8, 1.4, 3, 0.95);
        break;
      }
      case ANIM.insert: {
        const k = Math.sin(Math.min(1, t / 1.3) * Math.PI);
        armRX = -1.45 * k - 0.3;
        forward = 0.2 * k;
        bodyPitch += 0.12 * k;
        break;
      }
      case ANIM.offer: {
        const k = Math.sin(Math.min(1, t / 1.5) * Math.PI);
        armLX = armRX = -0.95 * k;
        bodyPitch += 0.15 * k;
        break;
      }
      case ANIM.throw: {
        if (t < 0.55) { armLX = armRX = -1.7 * ease(t / 0.55); } else { armLX = armRX = -1.7 + 1.1 * ease((t - 0.55) / 0.3); }
        armLZ = -0.35; armRZ = 0.35;
        bodyPitch += t > 0.55 ? 0.2 : 0;
        break;
      }
      case ANIM.draw: {
        armLX = armRX = -1.05;
        armLZ = -0.42; armRZ = 0.42;
        const shake = Math.sin(t * 22) * 0.12;
        armLX += shake; armRX += shake;
        bodyPitch += 0.18;
        break;
      }
      case ANIM.burn: {
        const k = Math.sin(Math.min(1, t / 3) * Math.PI);
        armLX = armRX = -1.1 * Math.min(1, t / 0.4);
        armLZ = -0.35; armRZ = 0.35;
        forward = 0.15 * k;
        bodyPitch += 0.15;
        break;
      }
      case ANIM.lamp: {
        const k = Math.sin(Math.min(1, t / 2.5) * Math.PI);
        armRX = -2.5 * k;
        bodyPitch -= 0.08 * k;
        break;
      }
      case ANIM.amulet: {
        armRX = -1.25 + Math.sin(t * 4.5) * 0.25;
        armRZ = Math.cos(t * 4.5) * 0.3;
        bodyPitch += 0.1;
        break;
      }
      case ANIM.wave: {
        armRX = -2.7;
        armRZ = Math.sin(t * 10) * 0.35;
        break;
      }
      default:
    }
    this.incense.visible = !!state.incense && a !== ANIM.insert && a !== ANIM.burn && a !== ANIM.lamp && a !== ANIM.draw && a !== ANIM.throw;
    this.tube.visible = a === ANIM.draw;
    this.paper.visible = a === ANIM.burn && t < 2.2;
    this.amulet.visible = a === ANIM.amulet;
    this.armL.rotation.set(armLX, 0, armLZ);
    this.armR.rotation.set(armRX, 0, armRZ);
    this.incense.rotation.set(-(armRX + bodyPitch), 0, -armRZ);
    this.legL.rotation.x = legL;
    this.legR.rotation.x = legR;
    this.body.rotation.x = bodyPitch;
    this.body.position.y = 0.34;
    const hx = Math.cos(state.heading);
    const hy = Math.sin(state.heading);
    this.root.position.set(state.x + hx * forward, (lift) * s, state.y + hy * forward);
    this.root.rotation.y = Math.PI / 2 - state.heading;
  }

  headPosition(out) {
    const p = this.root.position;
    return out.set(p.x, p.y + 1.42 * this.scale, p.z);
  }

  incenseTip(out) {
    if (!this.incense.visible) return null;
    return this.tipAnchor.getWorldPosition(out);
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh && o.material === sharedMaterial) o.geometry.dispose();
    });
  }
}

export function characterRadius(look) {
  return look.age === 0 ? 0.21 : 0.26;
}

