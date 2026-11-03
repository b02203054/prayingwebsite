import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OrcaSolver } from '../public/js/sim/orca.js';
import { avoidVelocity, integrate, gatherNeighbors, steerAround, updateJam } from '../public/js/sim/mover.js';

// A tiny open field: no static obstacles.
const openNav = { obstaclesNear: () => [] };

function run(agents, seconds, dt = 1 / 30) {
  const solver = new OrcaSolver();
  const nbrs = [];
  const pref = { x: 0, y: 0 };
  let minGap = Infinity;
  for (let t = 0; t < seconds; t += dt) {
    for (const a of agents) {
      const dx = a.gx - a.x;
      const dy = a.gy - a.y;
      const d = Math.hypot(dx, dy);
      const s = Math.min(a.speed, d * 2);
      const pvx = d > 1e-6 ? (dx / d) * s : 0;
      const pvy = d > 1e-6 ? (dy / d) * s : 0;
      if (a.still) { a.nvx = 0; a.nvy = 0; continue; }
      gatherNeighbors(a, agents, nbrs);
      steerAround(a, pvx, pvy, nbrs, d, pref);
      const v = avoidVelocity(solver, openNav, a, pref.x, pref.y, nbrs, dt);
      updateJam(a, Math.hypot(pvx, pvy), v.x, v.y, dt);
      a.nvx = v.x;
      a.nvy = v.y;
    }
    for (const a of agents) if (!a.still) integrate(a, a.nvx, a.nvy, dt);
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const g = Math.hypot(agents[i].x - agents[j].x, agents[i].y - agents[j].y) - agents[i].r - agents[j].r;
        minGap = Math.min(minGap, g);
      }
    }
  }
  return minGap;
}

const agent = (id, x, y, gx, gy, extra = {}) => ({ id, x, y, gx, gy, vx: 0, vy: 0, r: 0.26, speed: 1.2, maxSpeed: 1.6, ...extra });

test('two people walking head-on pass each other without touching', () => {
  const a = agent(1, 0, 0, 10, 0);
  const b = agent(2, 10, 0.01, 0, 0.01);
  const gap = run([a, b], 14);
  assert.ok(gap > 0, `min gap ${gap}`);
  assert.ok(Math.hypot(a.x - 10, a.y) < 0.3 && Math.hypot(b.x, b.y - 0.01) < 0.3, 'both arrive');
});

test('eight people swapping across a circle never overlap', () => {
  const agents = [];
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    agents.push(agent(i + 1, Math.cos(ang) * 5, Math.sin(ang) * 5, -Math.cos(ang) * 5, -Math.sin(ang) * 5));
  }
  const gap = run(agents, 25);
  assert.ok(gap > -0.005, `min gap ${gap}`);
  for (const a of agents) assert.ok(Math.hypot(a.x - a.gx, a.y - a.gy) < 0.5, `agent ${a.id} reached its goal`);
});

test('a walker steps around someone standing still', () => {
  const standing = agent(1, 5, 0, 5, 0, { still: true });
  const walker = agent(2, 0, 0, 10, 0);
  const gap = run([standing, walker], 14);
  assert.ok(gap > 0, `min gap ${gap}`);
  assert.ok(Math.hypot(walker.x - 10, walker.y) < 0.4, 'walker arrives');
  assert.equal(standing.x, 5);
});
