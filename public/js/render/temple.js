// Procedural 3D temple, built from the same plan as the simulation (world.js).
// Plan (x, y) maps to 3D (x, height, y).
import * as THREE from '../../vendor/three/build/three.module.min.js';
import { SOLIDS, CIRCLES, STATIONS, GATES, WORLD } from '../sim/world.js';
import { LAMP_SLOTS } from '../sim/room.js';
import * as TX from './textures.js';
import { StaticBuilder, matrixAt, mergeList, paint } from './merge.js';

const std = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...opts });

export const DEITY_LOOK = {
  mazu: { name: '天上聖母', robe: '#b8352b', trim: '#e3b448', face: '#d9ae78', hat: 'crown' },
  wenchang: { name: '文昌帝君', robe: '#2f6b55', trim: '#e3b448', face: '#efcfab', hat: 'official' },
  yuelao: { name: '月下老人', robe: '#c43a2f', trim: '#f0d37a', face: '#f2c6a2', hat: 'elder' },
  guanyin: { name: '觀世音菩薩', robe: '#f3eee4', trim: '#d8b66a', face: '#f5e6d6', hat: 'hood' },
};

function makeMaterials() {
  return {
    ground: std('#9da48a', { roughness: 1 }),
    plaza: std('#ffffff', { map: TX.stoneTexture({ base: '#c9c3b8', tiles: 2, seed: 3 }), roughness: 0.92 }),
    court: std('#ffffff', { map: TX.stoneTexture({ base: '#d8d1c4', tiles: 2, seed: 9, grout: '#b3aa9c' }), roughness: 0.9 }),
    path: std('#ffffff', { map: TX.stoneTexture({ base: '#b9b2a6', tiles: 1, seed: 5, grout: '#958c80' }), roughness: 0.85 }),
    hall: std('#ffffff', { map: TX.brickTexture(), roughness: 0.75 }),
    wallRed: std('#9c3426', { roughness: 0.9 }),
    wallBrick: std('#a8462f', { roughness: 0.95 }),
    plaster: std('#efe4cf', { roughness: 0.95 }),
    stone: std('#bdb5a8', { roughness: 0.95 }),
    stoneDark: std('#8f877b', { roughness: 0.95 }),
    wood: std('#5b2418', { roughness: 0.6 }),
    lacquer: std('#a8231b', { roughness: 0.45 }),
    gold: std('#d6a73c', { metalness: 0.55, roughness: 0.35 }),
    bronze: std('#5e4329', { metalness: 0.65, roughness: 0.45 }),
    roof: std('#ffffff', { map: TX.roofTexture(), roughness: 0.7 }),
    roofSide: std('#ffffff', { map: TX.roofTexture({ base: '#b9572b', rib: '#934020' }), roughness: 0.7 }),
    ceiling: std('#6b2a1b', { roughness: 0.85, side: THREE.BackSide }),
    ridge: std('#f1e8d8', { roughness: 0.6 }),
    green: std('#2f7d5b', { roughness: 0.5 }),
    blue: std('#2d5d9f', { roughness: 0.5 }),
    yellow: std('#e9b93a', { roughness: 0.5 }),
    cushion: std('#b81f2a', { roughness: 0.95 }),
    door: std('#ffffff', { map: TX.doorTexture(), roughness: 0.55 }),
    lattice: std('#ffffff', { map: TX.latticeTexture(), roughness: 0.7 }),
    cloth: std('#ffffff', { map: TX.altarClothTexture('福'), roughness: 0.9 }),
    leaf: std('#4a7d39', { roughness: 0.9 }),
    leaf2: std('#5f9446', { roughness: 0.9 }),
    trunk: std('#6b4c37', { roughness: 0.95 }),
    pot: std('#a6573a', { roughness: 0.9 }),
    lion: std('#c9c2b6', { roughness: 0.95 }),
    dark: std('#2b211c', { roughness: 0.8 }),
    fireHole: new THREE.MeshBasicMaterial({ color: '#1a0b06' }),
    marker: new THREE.MeshBasicMaterial({ color: '#c9a227', transparent: true, opacity: 0.55, depthWrite: false }),
    cushionMark: new THREE.MeshBasicMaterial({ color: '#c9a227', transparent: true, opacity: 0.45, depthWrite: false }),
    bamboo: std('#c8a96a', { roughness: 0.7 }),
    paper: std('#e7c45a', { roughness: 0.9 }),
  };
}

// --------------------------------------------------------------- floors

function floor(builder, x0, z0, x1, z1, material, scale, y = 0) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / scale, pos.getZ(i) / scale);
  builder.add(g, material);
}

// ---------------------------------------------------------------- roofs

