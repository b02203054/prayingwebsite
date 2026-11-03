// Movement helpers shared by the server crowd (NPCs) and the browser avatar.
// Layers, from soft to hard:
//   1. path following gives a preferred velocity,
//   2. ORCA picks the closest velocity that avoids people and walls,
//   3. acceleration limiting keeps motion smooth,
//   4. a position pass guarantees bodies never overlap.
import { obstacleDistance } from './nav.js';
import { WORLD } from './world.js';

export const MOVE = {
  dt: 1 / 30,
  neighborDist: 3.2,
  maxNeighbors: 10,
  tau: 1.7, // look-ahead (s) for people who are walking
  tauStill: 0.7, // look-ahead (s) for people standing still
  tauObst: 0.45, // look-ahead (s) for walls and furniture
  personalSpace: 0.05, // added to each radius inside ORCA (m)
  contactGap: 0.015, // hard minimum gap between bodies (m)
  maxAccel: 9, // m/s^2
};

const hit = { nx: 0, ny: 0, d: 0 };

// Pick up to `max` nearest neighbors of `self` from `others` (array of bodies).
export function gatherNeighbors(self, others, out, max = MOVE.maxNeighbors, range = MOVE.neighborDist) {
  out.length = 0;
  const r2 = range * range;
  for (const o of others) {
    if (o === self || o.id === self.id) continue;
    const dx = o.x - self.x;
    const dy = o.y - self.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    o._d2 = d2;
    out.push(o);
  }
  if (out.length > max) {
    out.sort((a, b) => a._d2 - b._d2);
    out.length = max;
  }
  return out;
}

// Bend the preferred velocity around people standing in the way, and keep to
// the right when someone walks straight at us. ORCA alone tends to slow to a
// stop in front of a standing person instead of stepping around them.
// `goalDist` is how far away we intend to stop (Infinity while en route).
export function steerAround(self, pvx, pvy, neighbors, goalDist, out) {
  out.x = pvx;
  out.y = pvy;
  const sp = Math.hypot(pvx, pvy);
  if (sp < 1e-4) return out;
  const dx = pvx / sp;
  const dy = pvy / sp;
  const rx = -dy; // right-hand side (plan y grows downward)
  const ry = dx;
  const look = 2.6;
  let lateral = 0;
  let crowded = false;
  for (const n of neighbors) {
    const ox = n.x - self.x;
    const oy = n.y - self.y;
    const ahead = ox * dx + oy * dy;
    if (ahead > 0 && ahead < 1.1 && Math.abs(ox * rx + oy * ry) < 0.9) crowded = true;
    if (ahead <= 0 || ahead > look || ahead > goalDist - 0.3) continue;
    const side = ox * rx + oy * ry;
    const R = self.r + n.r + 0.25;
    if (Math.abs(side) >= R) continue;
    // Someone who has stopped (even if only because of the crowd) is treated as standing.
    const standing = n.still || n.vx * n.vx + n.vy * n.vy < 0.0225;
    if (!standing && n.vx * dx + n.vy * dy > -0.2) continue;
    const urgency = (1 - Math.abs(side) / R) * (1 - ahead / look);
    const dir = Math.abs(side) < 0.05 ? 1 : -Math.sign(side);
    lateral += dir * urgency * (standing ? 1.3 : 0.8);
  }
  // Impatience: when boxed in by people (not near our own stop), lean further
  // right and then step back a little to make room, as people do.
  let back = 0;
  let speed = sp;
  const jam = self.jam || 0;
  if (crowded && goalDist > 1.0 && jam > 0.6) {
    lateral += Math.min(1.4, (jam - 0.6) * 1.2);
    if (jam > 1.2) back = Math.min(0.9, (jam - 1.2) * 0.8);
    speed = sp * 0.6;
  }
  if (lateral === 0 && back === 0) return out;
  lateral = Math.max(-1.6, Math.min(2.4, lateral));
  const nx = dx * (1 - 2 * back) + rx * lateral;
  const ny = dy * (1 - 2 * back) + ry * lateral;
  const l = Math.hypot(nx, ny);
  out.x = (nx / l) * speed;
  out.y = (ny / l) * speed;
  return out;
}

// Track how long an agent has been held up: wanted to move, barely could.
export function updateJam(self, prefSpeed, vx, vy, dt) {
  const v = Math.hypot(vx, vy);
  if (prefSpeed > 0.3 && v < 0.25 * prefSpeed) self.jam = (self.jam || 0) + dt;
  else self.jam = Math.max(0, (self.jam || 0) - dt * 2);
}

