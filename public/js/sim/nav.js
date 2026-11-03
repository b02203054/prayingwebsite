// Navigation grid: A* with clearance cost, one-way flow cost and soft "please
// don't walk here" areas (queues, cushions, the space in front of altars),
// followed by line-of-sight smoothing.
import { WORLD, SOLIDS, CIRCLES, ZONES, SACRED, STATIONS, AGENT_RADIUS } from './world.js';

const SQRT2 = Math.SQRT2;
const NEIGHBORS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

// Distance from a point to an obstacle surface, with the outward normal.
// Negative distance means the point is inside.
export function obstacleDistance(o, x, y, out) {
  if (o.r !== undefined) {
    const dx = x - o.x;
    const dy = y - o.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-9) { out.nx = 1; out.ny = 0; out.d = -o.r; return out; }
    out.nx = dx / d; out.ny = dy / d; out.d = d - o.r;
    return out;
  }
  const cx = Math.max(o.x0, Math.min(x, o.x1));
  const cy = Math.max(o.y0, Math.min(y, o.y1));
  const dx = x - cx;
  const dy = y - cy;
  const d = Math.hypot(dx, dy);
  if (d > 1e-9) { out.nx = dx / d; out.ny = dy / d; out.d = d; return out; }
  // Inside the box: push out through the nearest face.
  const left = x - o.x0;
  const right = o.x1 - x;
  const top = y - o.y0;
  const bottom = o.y1 - y;
  const m = Math.min(left, right, top, bottom);
  if (m === left) { out.nx = -1; out.ny = 0; } else if (m === right) { out.nx = 1; out.ny = 0; } else if (m === top) { out.nx = 0; out.ny = -1; } else { out.nx = 0; out.ny = 1; }
  out.d = -m;
  return out;
}

class MinHeap {
  constructor(capacity) {
    this.ids = new Int32Array(capacity);
    this.keys = new Float32Array(capacity);
    this.size = 0;
  }
  clear() { this.size = 0; }
  push(id, key) {
    let i = this.size++;
    const ids = this.ids;
    const keys = this.keys;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      ids[i] = ids[p]; keys[i] = keys[p]; i = p;
    }
    ids[i] = id; keys[i] = key;
  }
  pop() {
    const ids = this.ids;
    const keys = this.keys;
    const top = ids[0];
    const lastId = ids[--this.size];
    const lastKey = keys[this.size];
    let i = 0;
    const n = this.size;
    while (true) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && keys[c + 1] < keys[c]) c++;
      if (keys[c] >= lastKey) break;
      ids[i] = ids[c]; keys[i] = keys[c]; i = c;
    }
    ids[i] = lastId; keys[i] = lastKey;
    return top;
  }
}

export class NavGrid {
  constructor({ cell = 0.5, radius = AGENT_RADIUS, margin = 0.07 } = {}) {
    this.cell = cell;
    this.cols = Math.ceil(WORLD.w / cell);
    this.rows = Math.ceil(WORLD.h / cell);
    const n = this.cols * this.rows;
    this.size = n;
    this.inflate = radius + margin;
    this.obstacles = [...SOLIDS, ...CIRCLES];
    this.blocked = new Uint8Array(n);
    this.clearance = new Float32Array(n);
    this.cost = new Float32Array(n);
    this.extra = new Float32Array(n);
    this.zone = new Int16Array(n).fill(-1);
    this.nearObstacles = new Array(n);
    this.g = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.openStamp = new Uint32Array(n);
    this.closedStamp = new Uint32Array(n);
    this.stamp = 0;
    this.heap = new MinHeap(n * 8);
    this.build();
  }

