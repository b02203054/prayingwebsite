// Procedural 3D temple, built from the same plan as the simulation (world.js).
// Plan (x, y) maps to 3D (x, height, y). Static parts are merged per material.
import * as THREE from '../../vendor/three/build/three.module.min.js';
import { SOLIDS, CIRCLES, STATIONS, GATES, WORLD } from '../sim/world.js';
import { LAMP_SLOTS } from '../sim/room.js';
import * as TX from './textures.js';
import { StaticBuilder, matrixAt, mergeList, paint } from './merge.js';

const V3 = THREE.Vector3;
const std = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...opts });

export const DEITY_LOOK = {
  mazu: { name: '天上聖母', robe: '#a8302a', trim: '#d9ad4a', face: '#d6aa76', hat: 'crown' },
  wenchang: { name: '文昌帝君', robe: '#2c6450', trim: '#d9ad4a', face: '#ecc9a4', hat: 'official' },
  yuelao: { name: '月下老人', robe: '#b9372d', trim: '#e8c66e', face: '#eec2a0', hat: 'elder' },
  guanyin: { name: '觀世音菩薩', robe: '#f1ebdf', trim: '#d2ad62', face: '#f3e2d0', hat: 'hood' },
};

function makeMaterials() {
  const plaza = TX.slabTexture({ base: '#c1b9ad', seed: 3, cols: 2, rows: 4 });
  const court = TX.slabTexture({ base: '#d1c8ba', seed: 9, cols: 2, rows: 3, grout: '#9c9285' });
  const path = TX.slabTexture({ base: '#a69f93', seed: 5, cols: 1, rows: 2, grout: '#776f64' });
  const brick = TX.brickWallTexture();
  const granite = TX.graniteTexture();
  const graniteDark = TX.graniteTexture({ base: '#8d877d', seed: 23 });
  const tiles = TX.glazedTileTexture();
  const tilesSide = TX.glazedTileTexture({ base: '#a24a27', seed: 7 });
  const bronze = TX.bronzeTexture();
  const hex = TX.hexLatticeTexture();
  const n = (t, s = 0.8) => ({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(s, s) });
  const panel = (motif, seed, w = 512, h = 384) => std('#ffffff', { ...n(TX.carvedPanelTexture(motif, { seed, w, h }), 1), roughness: 0.88 });
  return {
    ground: std('#8f977c', { roughness: 1 }),
    plaza: std('#ffffff', { ...n(plaza, 0.7), roughness: 0.92 }),
    court: std('#ffffff', { ...n(court, 0.7), roughness: 0.9 }),
    path: std('#ffffff', { ...n(path, 0.8), roughness: 0.86 }),
    hall: std('#ffffff', { map: TX.brickTexture(), roughness: 0.7 }),
    wallBrick: std('#ffffff', { ...n(brick, 1), roughness: 0.92, vertexColors: true }),
    wallRed: std('#8c3226', { roughness: 0.86, vertexColors: true }),
    plaster: std('#ebe0ca', { roughness: 0.92, vertexColors: true }),
    stone: std('#ffffff', { ...n(granite, 0.9), roughness: 0.86, vertexColors: true }),
    stoneDark: std('#ffffff', { ...n(graniteDark, 0.9), roughness: 0.88, vertexColors: true }),
    lion: std('#ffffff', { ...n(granite, 1.2), roughness: 0.9 }),
    dragonStone: std('#b9b6ab', { ...n(granite, 1.4), roughness: 0.82 }),
    lacquer: new THREE.MeshPhysicalMaterial({ color: '#97231a', roughness: 0.36, clearcoat: 0.55, clearcoatRoughness: 0.3 }),
    wood: std('#3e1b13', { roughness: 0.55 }),
    gold: std('#c79f48', { metalness: 0.9, roughness: 0.3 }),
    bronze: std('#ffffff', { ...n(bronze, 1), metalness: 0.75, roughness: 0.42 }),
    bronzePlain: std('#4b3522', { metalness: 0.75, roughness: 0.45 }),
    roofUnder: std('#ffffff', { ...n(tiles, 1), roughness: 0.42 }),
    roofUnderSide: std('#ffffff', { ...n(tilesSide, 1), roughness: 0.45 }),
    tile: std('#b5552d', { roughness: 0.34 }),
    tileSide: std('#a04a28', { roughness: 0.38 }),
    tileCap: std('#8f3a20', { roughness: 0.4 }),
    ceiling: std('#542218', { roughness: 0.85, side: THREE.BackSide }),
    ridge: std('#ede4d2', { roughness: 0.55 }),
    ridgeBand: std('#ffffff', { map: TX.mosaicBandTexture(), roughness: 0.45 }),
    fascia: std('#2f4f45', { roughness: 0.55, side: THREE.DoubleSide }),
    rafter: std('#5a2016', { roughness: 0.6 }),
    rafterTip: std('#2f6b55', { roughness: 0.45 }),
    green: std('#2f7a58', { roughness: 0.35 }),
    blue: std('#2b5a8f', { roughness: 0.35 }),
    yellow: std('#e2b23a', { roughness: 0.35 }),
    red: std('#b8352b', { roughness: 0.4 }),
    beam: std('#ffffff', { map: TX.paintedBeamTexture(), roughness: 0.55 }),
    beamSide: std('#1f4357', { roughness: 0.55 }),
    panelCloud: panel('cloud', 5),
    panelLotus: panel('lotus', 6),
    panelVase: panel('vase', 7),
    panelWave: panel('wave', 8, 512, 128),
    hexLattice: std('#ffffff', { ...n(hex, 1), roughness: 0.6 }),
    cushion: std('#a51d27', { roughness: 0.95 }),
    door: std('#ffffff', { map: TX.doorTexture(), roughness: 0.42, metalness: 0.05 }),
    cloth: std('#ffffff', { map: TX.altarClothTexture('福'), roughness: 0.9 }),
    curtain: std('#8c1c1c', { roughness: 0.8, side: THREE.DoubleSide }),
    leaf: std('#456f35', { roughness: 0.92 }),
    leaf2: std('#5d8a43', { roughness: 0.92 }),
    leaf3: std('#76a052', { roughness: 0.92 }),
    trunk: std('#5c4232', { roughness: 0.95 }),
    pot: std('#2e5b67', { roughness: 0.3 }),
    potRim: std('#c79f48', { metalness: 0.6, roughness: 0.35 }),
    dark: std('#241b17', { roughness: 0.8 }),
    fireHole: new THREE.MeshBasicMaterial({ color: '#140704' }),
    marker: new THREE.MeshBasicMaterial({ color: '#c9a227', transparent: true, opacity: 0.5, depthWrite: false }),
    cushionMark: new THREE.MeshBasicMaterial({ color: '#c9a227', transparent: true, opacity: 0.42, depthWrite: false }),
    bamboo: std('#c8a96a', { roughness: 0.6 }),
    paper: std('#e2bf55', { roughness: 0.9 }),
  };
}

// ------------------------------------------------------------- geometry

// Axis-aligned box with UVs in meters (textures tile evenly at any size)
// and a baked darkening toward the ground, which grounds walls visually.
function boxUV(x0, y0, z0, x1, y1, z1, scale = 1) {
  const pos = [];
  const nor = [];
  const uv = [];
  const col = [];
  const shadeAt = (y) => 0.6 + 0.4 * Math.min(1, Math.max(0, y / 1.1)) ** 0.8;
  const push = (p, n, u) => {
    pos.push(p[0], p[1], p[2]);
    nor.push(n[0], n[1], n[2]);
    uv.push(u[0], u[1]);
    const c = shadeAt(p[1]);
    col.push(c, c, c);
  };
  const quad = (a, b, c, d, n, uvOf) => {
    for (const p of [a, b, c, a, c, d]) push(p, n, uvOf(p));
  };
  const ySplit = Math.min(y1, Math.max(y0, 1.1));
  const bands = ySplit > y0 && ySplit < y1 ? [[y0, ySplit], [ySplit, y1]] : [[y0, y1]];
  const s = scale;
  for (const [ya, yb] of bands) {
    quad([x0, ya, z1], [x1, ya, z1], [x1, yb, z1], [x0, yb, z1], [0, 0, 1], (p) => [p[0] / s, p[1] / s]);
    quad([x1, ya, z0], [x0, ya, z0], [x0, yb, z0], [x1, yb, z0], [0, 0, -1], (p) => [-p[0] / s, p[1] / s]);
    quad([x1, ya, z1], [x1, ya, z0], [x1, yb, z0], [x1, yb, z1], [1, 0, 0], (p) => [-p[2] / s, p[1] / s]);
    quad([x0, ya, z0], [x0, ya, z1], [x0, yb, z1], [x0, yb, z0], [-1, 0, 0], (p) => [p[2] / s, p[1] / s]);
  }
  quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], (p) => [p[0] / s, p[2] / s]);
  quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], (p) => [p[0] / s, p[2] / s]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

function wall(B, mat, x0, z0, x1, z1, y0, y1, scale = 1.6) {
  B.add(boxUV(x0, y0, z0, x1, y1, z1, scale), mat);
}