// Collision-free velocity close to (prefVx, prefVy).
// Neighbor fields: x, y, vx, vy, r, still (standing), yields (steers for us too).
export function avoidVelocity(solver, nav, self, prefVx, prefVy, neighbors, dt) {
  solver.begin();
  for (const o of nav.obstaclesNear(self.x, self.y)) {
    obstacleDistance(o, self.x, self.y, hit);
    if (hit.d > 1.8) continue;
    let c = -(hit.d - self.r - 0.02) / MOVE.tauObst;
    if (c > 0.6) c = 0.6;
    solver.addHalfPlane(hit.nx, hit.ny, c);
  }
  const ps = MOVE.personalSpace;
  for (const n of neighbors) {
    const still = !!n.still;
    const share = still ? 1 : n.yields === false ? 1 : 0.5;
    solver.addAgent(
      self.x, self.y, self.vx, self.vy, self.r + ps,
      n.x, n.y, still ? 0 : n.vx, still ? 0 : n.vy, n.r + ps,
      still ? MOVE.tauStill : MOVE.tau, dt, share, self.r + n.r,
    );
  }
  return solver.solve(prefVx, prefVy, self.maxSpeed);
}

// Apply a new velocity with an acceleration limit and integrate the position.
export function integrate(self, vx, vy, dt) {
  const ax = vx - self.vx;
  const ay = vy - self.vy;
  const a = Math.hypot(ax, ay);
  const maxDv = MOVE.maxAccel * dt;
  if (a > maxDv) {
    self.vx += (ax / a) * maxDv;
    self.vy += (ay / a) * maxDv;
  } else {
    self.vx = vx;
    self.vy = vy;
  }
  self.x += self.vx * dt;
  self.y += self.vy * dt;
}

// Hard non-overlap between bodies. `invMass` 0 means the body does not move.
export function separateBodies(bodies, iterations = 2) {
  const gap = MOVE.contactGap;
  const n = bodies.length;
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) {
      const a = bodies[i];
      for (let j = i + 1; j < n; j++) {
        const b = bodies[j];
        const wa = a.invMass;
        const wb = b.invMass;
        if (wa + wb === 0) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.r + b.r + gap;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        let d = Math.sqrt(d2);
        let nx;
        let ny;
        if (d < 1e-6) {
          // Exactly on top of each other: split along a stable direction.
          const ang = ((a.id * 92821 + b.id * 68917) % 628) / 100;
          nx = Math.cos(ang);
          ny = Math.sin(ang);
          d = 0;
        } else {
          nx = dx / d;
          ny = dy / d;
        }
        const push = (min - d) / (wa + wb);
        a.x -= nx * push * wa;
        a.y -= ny * push * wa;
        b.x += nx * push * wb;
        b.y += ny * push * wb;
      }
    }
  }
}

// Push one body out of walls and furniture (and keep it inside the world).
export function resolveStatic(nav, self) {
  for (let pass = 0; pass < 2; pass++) {
    for (const o of nav.obstaclesNear(self.x, self.y)) {
      obstacleDistance(o, self.x, self.y, hit);
      const pen = self.r - hit.d;
      if (pen > 0) {
        self.x += hit.nx * pen;
        self.y += hit.ny * pen;
        const vn = self.vx * hit.nx + self.vy * hit.ny;
        if (vn < 0) {
          self.vx -= vn * hit.nx;
          self.vy -= vn * hit.ny;
        }
      }
    }
  }
  const r = self.r;
  if (self.x < r) self.x = r;
  if (self.x > WORLD.w - r) self.x = WORLD.w - r;
  if (self.y < r) self.y = r;
  if (self.y > WORLD.h - r) self.y = WORLD.h - r;
}

// Rotate `heading` toward `target` at a limited turn rate (rad/s).
export function turnToward(heading, target, rate, dt) {
  let d = target - heading;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const step = rate * dt;
  if (Math.abs(d) <= step) return target;
  return heading + Math.sign(d) * step;
}

// Path follower: returns preferred velocity toward the current waypoint, with
// a smooth slow-down at the final point. Mutates `self.pathIdx`.
export function followPath(nav, self, path, speed, out) {
  if (!path || path.length === 0) { out.x = 0; out.y = 0; out.dist = 0; out.last = true; return out; }
  let idx = self.pathIdx;
  // Advance past reached waypoints; also skip ahead when the next one is visible.
  while (idx < path.length - 1) {
    const p = path[idx];
    const d = Math.hypot(p.x - self.x, p.y - self.y);
    if (d < 0.55) { idx++; continue; }
    break;
  }
  if (idx < path.length - 1 && self.losCheckAt !== undefined && self.losCheckAt <= 0) {
    const n = path[idx + 1];
    if (nav.lineOfSight(self.x, self.y, n.x, n.y)) idx++;
    self.losCheckAt = 0.35;
  }
  self.pathIdx = idx;
  const wp = path[idx];
  const dx = wp.x - self.x;
  const dy = wp.y - self.y;
  const d = Math.hypot(dx, dy);
  const last = idx === path.length - 1;
  let s = speed;
  if (last) s = Math.min(speed, Math.max(0.18, d * 1.5));
  if (d < 1e-6) { out.x = 0; out.y = 0; } else { out.x = (dx / d) * s; out.y = (dy / d) * s; }
  out.dist = d;
  out.last = last;
  return out;
}