  index(cx, cy) { return cy * this.cols + cx; }
  cellX(x) { return Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cell))); }
  cellY(y) { return Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cell))); }
  centerX(cx) { return (cx + 0.5) * this.cell; }
  centerY(cy) { return (cy + 0.5) * this.cell; }

  build() {
    const tmp = { nx: 0, ny: 0, d: 0 };
    const reach = 2.6;
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const i = this.index(cx, cy);
        const x = this.centerX(cx);
        const y = this.centerY(cy);
        // World bounds act as walls (the street edge is far enough below spawn).
        let clear = Math.min(x, WORLD.w - x, y, WORLD.h - y + 0.6);
        const near = [];
        for (const o of this.obstacles) {
          const d = obstacleDistance(o, x, y, tmp).d;
          if (d < clear) clear = d;
          if (d < reach) near.push(o);
        }
        this.clearance[i] = clear;
        this.nearObstacles[i] = near;
        this.blocked[i] = clear < this.inflate ? 1 : 0;
        // Prefer the middle of aisles: walking right next to a wall costs more.
        this.cost[i] = 1 + 1.6 * Math.max(0, (1.0 - clear) / 1.0);
        for (let z = 0; z < ZONES.length; z++) {
          const zn = ZONES[z];
          if (x >= zn.x0 && x <= zn.x1 && y >= zn.y0 && y <= zn.y1) { this.zone[i] = z; break; }
        }
      }
    }
    // Soft areas: queues, worship slots, the space in front of altars.
    const addDisc = (px, py, r, amount) => {
      const c0 = this.cellX(px - r); const c1 = this.cellX(px + r);
      const r0 = this.cellY(py - r); const r1 = this.cellY(py + r);
      for (let cy = r0; cy <= r1; cy++) {
        for (let cx = c0; cx <= c1; cx++) {
          if (Math.hypot(this.centerX(cx) - px, this.centerY(cy) - py) <= r) this.extra[this.index(cx, cy)] += amount;
        }
      }
    };
    for (const s of STATIONS) {
      for (const q of s.queue) addDisc(q.x, q.y, 0.45, 1.2);
      for (const slot of s.slots) addDisc(slot.x, slot.y, 0.5, 2.5);
    }
    addDisc(16.0, 20.4, 1.7, 1.5);
    for (const r of SACRED) {
      for (let cy = this.cellY(r.y0); cy <= this.cellY(r.y1); cy++) {
        for (let cx = this.cellX(r.x0); cx <= this.cellX(r.x1); cx++) this.extra[this.index(cx, cy)] += 6;
      }
    }
  }

  isBlockedAt(x, y) {
    if (x < 0 || y < 0 || x >= WORLD.w || y >= WORLD.h) return true;
    return this.blocked[this.index(this.cellX(x), this.cellY(y))] === 1;
  }

  obstaclesNear(x, y) {
    return this.nearObstacles[this.index(this.cellX(x), this.cellY(y))];
  }

  // Exact walkability test against the real geometry (used for validating positions).
  clearanceAt(x, y) {
    const tmp = { nx: 0, ny: 0, d: 0 };
    let best = Math.min(x, WORLD.w - x, y, WORLD.h - y + 0.6);
    for (const o of this.obstaclesNear(x, y)) best = Math.min(best, obstacleDistance(o, x, y, tmp).d);
    return best;
  }

  // Nearest free cell center to (x, y); returns the cell index or -1.
  nearestFree(x, y, maxRing = 12) {
    const cx = this.cellX(x);
    const cy = this.cellY(y);
    if (!this.blocked[this.index(cx, cy)]) return this.index(cx, cy);
    let best = -1;
    let bestD = Infinity;
    for (let ring = 1; ring <= maxRing && best < 0; ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
          const i = this.index(nx, ny);
          if (this.blocked[i]) continue;
          const d = Math.hypot(this.centerX(nx) - x, this.centerY(ny) - y);
          if (d < bestD) { bestD = d; best = i; }
        }
      }
    }
    return best;
  }

  nearestFreePoint(x, y) {
    if (!this.isBlockedAt(x, y)) return { x, y };
    const i = this.nearestFree(x, y);
    if (i < 0) return { x, y };
    return { x: this.centerX(i % this.cols), y: this.centerY(Math.floor(i / this.cols)) };
  }

  stepCost(from, to, dx, dy, len) {
    let c = len * this.cell * 0.5 * (this.cost[from] + this.cost[to]) + this.extra[to] * this.cell * len;
    const z = this.zone[to];
    if (z >= 0) {
      const zn = ZONES[z];
      const ux = dx / len;
      const uy = dy / len;
      const against = -(ux * zn.dx + uy * zn.dy);
      if (against > 0) c += zn.k * against * len * this.cell;
    }
    return c;
  }

  // A* from (sx, sy) to (tx, ty). Returns smoothed waypoints ending at the goal, or null.
  findPath(sx, sy, tx, ty) {
    const start = this.nearestFree(sx, sy);
    const goal = this.nearestFree(tx, ty);
    if (start < 0 || goal < 0) return null;
    if (start === goal) return [{ x: tx, y: ty }];
    const cols = this.cols;
    const gx = goal % cols;
    const gy = Math.floor(goal / cols);
    const stamp = ++this.stamp;
    const { g, parent, openStamp, closedStamp, heap, blocked } = this;
    heap.clear();
    g[start] = 0;
    parent[start] = -1;
    openStamp[start] = stamp;
    const h = (i) => {
      const dx = Math.abs((i % cols) - gx);
      const dy = Math.abs(Math.floor(i / cols) - gy);
      return (Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy)) * this.cell;
    };
    heap.push(start, h(start));
    let found = false;
    let guard = 0;
    while (heap.size > 0) {
      const cur = heap.pop();
      if (closedStamp[cur] === stamp) continue;
      closedStamp[cur] = stamp;
      if (cur === goal) { found = true; break; }
      if (++guard > this.size * 4) break;
      const cx = cur % cols;
      const cy = Math.floor(cur / cols);
      for (const [dx, dy, len] of NEIGHBORS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= this.rows) continue;
        const ni = ny * cols + nx;
        if (blocked[ni] || closedStamp[ni] === stamp) continue;
        // No corner cutting on diagonals.
        if (dx !== 0 && dy !== 0 && (blocked[cy * cols + nx] || blocked[ny * cols + cx])) continue;
        const ng = g[cur] + this.stepCost(cur, ni, dx, dy, len);
        if (openStamp[ni] === stamp && ng >= g[ni]) continue;
        openStamp[ni] = stamp;
        g[ni] = ng;
        parent[ni] = cur;
        heap.push(ni, ng + h(ni));
      }
    }
    if (!found) return null;
    const cells = [];
    for (let i = goal; i !== -1; i = parent[i]) cells.push(i);
    cells.reverse();
    const raw = cells.map((i) => ({ x: this.centerX(i % cols), y: this.centerY(Math.floor(i / cols)) }));
    raw[0] = { x: sx, y: sy };
    raw[raw.length - 1] = this.isBlockedAt(tx, ty) ? raw[raw.length - 1] : { x: tx, y: ty };
    return this.smooth(raw);
  }

  // Can an agent walk straight from a to b? Rejects walls, strict one-way zones
  // walked the wrong way, and soft areas (except near the end of the segment).
  lineOfSight(ax, ay, bx, by, allowSoftNearEnd = 1.0) {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return true;
    const ux = dx / len;
    const uy = dy / len;
    const steps = Math.ceil(len / 0.2);
    const startExtra = this.extra[this.index(this.cellX(ax), this.cellY(ay))];
    for (let s = 1; s <= steps; s++) {
      const t = Math.min(len, s * 0.2);
      const x = ax + ux * t;
      const y = ay + uy * t;
      if (this.isBlockedAt(x, y)) return false;
      const i = this.index(this.cellX(x), this.cellY(y));
      const z = this.zone[i];
      if (z >= 0 && ZONES[z].strict && ux * ZONES[z].dx + uy * ZONES[z].dy < -0.2) return false;
      if (this.extra[i] >= 2.4 && len - t > allowSoftNearEnd && this.extra[i] > startExtra + 0.5) return false;
    }
    return true;
  }

  // Greedy string pulling: from each kept point, extend as far as the line of sight holds.
  smooth(points) {
    if (points.length <= 2) return points.slice(1);
    const out = [];
    let i = 0;
    const last = points.length - 1;
    while (i < last) {
      let j = i + 1;
      while (j < last && this.lineOfSight(points[i].x, points[i].y, points[j + 1].x, points[j + 1].y)) j++;
      out.push(points[j]);
      i = j;
    }
    return out;
  }
}