// One curved slope from the ridge (v = 0) down to the eave (v = 1), with the
// characteristic sweep: steep near the ridge, flat at the eave, corners lifted.
function roofSlope(x0, x1, zRidge, zEave, hRidge, hEave, curl) {
  const segU = 28;
  const segV = 10;
  const pos = [];
  const uv = [];
  const idx = [];
  const slopeLen = Math.hypot(zEave - zRidge, hRidge - hEave);
  for (let j = 0; j <= segV; j++) {
    const v = j / segV;
    for (let i = 0; i <= segU; i++) {
      const u = i / segU;
      const x = x0 + (x1 - x0) * u;
      const edge = Math.max(0, Math.abs(2 * u - 1) - 0.5) / 0.5;
      const h = hRidge - (hRidge - hEave) * Math.pow(v, 0.62) + curl * edge * edge * Math.pow(v, 1.4);
      pos.push(x, h, zRidge + (zEave - zRidge) * v);
      uv.push((x - x0) / 2, (v * slopeLen) / 2);
    }
  }
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const a = j * (segU + 1) + i;
      const b = a + 1;
      const c = a + segU + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Make sure the outside (tiles) faces up.
  if (g.attributes.normal.getY(Math.floor(pos.length / 6)) < 0) {
    for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

function profileHeight(z, zRidge, zEave, hRidge, hEave) {
  const v = Math.min(1, Math.max(0, (z - zRidge) / (zEave - zRidge)));
  return hRidge - (hRidge - hEave) * Math.pow(v, 0.62);
}

// Gable infill at plan x, following both slope profiles.
function gable(builder, x, zBack, zRidge, zFront, hRidge, hBack, hFront, base, material) {
  const pts = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const z = zBack + (zRidge - zBack) * (i / steps);
    pts.push([z, profileHeight(z, zRidge, zBack, hRidge, hBack) - 0.08]);
  }
  for (let i = 1; i <= steps; i++) {
    const z = zRidge + (zFront - zRidge) * (i / steps);
    pts.push([z, profileHeight(z, zRidge, zFront, hRidge, hFront) - 0.08]);
  }
  const pos = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [za, ha] = pts[i];
    const [zb, hb] = pts[i + 1];
    pos.push(x, base, za, x, ha, za, x, hb, zb, x, base, za, x, hb, zb, x, base, zb);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const m = material.clone();
  m.side = THREE.DoubleSide;
  builder.add(g, m);
}

// Ridge with swallow-tail ends (燕尾) and a pearl ornament.
function ridge(builder, M, x0, x1, z, h, { ornate = false } = {}) {
  builder.box(x1 - x0, 0.34, 0.3, M.ridge, (x0 + x1) / 2, h + 0.14, z);
  builder.box(x1 - x0, 0.08, 0.32, M.lacquer, (x0 + x1) / 2, h + 0.06, z);
  for (const side of [-1, 1]) {
    const xe = side < 0 ? x0 : x1;
    for (const dz of [-0.07, 0.07]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(xe - side * 0.4, h + 0.16, z),
        new THREE.Vector3(xe + side * 0.3, h + 0.28, z + dz),
        new THREE.Vector3(xe + side * 0.8, h + 0.7, z + dz * 1.6),
        new THREE.Vector3(xe + side * 1.0, h + 1.25, z + dz * 2.4),
      ]);
      builder.add(new THREE.TubeGeometry(curve, 10, 0.09, 6, false), M.ridge);
    }
  }
  if (ornate) {
    const cx = (x0 + x1) / 2;
    builder.cyl(0.2, 0.28, 0.3, 10, M.gold, cx, h + 0.45, z);
    builder.add(new THREE.SphereGeometry(0.3, 14, 10), M.gold, matrixAt(cx, h + 0.85, z));
    builder.add(new THREE.ConeGeometry(0.16, 0.5, 10), M.yellow, matrixAt(cx, h + 1.3, z));
    // Two stylised ceramic dragons facing the pearl.
    for (const side of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        pts.push(new THREE.Vector3(cx + side * (0.6 + t * 3.0), h + 0.42 + Math.sin(t * Math.PI * 3) * 0.16 + t * 0.1, z));
      }
      builder.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.09, 6, false), M.green);
      builder.add(new THREE.SphereGeometry(0.16, 10, 8), M.blue, matrixAt(cx + side * 0.55, h + 0.5, z));
    }
    for (let i = 0; i < 10; i++) {
      const x = x0 + 1.5 + ((x1 - x0 - 3) * i) / 9;
      if (Math.abs(x - cx) < 3.8) continue;
      builder.add(new THREE.SphereGeometry(0.1, 8, 6), i % 2 ? M.blue : M.yellow, matrixAt(x, h + 0.36, z));
    }
  }
}

function roof(builder, M, { x0, x1, zBack, zFront, zRidge, hRidge, hBack, hFront, curl = 0.6, tile = M.roof, ornate = false, gables = null }) {
  for (const [zEave, hEave] of [[zFront, hFront], [zBack, hBack]]) {
    const g = roofSlope(x0, x1, zRidge, zEave, hRidge, hEave, curl);
    builder.add(g, tile);
    builder.add(g, M.ceiling);
  }
  ridge(builder, M, x0 + 0.2, x1 - 0.2, zRidge, hRidge, { ornate });
  if (gables) {
    for (const gx of gables.xs) gable(builder, gx, zBack + 0.35, zRidge, zFront - 0.35, hRidge, hBack, hFront, gables.base, M.plaster);
  }
}

// -------------------------------------------------------------- objects

function addPlaque(group, text, x, y, z, w, h, opts = {}) {
  const tex = TX.plaqueTexture(text, { vertical: opts.vertical, w: opts.vertical ? 128 : 512, h: opts.vertical ? 512 : 160, ...opts.style });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.1 }));
  mesh.position.set(x, y, z);
  mesh.rotation.y = opts.ry ?? 0;
  group.add(mesh);
  return mesh;
}

const statueMats = new Map();
function cachedMat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!statueMats.has(key)) statueMats.set(key, std(color, opts));
  return statueMats.get(key);
}