function floor(B, x0, z0, x1, z1, material, scale, y = 0) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / scale, -pos.getZ(i) / scale);
  B.add(g, material);
}

// A plane facing +z (south) on a façade, optionally facing another way.
function facePlane(B, mat, cx, cy, z, w, h, ry = 0) {
  B.add(new THREE.PlaneGeometry(w, h), mat, matrixAt(cx, cy, z, 0, ry, 0));
}

// ---------------------------------------------------------------- roofs

// Curved roof surface: steep near the ridge, flatter at the eave, corners lifted.
function roofH(u, v, hRidge, hEave, curl) {
  const edge = Math.max(0, Math.abs(2 * u - 1) - 0.5) / 0.5;
  return hRidge - (hRidge - hEave) * Math.pow(v, 0.62) + curl * edge * edge * Math.pow(v, 1.4);
}

function roofSlope(r, zEave, hEave) {
  const segU = 32;
  const segV = 12;
  const pos = [];
  const uv = [];
  const idx = [];
  const slopeLen = Math.hypot(zEave - r.zRidge, r.hRidge - hEave);
  for (let j = 0; j <= segV; j++) {
    const v = j / segV;
    for (let i = 0; i <= segU; i++) {
      const u = i / segU;
      const x = r.x0 + (r.x1 - r.x0) * u;
      pos.push(x, roofH(u, v, r.hRidge, hEave, r.curl), r.zRidge + (zEave - r.zRidge) * v);
      uv.push((x - r.x0) / 2.4, (v * slopeLen) / 2.4);
    }
  }
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const a = j * (segU + 1) + i;
      idx.push(a, a + segU + 1, a + 1, a + 1, a + segU + 1, a + segU + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (g.attributes.normal.getY(Math.floor(pos.length / 6)) < 0) {
    for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

// Barrel tiles (筒瓦) as real half-cylinders with round end caps (瓦當).
// Built as one indexed geometry per roof to keep memory and draw calls low.
function tileRibs(r, slopes, spacing = 0.3) {
  const pos = [];
  const nor = [];
  const idx = [];
  const rad = 0.062;
  const segs = 12;
  const ring = 6;
  const side = new V3(1, 0, 0);
  const t = new V3();
  const up = new V3();
  for (const [zEave, hEave] of slopes) {
    for (let x = r.x0 + spacing * 0.6; x < r.x1 - spacing * 0.4; x += spacing) {
      const u = (x - r.x0) / (r.x1 - r.x0);
      const pts = [];
      for (let j = 0; j <= segs; j++) {
        const v = j / segs;
        pts.push(new V3(x, roofH(u, v, r.hRidge, hEave, r.curl) + rad * 0.45, r.zRidge + (zEave - r.zRidge) * v));
      }
      const base = pos.length / 3;
      for (let j = 0; j <= segs; j++) {
        const a = pts[Math.max(0, j - 1)];
        const b = pts[Math.min(segs, j + 1)];
        t.subVectors(b, a).normalize();
        up.crossVectors(t, side).normalize();
        if (up.y < 0) up.negate();
        for (let k = 0; k <= ring; k++) {
          const th = (Math.PI * k) / ring;
          const nx = side.x * Math.cos(th) + up.x * Math.sin(th);
          const ny = side.y * Math.cos(th) + up.y * Math.sin(th);
          const nz = side.z * Math.cos(th) + up.z * Math.sin(th);
          pos.push(pts[j].x + nx * rad, pts[j].y + ny * rad, pts[j].z + nz * rad);
          nor.push(nx, ny, nz);
        }
      }
      for (let j = 0; j < segs; j++) {
        for (let k = 0; k < ring; k++) {
          const a = base + j * (ring + 1) + k;
          const b = a + ring + 1;
          idx.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
      // End cap: a disc facing out along the tile.
      const end = pts[segs];
      t.subVectors(pts[segs], pts[segs - 1]).normalize();
      up.crossVectors(t, side).normalize();
      if (up.y < 0) up.negate();
      const c0 = pos.length / 3;
      pos.push(end.x, end.y, end.z);
      nor.push(t.x, t.y, t.z);
      for (let k = 0; k <= 10; k++) {
        const th = (Math.PI * 2 * k) / 10;
        const cr = rad * 1.22;
        pos.push(end.x + (side.x * Math.cos(th) + up.x * Math.sin(th)) * cr, end.y + (side.y * Math.cos(th) + up.y * Math.sin(th)) * cr, end.z + (side.z * Math.cos(th) + up.z * Math.sin(th)) * cr);
        nor.push(t.x, t.y, t.z);
      }
      for (let k = 0; k < 10; k++) idx.push(c0, c0 + 1 + k, c0 + 2 + k, c0, c0 + 2 + k, c0 + 1 + k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// Eave details: a painted fascia board, rafter ends, and hip ridges (垂脊).
function eaveDetails(B, M, r, zEave, hEave, high) {
  const dir = Math.sign(zEave - r.zRidge);
  const steps = 48;
  const pos = [];
  for (let i = 0; i < steps; i++) {
    const ua = i / steps;
    const ub = (i + 1) / steps;
    const xa = r.x0 + (r.x1 - r.x0) * ua;
    const xb = r.x0 + (r.x1 - r.x0) * ub;
    const ha = roofH(ua, 1, r.hRidge, hEave, r.curl);
    const hb = roofH(ub, 1, r.hRidge, hEave, r.curl);
    const z = zEave + dir * 0.005;
    pos.push(xa, ha - 0.02, z, xb, hb - 0.02, z, xb, hb - 0.2, z, xa, ha - 0.02, z, xb, hb - 0.2, z, xa, ha - 0.2, z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  B.add(g, M.fascia);
  if (high) {
    for (let x = r.x0 + 0.3; x < r.x1 - 0.2; x += 0.3) {
      const u = (x - r.x0) / (r.x1 - r.x0);
      const h = roofH(u, 0.97, r.hRidge, hEave, r.curl) - 0.22;
      const z = zEave - dir * 0.18;
      // Rafters slope down and out toward the eave; the painted tip faces outward.
      const rx = Math.PI / 2 + dir * 0.25;
      B.add(new THREE.CylinderGeometry(0.04, 0.04, 0.42, 6), M.rafter, matrixAt(x, h, z, rx, 0, 0));
      B.add(new THREE.CylinderGeometry(0.042, 0.042, 0.03, 6), M.rafterTip, matrixAt(x, h + dir * Math.cos(rx) * 0.21, z + dir * Math.sin(rx) * 0.21, rx, 0, 0));
    }
  }
  // Hip ridges down both ends of the slope, curling up at the eave.
  for (const u of [0.012, 0.988]) {
    const x = r.x0 + (r.x1 - r.x0) * u;
    const pts = [];
    for (let j = 1; j <= 10; j++) {
      const v = (j / 10) * 0.96;
      pts.push(new V3(x, roofH(u, v, r.hRidge, hEave, r.curl) + 0.1, r.zRidge + (zEave - r.zRidge) * v));
    }
    const last = pts[pts.length - 1];
    pts.push(new V3(x, last.y + 0.22, last.z + dir * 0.12));
    B.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.075, 7, false), M.ridge);
    B.add(new THREE.SphereGeometry(0.1, 10, 8), M.green, matrixAt(x, last.y + 0.3, last.z + dir * 0.16));
  }
}

// The roof crown: mosaic ridge, forked swallow tails (燕尾) and, on the main
// buildings, a pagoda finial with two ceramic dragons.
// `side` is +1 for the east end and -1 for the west end. The outline itself is
// mirrored (not the mesh), so faces keep their winding and need no double side.
function swallowTail(depth, side) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(0.75 * side, 0.02, 1.25 * side, 0.92);
  s.lineTo(1.12 * side, 1.08);
  s.quadraticCurveTo(1.32 * side, 1.38, 1.46 * side, 1.62);
  s.quadraticCurveTo(0.85 * side, 0.74, 0, 0.44);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2, curveSegments: 12 });
  g.translate(0, 0, -depth / 2);
  return g;
}

function ridgeCrown(B, M, x0, x1, z, h, { ornate = false, scale = 1 } = {}) {
  const len = x1 - x0;
  const cx = (x0 + x1) / 2;
  const bh = 0.4 * scale;
  B.add(boxUV(x0, h, z - 0.16, x1, h + 0.08, z + 0.16), M.ridge);
  for (const sz of [-1, 1]) {
    const g = new THREE.PlaneGeometry(len, bh);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / 2.2));
    B.add(g, M.ridgeBand, matrixAt(cx, h + 0.08 + bh / 2, z + sz * 0.155, 0, sz > 0 ? 0 : Math.PI, 0));
  }
  B.add(boxUV(x0, h + 0.08 + bh, z - 0.19, x1, h + 0.16 + bh, z + 0.19), M.ridge);
  for (const side of [-1, 1]) {
    const xe = side < 0 ? x0 : x1;
    B.add(swallowTail(0.26 * scale, side), M.ridge, matrixAt(xe, h + 0.02, z, 0, 0, 0, scale, scale, 1));
  }
  if (!ornate) return;
  const top = h + 0.16 + bh;
  // Pagoda finial (寶塔).
  B.cyl(0.22, 0.28, 0.14, 10, M.gold, cx, top + 0.07, z);
  for (let k = 0; k < 4; k++) {
    const y = top + 0.14 + k * 0.24;
    const r = 0.17 - k * 0.025;
    B.cyl(r, r, 0.16, 10, k % 2 ? M.green : M.yellow, cx, y + 0.08, z);
    B.add(new THREE.ConeGeometry(r + 0.09, 0.08, 10), M.gold, matrixAt(cx, y + 0.2, z));
  }
  B.add(new THREE.SphereGeometry(0.09, 12, 8), M.gold, matrixAt(cx, top + 1.18, z));
  B.add(new THREE.ConeGeometry(0.05, 0.22, 8), M.gold, matrixAt(cx, top + 1.35, z));
  // Two ceramic dragons facing the pagoda.
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      pts.push(new V3(cx + side * (0.55 + t * 3.1), top + 0.18 + Math.sin(t * Math.PI * 2.5) * 0.2 + t * 0.12, z));
    }
    B.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.095, 8, false), M.green);
    for (let i = 2; i < 16; i += 2) {
      const p = pts[i];
      B.add(new THREE.ConeGeometry(0.05, 0.16, 6), M.blue, matrixAt(p.x, p.y + 0.12, z));
    }
    const head = pts[0];
    B.add(new THREE.SphereGeometry(0.13, 12, 10), M.green, matrixAt(head.x, head.y + 0.05, z, 0, 0, 0, 1.5, 1, 1));
    B.add(new THREE.ConeGeometry(0.06, 0.2, 8), M.yellow, matrixAt(head.x - side * 0.2, head.y + 0.02, z, 0, 0, side * Math.PI / 2));
    for (const dz of [-0.07, 0.07]) B.add(new THREE.ConeGeometry(0.025, 0.2, 6), M.yellow, matrixAt(head.x + side * 0.08, head.y + 0.2, z + dz, 0, 0, side * 0.6));
    const tailEnd = pts[16];
    B.add(new THREE.ConeGeometry(0.08, 0.3, 8), M.blue, matrixAt(tailEnd.x + side * 0.12, tailEnd.y + 0.1, z, 0, 0, -side * 0.9));
  }
  // Small ceramic flowers along the crown.
  for (let i = 0; i < 12; i++) {
    const x = x0 + 1.4 + ((len - 2.8) * i) / 11;
    if (Math.abs(x - cx) < 4) continue;
    B.add(new THREE.SphereGeometry(0.08, 8, 6), [M.red, M.yellow, M.blue][i % 3], matrixAt(x, top + 0.07, z));
  }
}

