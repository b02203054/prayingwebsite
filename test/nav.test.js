import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NavGrid } from '../public/js/sim/nav.js';
import { STATIONS, GATES, EXIT, SPAWN, PLAYER_SPAWN, STATION_BY_ID } from '../public/js/sim/world.js';

const nav = new NavGrid();

// Does a polyline (start + waypoints) pass through a rectangle?
function passesThrough(start, path, rect) {
  const pts = [start, ...path];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.1);
    for (let k = 0; k <= n; k++) {
      const t = n === 0 ? 0 : k / n;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      if (x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1) return true;
    }
  }
  return false;
}

test('every slot, approach, exit and queue spot is walkable', () => {
  for (const s of STATIONS) {
    for (const sl of s.slots) {
      for (const [x, y] of [[sl.x, sl.y], [sl.ax, sl.ay], [sl.ex, sl.ey]]) {
        assert.ok(!nav.isBlockedAt(x, y), `${s.id} slot point (${x}, ${y}) is blocked`);
      }
    }
    for (const q of s.queue) assert.ok(!nav.isBlockedAt(q.x, q.y), `${s.id} queue spot (${q.x}, ${q.y}) is blocked`);
  }
  assert.ok(!nav.isBlockedAt(EXIT.x, EXIT.y));
  assert.ok(!nav.isBlockedAt((SPAWN.x0 + SPAWN.x1) / 2, SPAWN.y));
  assert.ok(!nav.isBlockedAt(PLAYER_SPAWN.x, PLAYER_SPAWN.y));
});

test('visitors enter through the Dragon Gate, not the Tiger Gate', () => {
  const start = { x: 22.6, y: 38.6 };
  const goal = STATION_BY_ID.tiangong.slots[0];
  const path = nav.findPath(start.x, start.y, goal.ax, goal.ay);
  assert.ok(path, 'path exists');
  assert.ok(passesThrough(start, path, GATES.dragon), 'uses the Dragon Gate');
  assert.ok(!passesThrough(start, path, GATES.tiger), 'does not use the Tiger Gate');
});

test('visitors leave through the Tiger Gate', () => {
  const slot = STATION_BY_ID.furnace.slots[1];
  const start = { x: slot.ex, y: slot.ey };
  const path = nav.findPath(start.x, start.y, EXIT.x, EXIT.y);
  assert.ok(path);
  assert.ok(passesThrough(start, path, GATES.tiger));
  assert.ok(!passesThrough(start, path, GATES.dragon));
});

test('the rear hall is entered from the east and left to the west', () => {
  const fromDragon = STATION_BY_ID.dragon.slots[2];
  const rearTail = STATION_BY_ID.rear.queue.at(-1);
  const p1 = nav.findPath(fromDragon.ex, fromDragon.ey, rearTail.x, rearTail.y);
  assert.ok(passesThrough({ x: fromDragon.ex, y: fromDragon.ey }, p1, { x0: 24.8, y0: 5.6, x1: 28, y1: 7.3 }), 'east opening');

  const fromRear = STATION_BY_ID.rear.slots[0];
  const tigerTail = STATION_BY_ID.tiger.queue.at(-1);
  const p2 = nav.findPath(fromRear.ex, fromRear.ey, tigerTail.x, tigerTail.y);
  assert.ok(passesThrough({ x: fromRear.ex, y: fromRear.ey }, p2, { x0: 4, y0: 5.6, x1: 7.2, y1: 7.3 }), 'west opening');
});

test('paths never touch blocked cells', () => {
  const pairs = [
    [{ x: 27, y: 40.3 }, { x: 5.4, y: 40.5 }],
    [{ x: 16, y: 36 }, { x: 16, y: 4.8 }],
    [{ x: 26, y: 25 }, { x: 6.6, y: 2.3 }],
  ];
  for (const [a, b] of pairs) {
    const path = nav.findPath(a.x, a.y, b.x, b.y);
    assert.ok(path, `path ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
    const pts = [a, ...path];
    for (let i = 1; i < pts.length; i++) {
      assert.ok(nav.lineOfSight(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, 99), `segment ${i} crosses a wall`);
    }
  }
});

test('walking the wrong way through a gate fails the line-of-sight check', () => {
  assert.equal(nav.lineOfSight(8.3, 31.5, 8.3, 26.5), false, 'north through the Tiger Gate');
  assert.equal(nav.lineOfSight(23.7, 26.5, 23.7, 31.5), false, 'south through the Dragon Gate');
  assert.equal(nav.lineOfSight(23.7, 31.5, 23.7, 26.5), true, 'north through the Dragon Gate');
});