// Seated deity figure, merged into the static geometry (it never moves).
function addStatue(B, kind, x, baseY, z, k = 1) {
  const L = DEITY_LOOK[kind];
  const robe = cachedMat(L.robe, { roughness: 0.55 });
  const trim = cachedMat(L.trim, { metalness: 0.5, roughness: 0.35 });
  const face = cachedMat(L.face, { roughness: 0.5 });
  const dark = cachedMat('#1d1d1d', { roughness: 0.6 });
  const at = (dx, dy, dz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => matrixAt(x + dx * k, baseY + dy * k, z + dz * k, rx, ry, rz, sx * k, sy * k, sz * k);
  B.add(new THREE.LatheGeometry([
    new THREE.Vector2(0.0, 0), new THREE.Vector2(0.42, 0), new THREE.Vector2(0.44, 0.1), new THREE.Vector2(0.36, 0.5),
    new THREE.Vector2(0.3, 0.78), new THREE.Vector2(0.2, 0.9), new THREE.Vector2(0.0, 0.92),
  ], 18), robe, at(0, 0.22, 0));
  B.add(new THREE.TorusGeometry(0.33, 0.035, 6, 20), trim, at(0, 0.72, 0, Math.PI / 2));
  B.add(new THREE.BoxGeometry(0.18, 0.12, 0.1), face, at(0, 0.78, 0.3));
  B.add(new THREE.BoxGeometry(0.06, 0.34, 0.03), trim, at(0, 0.92, 0.34));
  B.add(new THREE.SphereGeometry(0.2, 18, 14), face, at(0, 1.3, 0));
  if (L.hat === 'crown') {
    B.add(new THREE.CylinderGeometry(0.2, 0.22, 0.18, 14), trim, at(0, 1.5, 0));
    B.add(new THREE.BoxGeometry(0.5, 0.03, 0.3), trim, at(0, 1.62, 0));
    for (let i = -2; i <= 2; i++) B.add(new THREE.CylinderGeometry(0.01, 0.01, 0.22, 4), trim, at(i * 0.09, 1.5, 0.15));
  } else if (L.hat === 'official') {
    B.add(new THREE.CylinderGeometry(0.17, 0.2, 0.2, 14), dark, at(0, 1.5, 0));
    for (const sx of [-1, 1]) B.add(new THREE.BoxGeometry(0.32, 0.04, 0.02), dark, at(sx * 0.3, 1.52, -0.02));
  } else if (L.hat === 'elder') {
    B.add(new THREE.ConeGeometry(0.12, 0.42, 10), cachedMat('#f7f4ee'), at(0, 1.08, 0.13, Math.PI));
    B.add(new THREE.SphereGeometry(0.205, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.2), cachedMat('#a8231b'), at(0, 1.32, 0));
  } else if (L.hat === 'hood') {
    B.add(new THREE.SphereGeometry(0.25, 18, 12, 0, Math.PI * 2, 0, Math.PI / 1.7), robe, at(0, 1.32, -0.03));
    B.add(new THREE.SphereGeometry(0.04, 8, 6), trim, at(0, 1.47, 0.21));
  }
  B.add(new THREE.TorusGeometry(0.34, 0.025, 6, 32), trim, at(0, 1.34, -0.2));
}

// Lanterns sway gently and glow at night.
function makeLanterns() {
  const group = new THREE.Group();
  const list = [];
  const body = new THREE.SphereGeometry(0.3, 18, 14);
  const trimGeo = mergeList([
    paint(new THREE.CylinderGeometry(0.14, 0.17, 0.08, 12).translate(0, 0.36, 0), '#2b211c'),
    paint(new THREE.CylinderGeometry(0.14, 0.17, 0.08, 12).translate(0, -0.36, 0), '#2b211c'),
    paint(new THREE.CylinderGeometry(0.015, 0.03, 0.34, 6).translate(0, -0.58, 0), '#a8231b'),
    paint(new THREE.CylinderGeometry(0.008, 0.008, 0.6, 4).translate(0, 0.7, 0), '#2b211c'),
  ]);
  const trimMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  const mats = {};
  const matFor = (ch) => {
    if (!mats[ch]) {
      const tex = TX.lanternTexture(ch);
      mats[ch] = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#ff6a3a'), emissiveIntensity: 0.15, roughness: 0.7 });
    }
    return mats[ch];
  };
  const add = (x, y, z, ch, scale = 1) => {
    const g = new THREE.Group();
    const b = new THREE.Mesh(body, matFor(ch));
    b.scale.set(1, 1.18, 1);
    g.add(b);
    g.add(new THREE.Mesh(trimGeo, trimMat));
    g.scale.setScalar(scale);
    g.position.set(x, y, z);
    group.add(g);
    list.push({ g, phase: x * 1.7 + z * 0.9 });
  };
  for (const x of [5.2, 11.8, 20.2, 26.8]) add(x, 3.05, 31.05, '福');
  add(8.3, 3.05, 31.05, '平');
  add(23.7, 3.05, 31.05, '安');
  add(16, 3.15, 31.05, '雲', 1.25);
  for (const x of [7.6, 12.8, 19.2, 24.4]) add(x, 4.3, 14.7, '安');
  add(16, 4.6, 12.2, '慈', 1.3);
  for (const x of [10, 22]) add(x, 3.7, 4.9, '光');
  return { group, list, mats: Object.values(mats) };
}

function arrowTexture(label) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(201,162,39,0.9)';
  ctx.beginPath();
  ctx.moveTo(128, 18); ctx.lineTo(220, 120); ctx.lineTo(160, 120); ctx.lineTo(160, 236); ctx.lineTo(96, 236); ctx.lineTo(96, 120); ctx.lineTo(36, 120);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#5a2a12';
  ctx.font = '700 60px "Noto Serif TC", "PMingLiU", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 128, 180);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- build

export function buildTemple({ shadows = true } = {}) {
  const M = makeMaterials();
  const B = new StaticBuilder();
  const root = new THREE.Group();
  const dynamic = new THREE.Group();
  root.add(dynamic);
  const pickables = [];
  const flames = [];
  const smoke = [];

  // Ground and floors.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), M.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(16, -0.02, 20);
  ground.receiveShadow = true;
  root.add(ground);
  floor(B, -2, 30.0, 34, 41.1, M.plaza, 2);
  floor(B, 4, 15.4, 28, 27.4, M.court, 2.4, 0.002);
  floor(B, 14.5, 15.4, 17.5, 30.6, M.path, 1.5, 0.006);
  floor(B, 4, 0.6, 28, 15.4, M.hall, 2, 0.004);
  for (const g of Object.values(GATES)) floor(B, g.x0, g.y0, g.x1, g.y1, M.path, 1.5, 0.006);
  B.slab(4, 15.3, 28, 15.52, 0, 0.05, M.stone);

  // Walls.
  const H_MAIN = 5.4;
  const H_REAR = 4.6;
  B.slab(3.5, 0, 28.5, 0.6, 0, H_REAR, M.wallBrick);
  B.slab(3.5, 0, 28.5, 0.65, 0, 0.6, M.stone);
  for (const x0 of [3.5, 28.0]) {
    B.slab(x0, 0.6, x0 + 0.5, 6.45, 0, H_REAR, M.wallBrick);
    B.slab(x0, 6.45, x0 + 0.5, 15.4, 0, H_MAIN, M.wallBrick);
    B.slab(x0, 15.4, x0 + 0.5, 27.4, 0, 3.0, M.wallRed);
    B.slab(x0 - 0.08, 15.4, x0 + 0.58, 27.4, 3.0, 3.18, M.roofSide);
    B.slab(x0 - 0.02, 0, x0 + 0.52, 27.4, 0, 0.55, M.stone);
  }
  B.slab(7.2, 6.2, 24.8, 6.7, 0, H_MAIN, M.wallRed);
  B.slab(4.0, 6.2, 7.2, 6.7, 3.2, H_MAIN, M.wallRed);
  B.slab(24.8, 6.2, 28.0, 6.7, 3.2, H_MAIN, M.wallRed);
  for (const x of [4.05, 7.15, 24.85, 27.95]) B.slab(x - 0.12, 6.1, x + 0.12, 6.8, 0, 3.2, M.lacquer);

  // Front hall (三川殿): blocks between the gates, façade details.
  for (const s of SOLIDS.filter((o) => o.kind === 'front')) {
    B.slab(s.x0, s.y0, s.x1, s.y1, 0, 3.9, M.wallRed);
    B.slab(s.x0 - 0.03, s.y1 - 0.25, s.x1 + 0.03, s.y1 + 0.05, 0, 0.7, M.stone);
  }
  for (const g of [GATES.tiger, GATES.dragon]) {
    B.slab(g.x0, g.y0, g.x1, g.y1, 3.3, 3.9, M.wallRed);
    for (const x of [g.x0, g.x1]) B.slab(x - 0.16, g.y1 - 0.2, x + 0.16, g.y1 + 0.1, 0, 3.4, M.lacquer);
    B.slab(g.x0 - 0.2, g.y1 - 0.2, g.x1 + 0.2, g.y1 + 0.12, 3.3, 3.48, M.gold);
    // Open door leaves folded against the passage walls.
    for (const [x, dir] of [[g.x0 + 0.06, 1], [g.x1 - 0.06, -1]]) {
      B.add(new THREE.BoxGeometry(0.06, 3.1, 1.45), M.door, matrixAt(x + dir * 0.03, 1.55, g.y1 - 0.9));
    }
  }
  // Closed center door with studs, lattice windows, dragon & tiger medallions.
  B.add(new THREE.PlaneGeometry(1.5, 3.2), M.door, matrixAt(15.25, 1.6, 30.42));
  B.add(new THREE.PlaneGeometry(1.5, 3.2), M.door, matrixAt(16.75, 1.6, 30.42));
  B.slab(14.3, 30.3, 17.7, 30.5, 3.2, 3.42, M.gold);
  for (const x of [12.1, 19.9]) {
    B.add(new THREE.PlaneGeometry(1.6, 1.6), M.lattice, matrixAt(x, 1.9, 30.42));
    B.slab(x - 0.9, 30.38, x + 0.9, 30.48, 1.0, 1.08, M.gold);
    B.slab(x - 0.9, 30.38, x + 0.9, 30.48, 2.72, 2.8, M.gold);
  }
  for (const [ch, x] of [['龍', 26.85], ['虎', 5.15]]) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.85, 40), new THREE.MeshStandardMaterial({ map: TX.medallionTexture(ch), roughness: 0.6 }));
    m.position.set(x, 1.95, 30.42);
    dynamic.add(m);
  }
  for (const x of [3.5, 6.8, 9.8, 14.4, 17.6, 22.2, 25.2, 28.5]) B.cyl(0.2, 0.22, 3.9, 12, M.lacquer, x, 1.95, 30.55);
  addPlaque(dynamic, '雲端宮', 16, 3.62, 30.56, 2.6, 0.82);
  addPlaque(dynamic, '虎門', 8.3, 3.62, 30.56, 1.2, 0.42);
  addPlaque(dynamic, '龍門', 23.7, 3.62, 30.56, 1.2, 0.42);

  // Roofs: main hall (tallest), rear hall, and the three-part front roof.
  roof(B, M, { x0: 2.9, x1: 29.1, zBack: 6.15, zFront: 16.25, zRidge: 10.6, hRidge: 8.6, hBack: 5.7, hFront: 5.35, curl: 0.9, ornate: true, gables: { xs: [3.55, 28.45], base: H_MAIN - 0.05 } });
  roof(B, M, { x0: 3.0, x1: 29.0, zBack: -0.55, zFront: 6.6, zRidge: 3.0, hRidge: 7.0, hBack: 4.55, hFront: 5.0, curl: 0.7, tile: M.roofSide, gables: { xs: [3.55, 28.45], base: H_REAR - 0.05 } });
  roof(B, M, { x0: 9.5, x1: 22.5, zBack: 26.75, zFront: 31.25, zRidge: 28.9, hRidge: 6.1, hBack: 4.0, hFront: 4.05, curl: 0.75, ornate: true, gables: { xs: [9.85, 22.15], base: 3.9 } });
  for (const [x0, x1] of [[2.9, 9.8], [22.2, 29.1]]) {
    roof(B, M, { x0, x1, zBack: 26.9, zFront: 31.15, zRidge: 28.9, hRidge: 5.3, hBack: 3.85, hFront: 3.85, curl: 0.55, tile: M.roofSide, gables: { xs: [x0 + 0.5, x1 - 0.5], base: 3.85 } });
  }
  // Courtyard side cloisters get a short tiled cap; main hall beams.
  for (const z of [8.6, 11.2, 13.8]) B.slab(4, z - 0.12, 28, z + 0.12, 5.25, 5.45, M.wood);

  // Pillars, with couplets on the inner pair.
  const couplets = ['雲來雲去心常靜', '步緩步穩福自臨'];
  for (const c of CIRCLES.filter((o) => o.kind === 'pillar')) {
    B.cyl(c.r, c.r, H_MAIN, 16, M.lacquer, c.x, H_MAIN / 2, c.y);
    B.cyl(c.r + 0.12, c.r + 0.14, 0.36, 16, M.stone, c.x, 0.18, c.y);
    B.cyl(c.r + 0.05, c.r + 0.05, 0.22, 16, M.gold, c.x, H_MAIN - 0.3, c.y);
    if (c.couplet !== undefined) {
      // 上聯 hangs on the right when facing the hall (east), 下聯 on the left.
      const text = c.x > 16 ? couplets[0] : couplets[1];
      addPlaque(dynamic, text, c.x, 2.7, c.y + c.r + 0.02, 0.34, 3.0, { vertical: true, style: { bg: '#a8231b', fg: '#f5d77a', border: '#e3b448' } });
    }
  }
  // Façade eave posts (visual only, flush with the wall).
  addPlaque(dynamic, '心誠則靈', 16, 5.0, 13.9, 3.0, 0.8, { ry: 0 });

  // Altars, shrines and statues.
  const altarBurners = {};
  const stationOfDeity = { mazu: 'main', wenchang: 'dragon', yuelao: 'tiger', guanyin: 'rear' };
  for (const s of SOLIDS.filter((o) => o.kind === 'altar')) {
    const cx = (s.x0 + s.x1) / 2;
    const w = s.x1 - s.x0;
    const front = s.y1;
    B.slab(s.x0, s.y0, s.x1, front, 0, 0.92, M.wood);
    B.slab(s.x0 - 0.05, s.y0, s.x1 + 0.05, front + 0.05, 0.92, 0.98, M.lacquer);
    B.add(new THREE.PlaneGeometry(w - 0.1, 0.8), M.cloth, matrixAt(cx, 0.48, front + 0.012));
    // Shrine cabinet (神龕) on the back half of the altar.
    const sz0 = s.y0;
    const sz1 = s.y0 + 0.55;
    const sw = Math.min(w - 0.3, 2.2);
    B.slab(cx - sw / 2, sz0, cx + sw / 2, sz1, 0.98, 1.08, M.gold);
    B.slab(cx - sw / 2, sz0, cx + sw / 2, sz0 + 0.06, 1.08, 3.3, M.lacquer);
    for (const sx of [-1, 1]) B.slab(cx + sx * (sw / 2) - 0.08, sz0, cx + sx * (sw / 2) + 0.08, sz1, 1.08, 3.3, M.lacquer);
    B.slab(cx - sw / 2 - 0.15, sz0, cx + sw / 2 + 0.15, sz1 + 0.15, 3.3, 3.45, M.gold);
    B.add(new THREE.ConeGeometry(sw * 0.62, 0.5, 4, 1), M.roof, matrixAt(cx, 3.7, sz0 + 0.3, 0, Math.PI / 4, 0, 1, 1, 0.45));
    addStatue(B, s.deity, cx, 1.06, sz0 + 0.3, w > 3 ? 1.15 : 1.0);
    if (shadows) {
      const glow = new THREE.PointLight('#ffcf8a', 1.2, 3.2, 1.8);
      glow.position.set(cx, 2.4, sz1 + 0.4);
      dynamic.add(glow);
    }
    addPlaque(dynamic, DEITY_LOOK[s.deity].name, cx, 3.0, sz1 + 0.17, Math.min(1.7, sw * 0.8), 0.36);
    // Offerings: burner, candles, fruit.
    B.cyl(0.17, 0.13, 0.2, 14, M.bronze, cx, 1.08, front - 0.32);
    for (const sx of [-1, 1]) {
      const px = cx + sx * Math.min(0.9, w / 2 - 0.25);
      B.cyl(0.05, 0.07, 0.08, 10, M.gold, px, 1.02, front - 0.35);
      B.cyl(0.035, 0.035, 0.3, 8, M.lacquer, px, 1.21, front - 0.35);
      flames.push({ x: px, y: 1.42, z: front - 0.35, size: 0.12 });
      B.cyl(0.16, 0.12, 0.05, 12, M.gold, cx + sx * 0.45, 1.0, front - 0.25);
      for (let k = 0; k < 3; k++) B.add(new THREE.SphereGeometry(0.06, 8, 6), k === 1 ? M.yellow : M.lacquer, matrixAt(cx + sx * 0.45 + (k - 1) * 0.08, 1.08, front - 0.25 + (k % 2) * 0.05));
    }
    altarBurners[stationOfDeity[s.deity]] = { x: cx, y: 1.18, z: front - 0.32, r: 0.12 };
    smoke.push({ id: stationOfDeity[s.deity], x: cx, y: 1.25, z: front - 0.32, rate: 0 });
  }

  // 天公爐: stone base, three-legged bronze cauldron, pavilion lid.
  const tg = CIRCLES.find((c) => c.id === 'tiangong');
  B.cyl(1.05, 1.1, 0.45, 24, M.stone, tg.x, 0.225, tg.y);
  B.cyl(0.95, 1.0, 0.1, 24, M.stoneDark, tg.x, 0.5, tg.y);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
    B.cyl(0.08, 0.1, 0.45, 8, M.bronze, tg.x + Math.cos(a) * 0.55, 0.77, tg.y + Math.sin(a) * 0.55);
  }
  B.add(new THREE.LatheGeometry([
    new THREE.Vector2(0.0, 0), new THREE.Vector2(0.55, 0.02), new THREE.Vector2(0.8, 0.25), new THREE.Vector2(0.86, 0.6),
    new THREE.Vector2(0.92, 0.66), new THREE.Vector2(0.84, 0.7), new THREE.Vector2(0.0, 0.7),
  ], 28), M.bronze, matrixAt(tg.x, 0.95, tg.y));
  for (const sx of [-1, 1]) B.add(new THREE.TorusGeometry(0.17, 0.045, 8, 16, Math.PI), M.bronze, matrixAt(tg.x + sx * 0.72, 1.68, tg.y, 0, Math.PI / 2, 0));
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    B.cyl(0.03, 0.03, 0.55, 6, M.bronze, tg.x + Math.cos(a) * 0.45, 1.92, tg.y + Math.sin(a) * 0.45);
  }
  B.add(new THREE.ConeGeometry(0.85, 0.42, 8), M.bronze, matrixAt(tg.x, 2.38, tg.y));
  B.add(new THREE.ConeGeometry(0.42, 0.34, 8), M.bronze, matrixAt(tg.x, 2.72, tg.y));
  B.add(new THREE.SphereGeometry(0.1, 10, 8), M.gold, matrixAt(tg.x, 2.95, tg.y));
  addPlaque(dynamic, '天公爐', tg.x, 1.3, tg.y + 0.92, 0.5, 0.18, { style: { bg: '#3b2a18', fg: '#e9c46a' } });
  smoke.push({ id: 'tiangong', x: tg.x, y: 1.7, z: tg.y, rate: 0 });

  // Incense sticks in the burners (instanced, count follows the room state).
  const stickGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.42, 4);
  stickGeo.translate(0, 0.21, 0);
  const stickMat = new THREE.MeshStandardMaterial({ color: '#b5442d', roughness: 0.8 });
  const burnerSpots = { tiangong: { x: tg.x, y: 1.62, z: tg.y, r: 0.6 }, ...altarBurners };
  const sticks = {};
  for (const [id, b] of Object.entries(burnerSpots)) {
    const mesh = new THREE.InstancedMesh(stickGeo, stickMat, 60);
    mesh.count = 0;
    mesh.frustumCulled = false;
    const tmp = new THREE.Object3D();
    for (let i = 0; i < 60; i++) {
      const a = i * 2.399;
      const r = b.r * Math.sqrt((i + 0.5) / 60);
      tmp.position.set(b.x + Math.cos(a) * r, b.y, b.z + Math.sin(a) * r);
      tmp.rotation.set((Math.sin(i * 1.7) * 0.12), 0, Math.cos(i * 2.3) * 0.12);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    }
    dynamic.add(mesh);
    sticks[id] = { mesh, spot: b };
  }

  // 金爐: brick tower with a fire opening facing the cushions (east).
  const fu = SOLIDS.find((o) => o.id === 'furnace');
  const fcx = (fu.x0 + fu.x1) / 2;
  const fcz = (fu.y0 + fu.y1) / 2;
  B.slab(fu.x0 - 0.1, fu.y0 - 0.1, fu.x1 + 0.1, fu.y1 + 0.1, 0, 0.45, M.stone);
  B.slab(fu.x0, fu.y0, fu.x1, fu.y1, 0.45, 2.45, M.wallBrick);
  B.slab(fu.x0 - 0.12, fu.y0 - 0.12, fu.x1 + 0.12, fu.y1 + 0.12, 2.45, 2.6, M.gold);
  B.add(new THREE.ConeGeometry(1.45, 0.75, 4), M.roof, matrixAt(fcx, 2.98, fcz, 0, Math.PI / 4, 0));
  B.cyl(0.2, 0.24, 0.7, 10, M.wallBrick, fcx, 3.6, fcz);
  B.add(new THREE.PlaneGeometry(0.9, 1.0), M.fireHole, matrixAt(fu.x1 + 0.012, 1.2, fcz, 0, Math.PI / 2, 0));
  const fireMat = new THREE.MeshBasicMaterial({ color: '#ff7a1f', transparent: true, opacity: 0.85 });
  const fire = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.55), fireMat);
  fire.position.set(fu.x1 + 0.02, 0.98, fcz);
  fire.rotation.y = Math.PI / 2;
  dynamic.add(fire);
  const fireLight = new THREE.PointLight('#ff8a3c', 1.5, 4.5, 1.6);
  fireLight.position.set(fu.x1 + 0.6, 1.1, fcz);
  if (shadows) dynamic.add(fireLight);
  addPlaque(dynamic, '金爐', fu.x1 + 0.02, 2.05, fcz, 0.7, 0.3, { ry: Math.PI / 2 });
  smoke.push({ id: 'furnace', x: fcx, y: 3.95, z: fcz, rate: 0.4, dark: true });

  // 求籤處: table, lot tube, moon blocks and the fortune-slip cabinet.
  const lt = SOLIDS.find((o) => o.id === 'lotsTable');
  B.slab(lt.x0, lt.y0, lt.x1, lt.y1, 0, 0.86, M.wood);
  B.slab(lt.x0 - 0.04, lt.y0 - 0.04, lt.x1 + 0.04, lt.y1 + 0.04, 0.86, 0.9, M.lacquer);
  const ltx = (lt.x0 + lt.x1) / 2;
  const ltz = (lt.y0 + lt.y1) / 2;
  B.cyl(0.14, 0.13, 0.4, 14, M.bamboo, ltx + 0.2, 1.1, ltz - 0.2);
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4;
    B.cyl(0.008, 0.008, 0.62, 4, M.bamboo, ltx + 0.2 + Math.cos(a) * 0.07, 1.25, ltz - 0.2 + Math.sin(a) * 0.07, Math.sin(a) * 0.08, Math.cos(a) * 0.08);
  }
  for (const dz of [0.15, 0.4]) B.add(new THREE.SphereGeometry(0.09, 10, 6, 0, Math.PI, 0, Math.PI), M.lacquer, matrixAt(ltx + 0.25, 0.9, ltz + dz, -Math.PI / 2, 0, 0, 1, 1, 0.45));
  B.slab(4.0, 16.4, 4.32, 19.0, 0, 2.2, M.wood);
  B.add(new THREE.PlaneGeometry(2.5, 1.9), M.lattice, matrixAt(4.33, 1.15, 17.7, 0, Math.PI / 2, 0));
  addPlaque(dynamic, '求籤處', 4.34, 2.5, 17.7, 1.2, 0.38, { ry: Math.PI / 2 });

  // 服務台.
  const dk = SOLIDS.find((o) => o.id === 'desk');
  B.slab(dk.x0, dk.y0, dk.x1, dk.y1, 0, 1.0, M.wood);
  B.slab(dk.x0 - 0.06, dk.y0 - 0.06, dk.x1 + 0.06, dk.y1 + 0.06, 1.0, 1.06, M.lacquer);
  for (let i = 0; i < 4; i++) B.cyl(0.05, 0.05, 0.42, 8, M.paper, dk.x0 + 0.35, 1.27, dk.y0 + 0.5 + i * 0.22);
  for (let i = 0; i < 3; i++) B.slab(dk.x0 + 0.7, dk.y0 + 1.6 + i * 0.35, dk.x0 + 1.1, dk.y0 + 1.9 + i * 0.35, 1.06, 1.18 + i * 0.03, M.paper);
  B.slab(dk.x1 - 0.1, dk.y0, dk.x1 + 0.05, dk.y1, 1.06, 2.4, M.lacquer);
  addPlaque(dynamic, '服務台', dk.x1 - 0.12, 2.05, (dk.y0 + dk.y1) / 2, 1.6, 0.48, { ry: -Math.PI / 2 });

  // 光明燈 walls: a grid of small lamps on each cabinet (instanced).
  const lampFace = (() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = '#8a5a14';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 58, 58);
    ctx.fillStyle = '#c47a12';
    ctx.beginPath();
    ctx.moveTo(32, 12); ctx.quadraticCurveTo(46, 32, 32, 50); ctx.quadraticCurveTo(18, 32, 32, 12);
    ctx.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const lampMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.36, 0.26, 0.06), new THREE.MeshBasicMaterial({ map: lampFace }), LAMP_SLOTS);
  const lampTmp = new THREE.Object3D();
  const perWall = LAMP_SLOTS / 2;
  const cols = 15;
  SOLIDS.filter((o) => o.kind === 'lampWall').forEach((w, wi) => {
    B.slab(w.x0, w.y0, w.x1, w.y1, 0, 3.0, M.wood);
    B.slab(w.x0 - 0.06, w.y0, w.x1 + 0.06, w.y1 + 0.08, 3.0, 3.12, M.gold);
    for (let i = 0; i < perWall; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      lampTmp.position.set(w.x0 + 0.33 + c * 0.47, 0.55 + r * 0.31, w.y1 + 0.035);
      lampTmp.updateMatrix();
      lampMesh.setMatrixAt(wi * perWall + i, lampTmp.matrix);
    }
    addPlaque(dynamic, '光明燈', (w.x0 + w.x1) / 2, 3.42, w.y1 + 0.04, 1.4, 0.42);
  });
  const lampOff = new THREE.Color('#6b5a3a');
  const lampOn = new THREE.Color('#ffd88a');
  for (let i = 0; i < LAMP_SLOTS; i++) lampMesh.setColorAt(i, lampOff);
  dynamic.add(lampMesh);

  // Bell and drum.
  const bell = CIRCLES.find((c) => c.id === 'bell');
  for (const sx of [-1, 1]) B.cyl(0.07, 0.07, 2.3, 8, M.wood, bell.x + sx * 0.5, 1.15, bell.y);
  B.slab(bell.x - 0.65, bell.y - 0.08, bell.x + 0.65, bell.y + 0.08, 2.22, 2.36, M.wood);
  B.add(new THREE.LatheGeometry([new THREE.Vector2(0.0, 0), new THREE.Vector2(0.36, 0), new THREE.Vector2(0.34, 0.1), new THREE.Vector2(0.26, 0.6), new THREE.Vector2(0.18, 0.72), new THREE.Vector2(0.0, 0.74)], 20), M.bronze, matrixAt(bell.x, 1.3, bell.y));
  const drum = CIRCLES.find((c) => c.id === 'drum');
  B.slab(drum.x - 0.45, drum.y - 0.35, drum.x + 0.45, drum.y + 0.35, 0, 0.5, M.wood);
  B.add(new THREE.CylinderGeometry(0.5, 0.5, 0.62, 20), M.lacquer, matrixAt(drum.x, 1.05, drum.y, Math.PI / 2, 0, 0));
  for (const dz of [-0.32, 0.32]) B.add(new THREE.CylinderGeometry(0.45, 0.45, 0.02, 20), M.plaster, matrixAt(drum.x, 1.05, drum.y + dz, Math.PI / 2, 0, 0));

  // Stone lions on pedestals, facing the street.
  for (const c of CIRCLES.filter((o) => o.kind === 'lion')) {
    B.slab(c.x - 0.5, c.y - 0.45, c.x + 0.5, c.y + 0.45, 0, 0.45, M.stoneDark);
    B.add(new THREE.SphereGeometry(0.36, 14, 10), M.lion, matrixAt(c.x, 0.78, c.y - 0.05, 0, 0, 0, 1, 0.9, 1.15));
    B.add(new THREE.SphereGeometry(0.28, 14, 10), M.lion, matrixAt(c.x, 1.18, c.y + 0.18));
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      B.add(new THREE.SphereGeometry(0.1, 8, 6), M.lion, matrixAt(c.x + Math.cos(a) * 0.27, 1.2 + Math.sin(a) * 0.24, c.y + 0.08));
    }
    for (const sx of [-1, 1]) {
      B.cyl(0.07, 0.08, 0.36, 8, M.lion, c.x + sx * 0.17, 0.63, c.y + 0.25);
      B.add(new THREE.SphereGeometry(0.035, 6, 4), M.dark, matrixAt(c.x + sx * 0.09, 1.24, c.y + 0.44));
    }
    B.add(new THREE.SphereGeometry(0.1, 10, 8), M.lion, matrixAt(c.x + (c.x < 16 ? 0.28 : -0.28), 0.52, c.y + 0.32));
  }

  // Banyan tree and potted plants.
  const tree = CIRCLES.find((c) => c.kind === 'tree');
  B.cyl(0.35, 0.55, 3.0, 12, M.trunk, tree.x, 1.5, tree.y);
  for (const [dx, dz, s] of [[0, 0, 2.2], [1.4, 0.6, 1.6], [-1.2, 0.4, 1.5], [0.4, -1.3, 1.6], [-0.3, 1.4, 1.5], [1.0, -0.6, 1.3]]) {
    B.add(new THREE.IcosahedronGeometry(s, 1), s > 1.5 ? M.leaf : M.leaf2, matrixAt(tree.x + dx, 4.4 + s * 0.3, tree.y + dz, 0, 0, 0, 1, 0.75, 1));
  }
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9;
    B.cyl(0.02, 0.02, 1.8, 4, M.trunk, tree.x + Math.cos(a) * 1.4, 2.6, tree.y + Math.sin(a) * 1.2);
  }
  for (const c of CIRCLES.filter((o) => o.kind === 'plant')) {
    B.cyl(0.36, 0.28, 0.55, 14, M.pot, c.x, 0.275, c.y);
    B.add(new THREE.IcosahedronGeometry(0.5, 1), M.leaf2, matrixAt(c.x, 0.95, c.y, 0, 0, 0, 1, 0.85, 1));
  }

  // Plaza low walls.
  for (const s of SOLIDS.filter((o) => o.kind === 'lowWall')) {
    B.slab(s.x0, s.y0, s.x1, s.y1, 0, s.h, M.wallRed);
    B.slab(s.x0 - 0.05, s.y0 - 0.05, s.x1 + 0.05, s.y1 + 0.05, s.h, s.h + 0.1, M.roofSide);
  }

  // Cushions on every kneeling spot; gold floor marks where people stand or queue.
  for (const st of STATIONS) {
    for (const sl of st.slots) {
      if (st.kind === 'altar' || st.kind === 'burner') {
        B.add(new THREE.BoxGeometry(0.5, 0.08, 0.42), M.cushion, matrixAt(sl.x, 0.04, sl.y, 0, -sl.face + Math.PI / 2, 0));
      } else {
        B.add(new THREE.RingGeometry(0.2, 0.26, 24), M.cushionMark, matrixAt(sl.x, 0.012, sl.y, -Math.PI / 2, 0, 0));
      }
    }
    for (const q of st.queue) B.add(new THREE.CircleGeometry(0.07, 12), M.marker, matrixAt(q.x, 0.012, q.y, -Math.PI / 2, 0, 0));
  }

  // One-way arrows painted on the floor.
  const arrows = [
    ['入', 23.7, 32.0, 0], ['入', 23.7, 26.3, 0], ['出', 8.3, 26.3, Math.PI], ['出', 8.3, 32.0, Math.PI],
    ['', 26.4, 7.6, 0], ['', 5.6, 7.6, Math.PI], ['', 21.5, 5.2, Math.PI / 2], ['', 10.5, 5.2, Math.PI / 2],
  ];
  const arrowMats = {};
  for (const [label, x, z, rot] of arrows) {
    if (!arrowMats[label]) arrowMats[label] = new THREE.MeshBasicMaterial({ map: arrowTexture(label), transparent: true, depthWrite: false, opacity: 0.8 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), arrowMats[label]);
    m.rotation.set(-Math.PI / 2, 0, rot);
    m.position.set(x, 0.014, z);
    dynamic.add(m);
  }

  const lanterns = makeLanterns();
  dynamic.add(lanterns.group);

  // Invisible boxes that make stations easy to tap.
  for (const st of STATIONS) {
    const h = st.hotspot;
    const height = st.kind === 'altar' || st.kind === 'lamps' ? 3.4 : 2.6;
    const box = new THREE.Mesh(new THREE.BoxGeometry(h.x1 - h.x0, height, h.y1 - h.y0), new THREE.MeshBasicMaterial({ visible: false }));
    box.position.set((h.x0 + h.x1) / 2, height / 2, (h.y0 + h.y1) / 2);
    box.userData.stationId = st.id;
    dynamic.add(box);
    pickables.push(box);
  }

  const staticGroup = B.build({ castShadow: shadows, receiveShadow: true });
  root.add(staticGroup);

  // ------------------------------------------------------------ updates
  let litCount = -1;
  const litSet = new Set();
  function update(dt, time, shared, night) {
    for (const l of lanterns.list) {
      l.g.rotation.z = Math.sin(time * 0.9 + l.phase) * 0.035;
      l.g.rotation.x = Math.cos(time * 0.7 + l.phase) * 0.02;
    }
    for (const m of lanterns.mats) m.emissiveIntensity = night ? 2.2 : 0.12;
    const flick = 0.85 + Math.sin(time * 17) * 0.06 + Math.sin(time * 9.3) * 0.08;
    fireMat.opacity = 0.7 + Math.sin(time * 11) * 0.12;
    fireLight.intensity = (night ? 2.6 : 1.2) * flick;
    fire.scale.y = 0.9 + Math.sin(time * 13) * 0.1;
    if (shared) {
      for (const [id, s] of Object.entries(sticks)) {
        const n = Math.min(60, shared.burners?.[id] ?? 0);
        if (s.mesh.count !== n) s.mesh.count = n;
      }
      for (const sm of smoke) {
        if (sm.id === 'furnace') continue;
        sm.rate = Math.min(1, (shared.burners?.[sm.id] ?? 0) / (sm.id === 'tiangong' ? 10 : 4));
      }
      const lamps = shared.lamps || [];
      if (lamps.length !== litCount || lamps.some((i) => !litSet.has(i))) {
        litCount = lamps.length;
        litSet.clear();
        for (const i of lamps) litSet.add(i);
        for (let i = 0; i < LAMP_SLOTS; i++) lampMesh.setColorAt(i, litSet.has(i) ? lampOn : lampOff);
        lampMesh.instanceColor.needsUpdate = true;
      }
    }
  }

  return { root, pickables, flames, smoke, update, materials: M, lampMesh };
}

export const WORLD_CENTER = { x: WORLD.w / 2, y: WORLD.h / 2 };