// Gable infill at plan x, following both slope profiles.
function gable(B, mat, x, r, base) {
  const prof = (z, zE, hE) => {
    const v = Math.min(1, Math.max(0, (z - r.zRidge) / (zE - r.zRidge)));
    return r.hRidge - (r.hRidge - hE) * Math.pow(v, 0.62);
  };
  const zb = r.zBack + 0.35;
  const zf = r.zFront - 0.35;
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const z = zb + (r.zRidge - zb) * (i / 10);
    pts.push([z, prof(z, r.zBack, r.hBack) - 0.08]);
  }
  for (let i = 1; i <= 10; i++) {
    const z = r.zRidge + (zf - r.zRidge) * (i / 10);
    pts.push([z, prof(z, r.zFront, r.hFront) - 0.08]);
  }
  const pos = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [za, ha] = pts[i];
    const [zc, hc] = pts[i + 1];
    pos.push(x, base, za, x, ha, za, x, hc, zc, x, base, za, x, hc, zc, x, base, zc);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  if (!gableMats.has(mat)) {
    const m = mat.clone();
    m.side = THREE.DoubleSide;
    m.vertexColors = false;
    gableMats.set(mat, m);
  }
  B.add(g, gableMats.get(mat));
}
const gableMats = new Map();

function roof(B, M, r, { high }) {
  r.curl = r.curl ?? 0.6;
  const slopes = [[r.zFront, r.hFront], [r.zBack, r.hBack]];
  const under = r.side ? M.roofUnderSide : M.roofUnder;
  for (const [zE, hE] of slopes) {
    const g = roofSlope(r, zE, hE);
    B.add(g, under);
    B.add(g, M.ceiling);
    eaveDetails(B, M, r, zE, hE, high);
  }
  if (high) r.ribs = tileRibs(r, slopes);
  ridgeCrown(B, M, r.x0 + 0.35, r.x1 - 0.35, r.zRidge, r.hRidge - 0.02, { ornate: r.ornate, scale: r.crownScale ?? 1 });
  if (r.gables) for (const gx of r.gables.xs) gable(B, M.plaster, gx, r, r.gables.base);
}

// ----------------------------------------------------- carved & painted

// Bracket sets (斗拱) carrying the eaves: blocks and crossing arms in
// green and blue with gold bearing blocks.
function bracketRow(B, M, x0, x1, z, y, depth, spacing = 0.72) {
  B.add(boxUV(x0, y - 0.02, z - 0.02, x1, y + 0.36, z + 0.06), M.beamSide);
  for (let x = x0 + spacing / 2; x < x1 - 0.1; x += spacing) {
    B.box(0.18, 0.12, 0.2, M.gold, x, y + 0.06, z + 0.12);
    B.box(0.64, 0.09, 0.13, M.green, x, y + 0.17, z + 0.12);
    for (const s of [-1, 1]) B.box(0.13, 0.08, 0.14, M.gold, x + s * 0.27, y + 0.255, z + 0.12);
    B.box(0.12, 0.09, depth, M.blue, x, y + 0.26, z + depth / 2);
    B.box(0.16, 0.1, 0.17, M.gold, x, y + 0.355, z + depth - 0.08);
  }
}

// Painted beam band on a south face; the pattern repeats every `period` meters.
function paintedBand(B, M, x0, x1, y0, y1, z, period = 3.2, ry = 0) {
  const w = x1 - x0;
  const g = new THREE.PlaneGeometry(w, y1 - y0);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (w / period));
  B.add(g, M.beam, matrixAt((x0 + x1) / 2, (y0 + y1) / 2, z, 0, ry, 0));
}

function dragonPillar(B, M, x, z, height, r, phase = 0) {
  B.add(new THREE.CylinderGeometry(r + 0.16, r + 0.2, 0.42, 8), M.stoneDark, matrixAt(x, 0.21, z));
  B.add(new THREE.CylinderGeometry(r, r, height - 0.6, 18), M.dragonStone, matrixAt(x, 0.42 + (height - 0.6) / 2, z));
  B.add(new THREE.CylinderGeometry(r + 0.09, r + 0.03, 0.2, 18), M.dragonStone, matrixAt(x, height - 0.08, z));
  const turns = 1.55;
  const y0 = 0.75;
  const y1 = height - 0.55;
  const R = r + 0.075;
  const pts = [];
  for (let i = 0; i <= 64; i++) {
    const t = i / 64;
    const a = phase + t * turns * Math.PI * 2;
    pts.push(new V3(x + Math.cos(a) * R, y0 + (y1 - y0) * t, z + Math.sin(a) * R));
  }
  B.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 140, 0.088, 9, false), M.dragonStone);
  for (let i = 3; i < 64; i += 4) {
    const p = pts[i];
    const ox = (p.x - x) / R;
    const oz = (p.z - z) / R;
    B.add(new THREE.ConeGeometry(0.035, 0.12, 6), M.dragonStone, matrixAt(p.x + ox * 0.08, p.y + 0.06, p.z + oz * 0.08, oz * 0.9, 0, -ox * 0.9));
  }
  for (const i of [14, 30, 46]) {
    const p = pts[i];
    for (const dy of [-0.07, 0.07]) B.add(new THREE.SphereGeometry(0.045, 8, 6), M.dragonStone, matrixAt(p.x, p.y + dy, p.z));
  }
  const head = pts[64];
  const hx = (head.x - x) / R;
  const hz = (head.z - z) / R;
  B.add(new THREE.SphereGeometry(0.12, 12, 10), M.dragonStone, matrixAt(head.x + hx * 0.05, head.y + 0.08, head.z + hz * 0.05, 0, 0, 0, 1.3, 1, 1.3));
  B.add(new THREE.ConeGeometry(0.07, 0.24, 8), M.dragonStone, matrixAt(head.x + hx * 0.2, head.y + 0.02, head.z + hz * 0.2, hz * 1.4, 0, -hx * 1.4));
  for (const s of [-1, 1]) B.add(new THREE.ConeGeometry(0.025, 0.2, 6), M.dragonStone, matrixAt(head.x - hx * 0.02 + hz * s * 0.07, head.y + 0.22, head.z - hz * 0.02 - hx * s * 0.07, 0, 0, s * 0.3));
  for (let k = 0; k < 5; k++) {
    const a = phase + k * 1.3;
    B.add(new THREE.SphereGeometry(0.09, 8, 6), M.dragonStone, matrixAt(x + Math.cos(a) * (r + 0.05), 1.0 + k * 0.62, z + Math.sin(a) * (r + 0.05), 0, 0, 0, 1.4, 0.7, 1));
  }
}

