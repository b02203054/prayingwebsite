// Headless crowd report: runs a room and prints collision / flow statistics.
// Usage: node tools/sim-report.js [seconds=300] [npcTarget=22] [--svg out.svg]
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Room, DT } from '../public/js/sim/room.js';
import { SOLIDS, CIRCLES, STATIONS, WORLD, ZONES } from '../public/js/sim/world.js';
import { obstacleDistance } from '../public/js/sim/nav.js';

const args = process.argv.slice(2);
const seconds = Number(args[0] ?? 300);
const npcTarget = Number(args[1] ?? 22);
const svgIdx = args.indexOf('--svg');
const svgOut = svgIdx >= 0 ? args[svgIdx + 1] : null;

const room = new Room({ id: 'report', seed: 7, npcTarget });
const steps = Math.round(seconds / DT);
const hit = { nx: 0, ny: 0, d: 0 };
let minGap = Infinity;
let overlapTicks = 0;
let worstPen = 0;
let maxStepMs = 0;
let totalMs = 0;
let invariantError = null;
const trails = new Map();

for (let i = 0; i < steps; i++) {
  const t0 = performance.now();
  room.step(DT);
  const ms = performance.now() - t0;
  totalMs += ms;
  if (i > 30) maxStepMs = Math.max(maxStepMs, ms);
  const list = room.list;
  let tickOverlap = false;
  for (let a = 0; a < list.length; a++) {
    const A = list[a];
    for (let b = a + 1; b < list.length; b++) {
      const B = list[b];
      const gap = Math.hypot(A.x - B.x, A.y - B.y) - A.r - B.r;
      if (gap < minGap) minGap = gap;
      if (gap < -0.01) tickOverlap = true;
    }
    for (const o of room.nav.obstaclesNear(A.x, A.y)) {
      const pen = A.r - obstacleDistance(o, A.x, A.y, hit).d;
      if (pen > worstPen) worstPen = pen;
    }
    if (svgOut && i % 6 === 0 && i > steps - 1800) {
      if (!trails.has(A.id)) trails.set(A.id, []);
      trails.get(A.id).push([A.x, A.y]);
    }
  }
  if (tickOverlap) overlapTicks++;
  if (!invariantError) invariantError = room.stations.validate();
}

const s = room.stats;
console.log(JSON.stringify({
  simSeconds: seconds,
  npcTarget,
  agentsNow: room.list.length,
  spawned: s.spawned,
  completedVisits: s.completed,
  gaveUp: s.gaveUp,
  replans: s.unstuck,
  despawnedStuck: s.despawnedStuck,
  minGapCm: +(minGap * 100).toFixed(2),
  ticksWithOverlapOver1cm: overlapTicks,
  worstWallPenetrationCm: +(worstPen * 100).toFixed(2),
  avgStepMs: +(totalMs / steps).toFixed(3),
  maxStepMs: +maxStepMs.toFixed(2),
  stationInvariant: invariantError ?? 'ok',
  queues: room.stations.summary(),
}, null, 2));

if (svgOut) {
  const k = 20;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${WORLD.w * k}" height="${WORLD.h * k}" viewBox="0 0 ${WORLD.w} ${WORLD.h}">`,
    `<rect width="${WORLD.w}" height="${WORLD.h}" fill="#f4efe6"/>`];
  for (const z of ZONES) parts.push(`<rect x="${z.x0}" y="${z.y0}" width="${z.x1 - z.x0}" height="${z.y1 - z.y0}" fill="${z.strict ? '#ffd9d0' : '#e8f1ff'}" opacity="0.6"/>`);
  for (const o of SOLIDS) parts.push(`<rect x="${o.x0}" y="${o.y0}" width="${o.x1 - o.x0}" height="${o.y1 - o.y0}" fill="#8a5a44"/>`);
  for (const o of CIRCLES) parts.push(`<circle cx="${o.x}" cy="${o.y}" r="${o.r}" fill="#8a5a44"/>`);
  for (const st of STATIONS) {
    for (const q of st.queue) parts.push(`<circle cx="${q.x}" cy="${q.y}" r="0.12" fill="#3b82f6"/>`);
    for (const sl of st.slots) parts.push(`<rect x="${sl.x - 0.25}" y="${sl.y - 0.25}" width="0.5" height="0.5" fill="#dc2626"/><circle cx="${sl.ax}" cy="${sl.ay}" r="0.08" fill="#16a34a"/><circle cx="${sl.ex}" cy="${sl.ey}" r="0.08" fill="#9333ea"/>`);
  }
  for (const pts of trails.values()) {
    if (pts.length < 2) continue;
    parts.push(`<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#111" stroke-width="0.05" opacity="0.35"/>`);
  }
  for (const a of room.list) parts.push(`<circle cx="${a.x}" cy="${a.y}" r="${a.r}" fill="${a.still ? '#f59e0b' : '#10b981'}" stroke="#000" stroke-width="0.03"/>`);
  parts.push('</svg>');
  mkdirSync(dirname(svgOut), { recursive: true });
  writeFileSync(svgOut, parts.join('\n'));
  console.log(`svg written: ${svgOut}`);
}
