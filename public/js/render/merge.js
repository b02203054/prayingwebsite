// Collects static geometry per material and merges it into a few meshes,
// so the whole temple costs a handful of draw calls.
import * as THREE from '../../vendor/three/build/three.module.min.js';

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3(1, 1, 1);

export function matrixAt(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  tmpEuler.set(rx, ry, rz);
  tmpQuat.setFromEuler(tmpEuler);
  tmpPos.set(x, y, z);
  tmpScale.set(sx, sy, sz);
  return tmpMatrix.compose(tmpPos, tmpQuat, tmpScale).clone();
}

export class StaticBuilder {
  constructor() {
    this.groups = new Map();
  }

  add(geometry, material, matrix) {
    let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (matrix) g.applyMatrix4(matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    let entry = this.groups.get(material);
    if (!entry) {
      entry = [];
      this.groups.set(material, entry);
    }
    entry.push(g);
    return g;
  }

  box(w, h, d, material, x, y, z, ry = 0) {
    return this.add(new THREE.BoxGeometry(w, h, d), material, matrixAt(x, y, z, 0, ry, 0));
  }

  // Box given by plan extents and a vertical range.
  slab(x0, z0, x1, z1, y0, y1, material) {
    return this.box(x1 - x0, y1 - y0, z1 - z0, material, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  }

  cyl(rTop, rBottom, h, seg, material, x, y, z, rx = 0, rz = 0) {
    return this.add(new THREE.CylinderGeometry(rTop, rBottom, h, seg), material, matrixAt(x, y, z, rx, 0, rz));
  }

  build({ castShadow = true, receiveShadow = true } = {}) {
    const group = new THREE.Group();
    for (const [material, list] of this.groups) {
      const mesh = new THREE.Mesh(mergeList(list), material);
      mesh.castShadow = castShadow && !material.transparent;
      mesh.receiveShadow = receiveShadow;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
    }
    return group;
  }
}

export function mergeList(list) {
  let count = 0;
  for (const g of list) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const hasColor = list.some((g) => g.attributes.color);
  const col = hasColor ? new Float32Array(count * 3) : null;
  let o = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    if (col) {
      if (g.attributes.color) col.set(g.attributes.color.array, o * 3);
      else col.fill(1, o * 3, (o + n) * 3);
    }
    o += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

// Paint a geometry with one vertex color (for per-character baked colors).
export function paint(geometry, color) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