function plainPillar(B, M, x, z, height, r) {
  B.add(new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(r + 0.13, 0), new THREE.Vector2(r + 0.17, 0.12), new THREE.Vector2(r + 0.13, 0.3), new THREE.Vector2(r + 0.02, 0.36), new THREE.Vector2(0, 0.36)], 18), M.stone, matrixAt(x, 0, z));
  B.cyl(r, r, height - 0.36, 18, M.lacquer, x, 0.36 + (height - 0.36) / 2, z);
  B.cyl(r + 0.045, r + 0.045, 0.16, 18, M.gold, x, height - 0.36, z);
  B.cyl(r + 0.03, r + 0.03, 0.06, 18, M.gold, x, 0.42, z);
}

// Seated stone lion on a carved pedestal. `male` rests a paw on a ball.
function stoneLion(B, M, x, z, male) {
  B.add(boxUV(x - 0.5, 0, z - 0.45, x + 0.5, 0.42, z + 0.45), M.stoneDark);
  facePlane(B, M.panelCloud, x, 0.21, z + 0.452, 0.9, 0.34);
  B.add(boxUV(x - 0.55, 0.42, z - 0.5, x + 0.55, 0.5, z + 0.5), M.stone);
  const at = (dx, dy, dz, sx = 1, sy = 1, sz = 1) => matrixAt(x + dx, 0.5 + dy, z + dz, 0, 0, 0, sx, sy, sz);
  B.add(new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.3, 0), new THREE.Vector2(0.32, 0.18), new THREE.Vector2(0.26, 0.45), new THREE.Vector2(0.15, 0.6), new THREE.Vector2(0, 0.62)], 16), M.lion, at(0, 0.0, -0.05));
  for (const s of [-1, 1]) {
    B.add(new THREE.SphereGeometry(0.2, 14, 10), M.lion, at(s * 0.2, 0.17, -0.18, 1, 0.9, 1.25));
    B.add(new THREE.CylinderGeometry(0.075, 0.09, 0.42, 10), M.lion, at(s * 0.14, 0.21, 0.2));
    B.add(new THREE.SphereGeometry(0.09, 10, 8), M.lion, at(s * 0.14, 0.03, 0.25, 1, 0.6, 1.3));
  }
  B.add(new THREE.SphereGeometry(0.26, 18, 14), M.lion, at(0, 0.78, 0.1, 1.05, 0.95, 0.95));
  for (let ring = 0; ring < 2; ring++) {
    const n = ring ? 11 : 15;
    const rr = ring ? 0.2 : 0.28;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      B.add(new THREE.SphereGeometry(ring ? 0.055 : 0.07, 8, 6), M.lion, at(Math.cos(a) * rr, 0.8 + Math.sin(a) * rr * 0.95, 0.0 - ring * 0.06));
    }
  }
  for (const s of [-1, 1]) {
    B.add(new THREE.SphereGeometry(0.05, 10, 8), M.lion, at(s * 0.09, 0.86, 0.32));
    B.add(new THREE.SphereGeometry(0.022, 8, 6), M.dark, at(s * 0.09, 0.86, 0.365));
    B.box(0.09, 0.03, 0.05, M.lion, x + s * 0.09, 0.5 + 0.94, z + 0.4);
  }
  B.add(new THREE.SphereGeometry(0.055, 10, 8), M.lion, at(0, 0.77, 0.36));
  B.add(new THREE.SphereGeometry(0.09, 12, 8), M.dark, at(0, 0.67, 0.3, 1.2, 0.55, 0.7));
  B.add(new THREE.SphereGeometry(0.035, 8, 6), M.lion, at(0, 0.67, 0.35));
  if (male) B.add(new THREE.IcosahedronGeometry(0.14, 1), M.lion, at(x < 16 ? 0.3 : -0.3, 0.1, 0.25));
  for (let k = 0; k < 4; k++) B.add(new THREE.SphereGeometry(0.06 - k * 0.008, 8, 6), M.lion, at(0, 0.08 + k * 0.1, -0.42 - k * 0.03));
}

// Seated deity figure, merged into the static geometry.
const statueMats = new Map();
function cachedMat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!statueMats.has(key)) statueMats.set(key, std(color, opts));
  return statueMats.get(key);
}

function addStatue(B, kind, x, baseY, z, k = 1) {
  const L = DEITY_LOOK[kind];
  const robe = cachedMat(L.robe, { roughness: 0.5 });
  const trim = cachedMat(L.trim, { metalness: 0.85, roughness: 0.3 });
  const face = cachedMat(L.face, { roughness: 0.45 });
  const dark = cachedMat('#1d1d1d', { roughness: 0.6 });
  const at = (dx, dy, dz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => matrixAt(x + dx * k, baseY + dy * k, z + dz * k, rx, ry, rz, sx * k, sy * k, sz * k);
  B.add(new THREE.CylinderGeometry(0.5, 0.55, 0.16, 20), trim, at(0, 0.08, 0));
  B.add(new THREE.LatheGeometry([
    new THREE.Vector2(0.0, 0), new THREE.Vector2(0.44, 0), new THREE.Vector2(0.46, 0.1), new THREE.Vector2(0.37, 0.48),
    new THREE.Vector2(0.31, 0.76), new THREE.Vector2(0.21, 0.9), new THREE.Vector2(0.0, 0.92),
  ], 24), robe, at(0, 0.16, 0));
  for (const s of [-1, 1]) B.add(new THREE.CapsuleGeometry(0.09, 0.32, 4, 10), robe, at(s * 0.3, 0.62, 0.12, 0.5, 0, s * 0.25));
  B.add(new THREE.TorusGeometry(0.34, 0.035, 8, 24), trim, at(0, 0.66, 0, Math.PI / 2));
  B.add(new THREE.BoxGeometry(0.2, 0.12, 0.1), face, at(0, 0.74, 0.32));
  B.add(new THREE.BoxGeometry(0.06, 0.36, 0.03), trim, at(0, 0.9, 0.36));
  B.add(new THREE.SphereGeometry(0.2, 22, 16), face, at(0, 1.26, 0));
  B.add(new THREE.SphereGeometry(0.022, 8, 6), dark, at(-0.07, 1.28, 0.185));
  B.add(new THREE.SphereGeometry(0.022, 8, 6), dark, at(0.07, 1.28, 0.185));
  if (L.hat === 'crown') {
    B.add(new THREE.CylinderGeometry(0.2, 0.22, 0.2, 16), trim, at(0, 1.48, 0));
    B.add(new THREE.BoxGeometry(0.52, 0.03, 0.32), trim, at(0, 1.6, 0));
    for (let i = -2; i <= 2; i++) B.add(new THREE.CylinderGeometry(0.008, 0.008, 0.24, 4), trim, at(i * 0.09, 1.47, 0.16));
    for (let i = -2; i <= 2; i++) B.add(new THREE.SphereGeometry(0.018, 6, 4), cachedMat('#f3e7c0'), at(i * 0.09, 1.35, 0.16));
  } else if (L.hat === 'official') {
    B.add(new THREE.CylinderGeometry(0.17, 0.2, 0.22, 16), dark, at(0, 1.47, 0));
    for (const sx of [-1, 1]) B.add(new THREE.BoxGeometry(0.34, 0.04, 0.02), dark, at(sx * 0.31, 1.5, -0.02));
  } else if (L.hat === 'elder') {
    B.add(new THREE.ConeGeometry(0.12, 0.44, 12), cachedMat('#f7f4ee'), at(0, 1.04, 0.13, Math.PI));
    B.add(new THREE.SphereGeometry(0.205, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.2), cachedMat('#a8231b'), at(0, 1.29, 0));
  } else if (L.hat === 'hood') {
    B.add(new THREE.SphereGeometry(0.25, 20, 14, 0, Math.PI * 2, 0, Math.PI / 1.7), robe, at(0, 1.28, -0.03));
    B.add(new THREE.SphereGeometry(0.04, 8, 6), trim, at(0, 1.43, 0.21));
  }
  B.add(new THREE.TorusGeometry(0.36, 0.022, 6, 40), trim, at(0, 1.3, -0.22));
}

// Lanterns sway gently and glow at night.
function makeLanterns() {
  const group = new THREE.Group();
  const list = [];
  const body = new THREE.SphereGeometry(0.3, 20, 16);
  const trimGeo = mergeList([
    paint(new THREE.CylinderGeometry(0.14, 0.17, 0.08, 14).translate(0, 0.36, 0), '#2b211c'),
    paint(new THREE.CylinderGeometry(0.14, 0.17, 0.08, 14).translate(0, -0.36, 0), '#2b211c'),
    paint(new THREE.CylinderGeometry(0.017, 0.032, 0.36, 6).translate(0, -0.6, 0), '#c33a2c'),
    paint(new THREE.SphereGeometry(0.035, 8, 6).translate(0, -0.43, 0), '#d6a73c'),
    paint(new THREE.CylinderGeometry(0.008, 0.008, 0.6, 4).translate(0, 0.7, 0), '#2b211c'),
  ]);
  const trimMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  const mats = {};
  const matFor = (ch) => {
    if (!mats[ch]) {
      const tex = TX.lanternTexture(ch);
      mats[ch] = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#ff6a3a'), emissiveIntensity: 0.2, roughness: 0.65 });
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
  add(5.2, 3.05, 31.0, '福');
  add(26.8, 3.05, 31.0, '福');
  add(8.3, 3.0, 30.95, '平');
  add(23.7, 3.0, 30.95, '安');
  // Porch lanterns flank the name plaque instead of hanging in front of it.
  add(12.7, 3.05, 31.05, '福');
  add(19.3, 3.05, 31.05, '福');
  for (const x of [7.6, 12.8, 19.2, 24.4]) add(x, 4.15, 15.6, '安');
  add(16, 4.6, 12.2, '慈', 1.3);
  for (const x of [10, 22]) add(x, 3.7, 4.9, '光');
  return { group, list, mats: Object.values(mats) };
}

// Strings of small lanterns across the courtyard (static, instanced).
function lanternStrings(M) {
  const group = new THREE.Group();
  const runs = [9.6, 16, 22.4];
  const per = 9;
  const tex = TX.lanternTexture('春');
  const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#ff6a3a'), emissiveIntensity: 0.2, roughness: 0.65 });
  const bodies = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 14, 10), mat, runs.length * per);
  const cords = [];
  const tmp = new THREE.Object3D();
  let n = 0;
  for (const x of runs) {
    const a = new V3(x, 4.35, 27.0);
    const b = new V3(x, 5.0, 15.9);
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      pts.push(new V3(x, a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * 0.55, a.z + (b.z - a.z) * t));
    }
    cords.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.008, 4, false).toNonIndexed());
    for (let k = 1; k <= per; k++) {
      const t = k / (per + 1);
      tmp.position.set(x, a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * 0.55 - 0.24, a.z + (b.z - a.z) * t);
      tmp.scale.set(1, 1.2, 1);
      tmp.updateMatrix();
      bodies.setMatrixAt(n++, tmp.matrix);
    }
  }
  group.add(bodies);
  group.add(new THREE.Mesh(mergeList(cords), M.dark));
  return { group, mat };
}

function arrowTexture(label) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(201,162,39,0.85)';
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

function addPlaque(group, text, x, y, z, w, h, opts = {}) {
  const tex = TX.plaqueTexture(text, { vertical: opts.vertical, w: opts.vertical ? 128 : 512, h: opts.vertical ? 512 : 160, ...opts.style });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.15 }));
  mesh.position.set(x, y, z);
  mesh.rotation.y = opts.ry ?? 0;
  group.add(mesh);
  // A shallow frame so the plaque reads as a carved board, not a sticker.
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.05), new THREE.MeshStandardMaterial({ color: '#3a1a12', roughness: 0.5 }));
  frame.position.set(x, y, z);
  frame.rotation.y = opts.ry ?? 0;
  frame.translateZ(-0.03);
  group.add(frame);
  return mesh;
}

// ---------------------------------------------------------------- build

export function buildTemple({ shadows = true, detail = 'high' } = {}) {
  const high = detail === 'high';
  const M = makeMaterials();
  const B = new StaticBuilder();
  const root = new THREE.Group();
  const dynamic = new THREE.Group();
  root.add(dynamic);
  const pickables = [];
  const flames = [];
  const smoke = [];
  const ribMeshes = [];

  // Ground and floors.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), M.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(16, -0.02, 20);
  ground.receiveShadow = true;
  root.add(ground);
  floor(B, -2, 30.0, 34, 41.1, M.plaza, 2.4);
  floor(B, 4, 15.4, 28, 27.4, M.court, 2.2, 0.002);
  floor(B, 14.5, 15.4, 17.5, 30.6, M.path, 1.5, 0.006);
  floor(B, 4, 0.6, 28, 15.4, M.hall, 2, 0.004);
  for (const g of Object.values(GATES)) floor(B, g.x0, g.y0, g.x1, g.y1, M.path, 1.5, 0.006);
  B.add(boxUV(4, 0, 15.3, 28, 0.05, 15.55), M.stone);
  facePlane(B, M.panelWave, 16, 0.025, 15.552, 3.0, 0.05);

  // Walls: brick with a stone plinth, baked darker near the ground.
  const H_MAIN = 5.4;
  const H_REAR = 4.6;
  wall(B, M.wallBrick, 3.5, 0, 28.5, 0.6, 0, H_REAR);
  wall(B, M.stone, 3.48, 0, 28.52, 0.66, 0, 0.6);
  for (const x0 of [3.5, 28.0]) {
    wall(B, M.wallBrick, x0, 0.6, x0 + 0.5, 6.45, 0, H_REAR);
    wall(B, M.wallBrick, x0, 6.45, x0 + 0.5, 15.4, 0, H_MAIN);
    wall(B, M.wallRed, x0, 15.4, x0 + 0.5, 27.4, 0, 3.0);
    wall(B, M.roofUnderSide, x0 - 0.1, 15.4, x0 + 0.6, 27.4, 3.0, 3.16);
    wall(B, M.stone, x0 - 0.02, 0, x0 + 0.52, 27.4, 0, 0.55);
  }
  wall(B, M.wallRed, 7.2, 6.2, 24.8, 6.7, 0, H_MAIN);
  wall(B, M.wallRed, 4.0, 6.2, 7.2, 6.7, 3.2, H_MAIN);
  wall(B, M.wallRed, 24.8, 6.2, 28.0, 6.7, 3.2, H_MAIN);
  for (const x of [4.05, 7.15, 24.85, 27.95]) B.add(boxUV(x - 0.12, 0, 6.1, x + 0.12, 3.2, 6.8), M.wallRed);
  paintedBand(B, M, 4.0, 7.2, 2.95, 3.2, 6.82, 3.2);
  paintedBand(B, M, 24.8, 28.0, 2.95, 3.2, 6.82, 3.2);

  // ------------------------------------------------ 三川殿 (front hall)
  const FZ = 30.4;
  for (const s of SOLIDS.filter((o) => o.kind === 'front')) {
    wall(B, M.wallRed, s.x0, s.y0, s.x1, s.y1, 0, 3.9);
    wall(B, M.stoneDark, s.x0 - 0.03, s.y1 - 0.25, s.x1 + 0.03, s.y1 + 0.06, 0, 0.62);
  }
  for (const g of [GATES.tiger, GATES.dragon]) {
    wall(B, M.wallRed, g.x0, g.y0, g.x1, g.y1, 3.3, 3.9);
    B.add(boxUV(g.x0 - 0.05, 3.16, g.y1 - 0.22, g.x1 + 0.05, 3.3, g.y1 + 0.12), M.gold);
    for (const [x, dir] of [[g.x0 + 0.06, 1], [g.x1 - 0.06, -1]]) {
      B.add(new THREE.BoxGeometry(0.06, 3.1, 1.45), M.door, matrixAt(x + dir * 0.03, 1.55, g.y1 - 0.9));
    }
    // Threshold stones flush with the floor and a carved lintel.
    B.add(boxUV(g.x0, 0, g.y1 - 0.3, g.x1, 0.035, g.y1 + 0.05), M.stoneDark);
  }
  // Wall panels between the posts: wave plinth, carved body panels, painted top.
  const segments = [[3.5, 6.8, 'tiger'], [9.8, 14.4, 'window'], [17.6, 22.2, 'window'], [25.2, 28.5, 'dragon']];
  for (const [x0, x1, kind] of segments) {
    const w = x1 - x0 - 0.5;
    const cx = (x0 + x1) / 2;
    facePlane(B, M.panelWave, cx, 0.33, FZ + 0.07, w, 0.42);
    if (kind === 'window') {
      const wx = cx;
      B.add(boxUV(wx - 0.95, 0.95, FZ, wx + 0.95, 2.85, FZ + 0.09), M.stone);
      facePlane(B, M.hexLattice, wx, 1.9, FZ + 0.092, 1.6, 1.6);
      for (const s of [-1, 1]) facePlane(B, s < 0 ? M.panelVase : M.panelLotus, wx + s * 1.62, 1.6, FZ + 0.012, 1.0, 1.6);
    } else {
      facePlane(B, M.panelCloud, cx, 1.62, FZ + 0.012, w, 1.75);
    }
    paintedBand(B, M, x0 + 0.22, x1 - 0.22, 2.62, 3.18, FZ + 0.012, 2.4);
  }
  for (const [ch, x] of [['龍', 26.85], ['虎', 5.15]]) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.72, 48), new THREE.MeshStandardMaterial({ map: TX.medallionTexture(ch, { bg: '#d9d2c3', fg: '#7a2a1c', ring: '#b8913a' }), roughness: 0.7 }));
    m.position.set(x, 1.62, FZ + 0.03);
    dynamic.add(m);
  }
  // Closed centre door with studs, under a gold lintel.
  B.add(new THREE.PlaneGeometry(1.5, 3.2), M.door, matrixAt(15.25, 1.6, FZ + 0.02));
  B.add(new THREE.PlaneGeometry(1.5, 3.2), M.door, matrixAt(16.75, 1.6, FZ + 0.02));
  B.add(boxUV(14.3, 3.18, FZ - 0.1, 17.7, 3.32, FZ + 0.12), M.gold);
  for (const x of [3.5, 6.8, 9.8, 14.4, 17.6, 22.2, 25.2, 28.5]) {
    B.cyl(0.19, 0.21, 3.9, 14, M.lacquer, x, 1.95, FZ + 0.15);
    B.cyl(0.25, 0.27, 0.32, 8, M.stone, x, 0.16, FZ + 0.15);
  }
  // Lintel beam and bracket sets under the eave.
  paintedBand(B, M, 3.3, 28.7, 3.3, 3.58, FZ + 0.24, 3.2);
  B.add(boxUV(3.3, 3.3, FZ, 28.7, 3.58, FZ + 0.235), M.beamSide);
  bracketRow(B, M, 3.3, 28.7, FZ + 0.22, 3.58, 0.62);
  // Front porch: pillars and a painted beam between them.
  for (const c of CIRCLES.filter((o) => o.kind === 'porchPillar')) {
    if (c.dragon) dragonPillar(B, M, c.x, c.y, 3.95, 0.25, c.x < 16 ? 0 : Math.PI);
    else plainPillar(B, M, c.x, c.y, 3.95, c.r);
  }
  B.add(boxUV(11.2, 3.56, 30.95, 20.8, 3.8, 31.15), M.beamSide);
  paintedBand(B, M, 11.2, 20.8, 3.56, 3.8, 31.152, 3.2);
  for (const c of CIRCLES.filter((o) => o.kind === 'drumStone')) {
    B.add(boxUV(c.x - 0.2, 0, c.y - 0.2, c.x + 0.2, 0.36, c.y + 0.22), M.stoneDark);
    B.add(new THREE.CylinderGeometry(0.23, 0.23, 0.2, 20), M.stone, matrixAt(c.x, 0.56, c.y, 0, 0, Math.PI / 2));
    for (const s of [-1, 1]) B.add(new THREE.CircleGeometry(0.16, 20), M.panelCloud, matrixAt(c.x + s * 0.101, 0.56, c.y, 0, s * Math.PI / 2, 0));
  }
  addPlaque(dynamic, '雲端宮', 16, 3.32, FZ + 0.42, 2.4, 0.78);
  addPlaque(dynamic, '虎門', 8.3, 3.4, FZ + 0.32, 1.1, 0.36);
  addPlaque(dynamic, '龍門', 23.7, 3.4, FZ + 0.32, 1.1, 0.36);

  // ------------------------------------------------------------ roofs
  const roofs = [
    { x0: 2.9, x1: 29.1, zBack: 6.15, zFront: 16.25, zRidge: 10.6, hRidge: 8.6, hBack: 5.7, hFront: 5.35, curl: 0.95, ornate: true, crownScale: 1.15, gables: { xs: [3.55, 28.45], base: H_MAIN - 0.05 } },
    { x0: 3.0, x1: 29.0, zBack: -0.55, zFront: 6.6, zRidge: 3.0, hRidge: 7.0, hBack: 4.55, hFront: 5.0, curl: 0.75, side: true, gables: { xs: [3.55, 28.45], base: H_REAR - 0.05 } },
    { x0: 9.5, x1: 22.5, zBack: 26.75, zFront: 31.35, zRidge: 28.9, hRidge: 6.15, hBack: 4.0, hFront: 4.0, curl: 0.8, ornate: true, gables: { xs: [9.85, 22.15], base: 3.9 } },
    { x0: 2.9, x1: 9.8, zBack: 26.9, zFront: 31.2, zRidge: 28.9, hRidge: 5.3, hBack: 3.85, hFront: 3.85, curl: 0.6, side: true, crownScale: 0.85, gables: { xs: [3.4, 9.3], base: 3.85 } },
    { x0: 22.2, x1: 29.1, zBack: 26.9, zFront: 31.2, zRidge: 28.9, hRidge: 5.3, hBack: 3.85, hFront: 3.85, curl: 0.6, side: true, crownScale: 0.85, gables: { xs: [22.7, 28.6], base: 3.85 } },
  ];
  for (const r of roofs) {
    roof(B, M, r, { high });
    if (r.ribs) ribMeshes.push(new THREE.Mesh(r.ribs, r.side ? M.tileSide : M.tile));
  }

  // ------------------------------------------- 正殿 front and interior
  const couplets = ['雲來雲去心常靜', '步緩步穩福自臨'];
  for (const c of CIRCLES.filter((o) => o.kind === 'pillar')) {
    if (c.dragon) dragonPillar(B, M, c.x, c.y, H_MAIN, 0.28, c.x < 16 ? 0.6 : Math.PI + 0.6);
    else plainPillar(B, M, c.x, c.y, H_MAIN, c.r);
    if (c.couplet !== undefined) {
      // 上聯 hangs on the right when facing the hall (east), 下聯 on the left.
      addPlaque(dynamic, couplets[c.couplet], c.x, 2.75, c.y + c.r + 0.03, 0.34, 3.0, { vertical: true, style: { bg: '#a8231b', fg: '#f5d77a', border: '#e3b448' } });
    }
  }
  paintedBand(B, M, 4.0, 28.0, 4.5, 4.86, 15.47, 3.2);
  B.add(boxUV(4.0, 4.5, 15.2, 28.0, 4.86, 15.46), M.beamSide);
  bracketRow(B, M, 4.0, 28.0, 15.45, 4.86, 0.66);
  addPlaque(dynamic, '心誠則靈', 16, 4.2, 15.72, 2.6, 0.7);
  for (const z of [8.6, 11.2, 13.8]) {
    B.add(boxUV(4, 5.25, z - 0.13, 28, 5.47, z + 0.13), M.beamSide);
    paintedBand(B, M, 4, 28, 5.25, 5.47, z + 0.131, 3.2);
  }

  // Altars, shrines and statues.
  const altarBurners = {};
  const stationOfDeity = { mazu: 'main', wenchang: 'dragon', yuelao: 'tiger', guanyin: 'rear' };
  for (const s of SOLIDS.filter((o) => o.kind === 'altar')) {
    const cx = (s.x0 + s.x1) / 2;
    const w = s.x1 - s.x0;
    const front = s.y1;
    B.add(boxUV(s.x0, 0, s.y0, s.x1, 0.92, front), M.wallRed);
    B.add(boxUV(s.x0 - 0.05, 0.92, s.y0, s.x1 + 0.05, 0.98, front + 0.05), M.wood);
    B.add(new THREE.PlaneGeometry(w - 0.1, 0.8), M.cloth, matrixAt(cx, 0.48, front + 0.012));
    // Shrine cabinet (神龕) with gold posts, a small roof and a red valance.
    const sz0 = s.y0;
    const sz1 = s.y0 + 0.55;
    const sw = Math.min(w - 0.3, 2.2);
    B.add(boxUV(cx - sw / 2, 0.98, sz0, cx + sw / 2, 1.08, sz1), M.gold);
    B.add(boxUV(cx - sw / 2, 1.08, sz0, cx + sw / 2, 3.3, sz0 + 0.06), M.wood);
    for (const sx of [-1, 1]) {
      B.add(boxUV(cx + sx * (sw / 2) - 0.09, 1.08, sz0, cx + sx * (sw / 2) + 0.09, 3.3, sz1), M.lacquer);
      B.cyl(0.035, 0.035, 2.2, 8, M.gold, cx + sx * (sw / 2 - 0.12), 2.18, sz1 + 0.02);
    }
    B.add(boxUV(cx - sw / 2 - 0.15, 3.3, sz0, cx + sw / 2 + 0.15, 3.44, sz1 + 0.16), M.gold);
    const shrineRoof = { x0: cx - sw / 2 - 0.3, x1: cx + sw / 2 + 0.3, zBack: sz0 - 0.05, zFront: sz1 + 0.35, zRidge: sz0 + 0.25, hRidge: 3.95, hBack: 3.48, hFront: 3.46, curl: 0.18 };
    for (const [zE, hE] of [[shrineRoof.zFront, shrineRoof.hFront], [shrineRoof.zBack, shrineRoof.hBack]]) B.add(roofSlope(shrineRoof, zE, hE), M.roofUnder);
    ridgeCrown(B, M, shrineRoof.x0 + 0.1, shrineRoof.x1 - 0.1, shrineRoof.zRidge, 3.93, { scale: 0.32 });
    const val = new THREE.PlaneGeometry(sw, 0.34, 24, 1);
    const vp = val.attributes.position;
    for (let i = 0; i < vp.count; i++) vp.setZ(i, Math.sin(vp.getX(i) * 9) * 0.025);
    val.computeVertexNormals();
    B.add(val, M.curtain, matrixAt(cx, 3.12, sz1 + 0.04));
    addStatue(B, s.deity, cx, 1.06, sz0 + 0.3, w > 3 ? 1.15 : 1.0);
    if (shadows) {
      const glow = new THREE.PointLight('#ffcf8a', 1.4, 3.4, 1.8);
      glow.position.set(cx, 2.4, sz1 + 0.45);
      dynamic.add(glow);
    }
    addPlaque(dynamic, DEITY_LOOK[s.deity].name, cx, 2.82, sz1 + 0.2, Math.min(1.6, sw * 0.78), 0.34);
    // Offerings: burner, candles, fruit.
    B.add(new THREE.CylinderGeometry(0.17, 0.13, 0.2, 18), M.bronze, matrixAt(cx, 1.08, front - 0.32));
    for (const sx of [-1, 1]) {
      const px = cx + sx * Math.min(0.9, w / 2 - 0.25);
      B.cyl(0.05, 0.07, 0.08, 12, M.gold, px, 1.02, front - 0.35);
      B.cyl(0.035, 0.035, 0.3, 10, M.red, px, 1.21, front - 0.35);
      flames.push({ x: px, y: 1.42, z: front - 0.35, size: 0.12 });
      B.cyl(0.16, 0.12, 0.05, 14, M.gold, cx + sx * 0.45, 1.0, front - 0.25);
      for (let k = 0; k < 3; k++) B.add(new THREE.SphereGeometry(0.06, 10, 8), k === 1 ? M.yellow : M.red, matrixAt(cx + sx * 0.45 + (k - 1) * 0.08, 1.08, front - 0.25 + (k % 2) * 0.05));
    }
    altarBurners[stationOfDeity[s.deity]] = { x: cx, y: 1.18, z: front - 0.32, r: 0.12 };
    smoke.push({ id: stationOfDeity[s.deity], x: cx, y: 1.25, z: front - 0.32, rate: 0 });
  }

  // 天公爐: carved stone base, cast bronze cauldron, two-tier pavilion lid.
  const tg = CIRCLES.find((c) => c.id === 'tiangong');
  B.add(new THREE.CylinderGeometry(1.05, 1.12, 0.45, 8), M.stoneDark, matrixAt(tg.x, 0.225, tg.y));
  B.add(new THREE.CylinderGeometry(0.97, 1.02, 0.1, 24), M.stone, matrixAt(tg.x, 0.5, tg.y));
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
    B.add(new THREE.LatheGeometry([new THREE.Vector2(0.06, 0), new THREE.Vector2(0.13, 0.04), new THREE.Vector2(0.08, 0.22), new THREE.Vector2(0.1, 0.42), new THREE.Vector2(0.0, 0.45)], 10), M.bronzePlain, matrixAt(tg.x + Math.cos(a) * 0.55, 0.55, tg.y + Math.sin(a) * 0.55));
  }
  B.add(new THREE.LatheGeometry([
    new THREE.Vector2(0.0, 0), new THREE.Vector2(0.55, 0.02), new THREE.Vector2(0.8, 0.22), new THREE.Vector2(0.87, 0.58),
    new THREE.Vector2(0.94, 0.64), new THREE.Vector2(0.86, 0.7), new THREE.Vector2(0.0, 0.7),
  ], 40), M.bronze, matrixAt(tg.x, 0.95, tg.y));
  for (const sx of [-1, 1]) B.add(new THREE.TorusGeometry(0.17, 0.05, 10, 18, Math.PI), M.bronzePlain, matrixAt(tg.x + sx * 0.74, 1.68, tg.y, 0, Math.PI / 2, 0));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    B.cyl(0.028, 0.028, 0.55, 6, M.bronzePlain, tg.x + Math.cos(a) * 0.46, 1.93, tg.y + Math.sin(a) * 0.46);
  }
  B.add(new THREE.ConeGeometry(0.88, 0.36, 6), M.bronzePlain, matrixAt(tg.x, 2.38, tg.y));
  B.add(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 6), M.bronzePlain, matrixAt(tg.x, 2.65, tg.y));
  B.add(new THREE.ConeGeometry(0.46, 0.26, 6), M.bronzePlain, matrixAt(tg.x, 2.86, tg.y));
  B.add(new THREE.SphereGeometry(0.1, 12, 8), M.gold, matrixAt(tg.x, 3.06, tg.y));
  addPlaque(dynamic, '天公爐', tg.x, 1.3, tg.y + 0.93, 0.5, 0.18, { style: { bg: '#3b2a18', fg: '#e9c46a' } });
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
      tmp.rotation.set(Math.sin(i * 1.7) * 0.12, 0, Math.cos(i * 2.3) * 0.12);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    }
    dynamic.add(mesh);
    sticks[id] = { mesh, spot: b };
  }

  // 金爐: a small pagoda furnace — carved base, brick firebox, tiled roof.
  const fu = SOLIDS.find((o) => o.id === 'furnace');
  const fcx = (fu.x0 + fu.x1) / 2;
  const fcz = (fu.y0 + fu.y1) / 2;
  B.add(boxUV(fu.x0 - 0.12, 0, fu.y0 - 0.12, fu.x1 + 0.12, 0.45, fu.y1 + 0.12), M.stoneDark);
  for (const [ry, dx, dz] of [[Math.PI / 2, 1, 0], [0, 0, 1]]) facePlane(B, M.panelWave, fcx + dx * (fu.x1 - fcx + 0.121), 0.22, fcz + dz * (fu.y1 - fcz + 0.121), 1.8, 0.36, ry);
  B.add(boxUV(fu.x0, 0.45, fu.y0, fu.x1, 2.05, fu.y1), M.wallBrick);
  B.add(boxUV(fu.x0 - 0.1, 2.05, fu.y0 - 0.1, fu.x1 + 0.1, 2.18, fu.y1 + 0.1), M.stone);
  B.add(boxUV(fu.x0 + 0.3, 2.18, fu.y0 + 0.3, fu.x1 - 0.3, 2.75, fu.y1 - 0.3), M.wallBrick);
  const furRoof = { x0: fu.x0 - 0.45, x1: fu.x1 + 0.45, zBack: fu.y0 - 0.45, zFront: fu.y1 + 0.45, zRidge: fcz, hRidge: 3.35, hBack: 2.72, hFront: 2.72, curl: 0.35 };
  for (const [zE, hE] of [[furRoof.zFront, furRoof.hFront], [furRoof.zBack, furRoof.hBack]]) {
    B.add(roofSlope(furRoof, zE, hE), M.roofUnder);
    eaveDetails(B, M, furRoof, zE, hE, false);
  }
  ridgeCrown(B, M, furRoof.x0 + 0.2, furRoof.x1 - 0.2, fcz, 3.33, { scale: 0.45 });
  B.cyl(0.18, 0.22, 0.6, 12, M.wallBrick, fcx, 3.75, fcz);
  B.add(new THREE.TorusGeometry(0.5, 0.07, 8, 24, Math.PI), M.stone, matrixAt(fu.x1 + 0.01, 0.95, fcz, 0, Math.PI / 2, 0));
  B.add(new THREE.PlaneGeometry(1.0, 0.95), M.fireHole, matrixAt(fu.x1 + 0.012, 0.95, fcz, 0, Math.PI / 2, 0));
  const fireMat = new THREE.MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0.85 });
  const fire = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.5), fireMat);
  fire.position.set(fu.x1 + 0.02, 0.8, fcz);
  fire.rotation.y = Math.PI / 2;
  dynamic.add(fire);
  const fireLight = new THREE.PointLight('#ff8a3c', 1.5, 4.5, 1.6);
  fireLight.position.set(fu.x1 + 0.6, 1.0, fcz);
  if (shadows) dynamic.add(fireLight);
  addPlaque(dynamic, '金爐', fu.x1 + 0.035, 1.72, fcz, 0.62, 0.26, { ry: Math.PI / 2 });
  smoke.push({ id: 'furnace', x: fcx, y: 4.1, z: fcz, rate: 0.4, dark: true });

  // 求籤處: table, lot tube, moon blocks and the fortune-slip cabinet.
  const lt = SOLIDS.find((o) => o.id === 'lotsTable');
  B.add(boxUV(lt.x0, 0, lt.y0, lt.x1, 0.86, lt.y1), M.wallRed);
  B.add(boxUV(lt.x0 - 0.04, 0.86, lt.y0 - 0.04, lt.x1 + 0.04, 0.9, lt.y1 + 0.04), M.wood);
  const ltx = (lt.x0 + lt.x1) / 2;
  const ltz = (lt.y0 + lt.y1) / 2;
  B.cyl(0.14, 0.13, 0.4, 16, M.bamboo, ltx + 0.2, 1.1, ltz - 0.2);
  for (let i = 0; i < 16; i++) {
    const a = i * 2.4;
    B.cyl(0.008, 0.008, 0.62, 4, M.bamboo, ltx + 0.2 + Math.cos(a) * 0.07, 1.25, ltz - 0.2 + Math.sin(a) * 0.07, Math.sin(a) * 0.08, Math.cos(a) * 0.08);
  }
  for (const dz of [0.15, 0.4]) B.add(new THREE.SphereGeometry(0.09, 12, 6, 0, Math.PI, 0, Math.PI), M.red, matrixAt(ltx + 0.25, 0.9, ltz + dz, -Math.PI / 2, 0, 0, 1, 1, 0.45));
  B.add(boxUV(4.0, 0, 16.4, 4.32, 2.2, 19.0), M.wood);
  B.add(new THREE.PlaneGeometry(2.5, 1.9), M.hexLattice, matrixAt(4.33, 1.15, 17.7, 0, Math.PI / 2, 0));
  addPlaque(dynamic, '求籤處', 4.36, 2.5, 17.7, 1.2, 0.38, { ry: Math.PI / 2 });

  // 服務台 under a small tiled canopy.
  const dk = SOLIDS.find((o) => o.id === 'desk');
  B.add(boxUV(dk.x0, 0, dk.y0, dk.x1, 1.0, dk.y1), M.wallRed);
  B.add(boxUV(dk.x0 - 0.06, 1.0, dk.y0 - 0.06, dk.x1 + 0.06, 1.06, dk.y1 + 0.06), M.wood);
  for (let i = 0; i < 4; i++) B.cyl(0.05, 0.05, 0.42, 10, M.paper, dk.x0 + 0.35, 1.27, dk.y0 + 0.5 + i * 0.22);
  for (let i = 0; i < 3; i++) B.add(boxUV(dk.x0 + 0.7, 1.06, dk.y0 + 1.6 + i * 0.35, dk.x0 + 1.1, 1.18 + i * 0.03, dk.y0 + 1.9 + i * 0.35), M.paper);
  B.add(boxUV(dk.x1 - 0.1, 1.06, dk.y0, dk.x1 + 0.05, 2.4, dk.y1), M.wallRed);
  for (const c of CIRCLES.filter((o) => o.kind === 'post')) B.cyl(c.r, c.r, 2.6, 10, M.lacquer, c.x, 1.3, c.y);
  const deskRoof = { x0: 27.05, x1: 29.75, zBack: 31.9, zFront: 35.9, zRidge: 33.9, hRidge: 3.25, hBack: 2.6, hFront: 2.6, curl: 0.25, side: true };
  for (const [zE, hE] of [[deskRoof.zFront, deskRoof.hFront], [deskRoof.zBack, deskRoof.hBack]]) {
    const g = roofSlope(deskRoof, zE, hE);
    B.add(g, M.roofUnderSide);
    B.add(g, M.ceiling);
    eaveDetails(B, M, deskRoof, zE, hE, false);
  }
  ridgeCrown(B, M, deskRoof.x0 + 0.15, deskRoof.x1 - 0.15, deskRoof.zRidge, 3.23, { scale: 0.4 });
  addPlaque(dynamic, '服務台', dk.x1 - 0.12, 1.95, (dk.y0 + dk.y1) / 2, 1.6, 0.48, { ry: -Math.PI / 2 });

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
    B.add(boxUV(w.x0, 0, w.y0, w.x1, 3.0, w.y1), M.wood);
    B.add(boxUV(w.x0 - 0.06, 3.0, w.y0, w.x1 + 0.06, 3.12, w.y1 + 0.08), M.gold);
    for (let i = 0; i < perWall; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      lampTmp.position.set(w.x0 + 0.33 + c * 0.47, 0.55 + r * 0.31, w.y1 + 0.035);
      lampTmp.updateMatrix();
      lampMesh.setMatrixAt(wi * perWall + i, lampTmp.matrix);
    }
    addPlaque(dynamic, '光明燈', (w.x0 + w.x1) / 2, 3.42, w.y1 + 0.06, 1.4, 0.42);
  });
  const lampOff = new THREE.Color('#6b5a3a');
  const lampOn = new THREE.Color('#ffd88a');
  for (let i = 0; i < LAMP_SLOTS; i++) lampMesh.setColorAt(i, lampOff);
  dynamic.add(lampMesh);

  // Bell and drum.
  const bell = CIRCLES.find((c) => c.id === 'bell');
  for (const sx of [-1, 1]) B.cyl(0.07, 0.07, 2.3, 10, M.lacquer, bell.x + sx * 0.5, 1.15, bell.y);
  B.add(boxUV(bell.x - 0.65, 2.22, bell.y - 0.08, bell.x + 0.65, 2.36, bell.y + 0.08), M.wood);
  B.add(new THREE.LatheGeometry([new THREE.Vector2(0.0, 0), new THREE.Vector2(0.36, 0), new THREE.Vector2(0.34, 0.1), new THREE.Vector2(0.26, 0.6), new THREE.Vector2(0.18, 0.72), new THREE.Vector2(0.0, 0.74)], 24), M.bronze, matrixAt(bell.x, 1.3, bell.y));
  const drum = CIRCLES.find((c) => c.id === 'drum');
  B.add(boxUV(drum.x - 0.45, 0, drum.y - 0.35, drum.x + 0.45, 0.5, drum.y + 0.35), M.wood);
  B.add(new THREE.CylinderGeometry(0.5, 0.5, 0.62, 24), M.red, matrixAt(drum.x, 1.05, drum.y, Math.PI / 2, 0, 0));
  for (const dz of [-0.32, 0.32]) B.add(new THREE.CylinderGeometry(0.45, 0.45, 0.02, 24), M.plaster, matrixAt(drum.x, 1.05, drum.y + dz, Math.PI / 2, 0, 0));

  // Stone lions on carved pedestals, facing the street.
  for (const c of CIRCLES.filter((o) => o.kind === 'lion')) stoneLion(B, M, c.x, c.y, c.x < 16);

  // Banyan tree, glazed pots with shrubs.
  const tree = CIRCLES.find((c) => c.kind === 'tree');
  B.cyl(0.35, 0.55, 3.0, 14, M.trunk, tree.x, 1.5, tree.y);
  for (const [dx, dy, dz, s, m] of [[0, 4.9, 0, 2.2, M.leaf], [1.4, 4.4, 0.6, 1.6, M.leaf2], [-1.2, 4.5, 0.4, 1.5, M.leaf], [0.4, 4.7, -1.3, 1.6, M.leaf2], [-0.3, 5.3, 1.4, 1.4, M.leaf3], [1.0, 5.4, -0.6, 1.2, M.leaf3]]) {
    B.add(new THREE.IcosahedronGeometry(s, 1), m, matrixAt(tree.x + dx, dy, tree.y + dz, 0, 0, 0, 1, 0.75, 1));
  }
  for (let i = 0; i < 9; i++) {
    const a = i * 0.8;
    B.cyl(0.02, 0.02, 1.8, 4, M.trunk, tree.x + Math.cos(a) * 1.4, 2.7, tree.y + Math.sin(a) * 1.2);
  }
  for (const c of CIRCLES.filter((o) => o.kind === 'plant' || o.kind === 'pot')) {
    B.add(new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.26, 0), new THREE.Vector2(0.36, 0.3), new THREE.Vector2(0.38, 0.52), new THREE.Vector2(0.33, 0.56), new THREE.Vector2(0, 0.56)], 18), M.pot, matrixAt(c.x, 0, c.y));
    B.add(new THREE.TorusGeometry(0.35, 0.025, 6, 24), M.potRim, matrixAt(c.x, 0.54, c.y, Math.PI / 2, 0, 0));
    for (const [dx, dy, dz, s, m] of [[0, 0.95, 0, 0.42, M.leaf2], [0.18, 0.8, 0.1, 0.3, M.leaf3], [-0.16, 0.85, -0.1, 0.32, M.leaf]]) {
      B.add(new THREE.IcosahedronGeometry(s, 1), m, matrixAt(c.x + dx, dy, c.y + dz, 0, 0, 0, 1, 0.85, 1));
    }
  }

  // Plaza low walls.
  for (const s of SOLIDS.filter((o) => o.kind === 'lowWall')) {
    wall(B, M.wallRed, s.x0, s.y0, s.x1, s.y1, 0, s.h);
    wall(B, M.roofUnderSide, s.x0 - 0.06, s.y0 - 0.06, s.x1 + 0.06, s.y1 + 0.06, s.h, s.h + 0.1);
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
    if (!arrowMats[label]) arrowMats[label] = new THREE.MeshBasicMaterial({ map: arrowTexture(label), transparent: true, depthWrite: false, opacity: 0.75 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), arrowMats[label]);
    m.rotation.set(-Math.PI / 2, 0, rot);
    m.position.set(x, 0.014, z);
    dynamic.add(m);
  }

  const lanterns = makeLanterns();
  dynamic.add(lanterns.group);
  const strings = lanternStrings(M);
  dynamic.add(strings.group);

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
  for (const m of ribMeshes) {
    m.castShadow = shadows;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    root.add(m);
  }

  // ------------------------------------------------------------ updates
  let litCount = -1;
  const litSet = new Set();
  const glowMats = [...lanterns.mats, strings.mat];
  function update(dt, time, shared, night) {
    for (const l of lanterns.list) {
      l.g.rotation.z = Math.sin(time * 0.9 + l.phase) * 0.035;
      l.g.rotation.x = Math.cos(time * 0.7 + l.phase) * 0.02;
    }
    for (const m of glowMats) m.emissiveIntensity = night ? 2.2 : 0.18;
    const flick = 0.85 + Math.sin(time * 17) * 0.06 + Math.sin(time * 9.3) * 0.08;
    fireMat.opacity = 0.7 + Math.sin(time * 11) * 0.12;
    fireLight.intensity = (night ? 2.6 : 1.2) * flick;
    fire.scale.y = 0.9 + Math.sin(time * 13) * 0.1;
    if (shared) {
      for (const [id, s] of Object.entries(sticks)) {
        const count = Math.min(60, shared.burners?.[id] ?? 0);
        if (s.mesh.count !== count) s.mesh.count = count;
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
