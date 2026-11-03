import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room, DT } from '../public/js/sim/room.js';
import { obstacleDistance } from '../public/js/sim/nav.js';
import { STATION_BY_ID } from '../public/js/sim/world.js';

const hit = { nx: 0, ny: 0, d: 0 };

function measure(room, seconds, onTick) {
  let minGap = Infinity;
  let worstPen = 0;
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    room.step(DT);
    const list = room.list;
    for (let a = 0; a < list.length; a++) {
      const A = list[a];
      assert.ok(Number.isFinite(A.x) && Number.isFinite(A.y), `agent ${A.id} has a finite position`);
      for (let b = a + 1; b < list.length; b++) {
        const B = list[b];
        minGap = Math.min(minGap, Math.hypot(A.x - B.x, A.y - B.y) - A.r - B.r);
      }
      for (const o of room.nav.obstaclesNear(A.x, A.y)) worstPen = Math.max(worstPen, A.r - obstacleDistance(o, A.x, A.y, hit).d);
    }
    if (onTick) onTick(i);
    const err = room.stations.validate();
    assert.equal(err, null, err ?? '');
  }
  return { minGap, worstPen };
}

test('a busy temple for ten minutes: no overlaps, no one in the walls, everyone flows', () => {
  const room = new Room({ id: 'test-dense', seed: 11, npcTarget: 32 });
  const { minGap, worstPen } = measure(room, 600);
  assert.ok(minGap > -0.01, `bodies overlapped by ${(-minGap * 100).toFixed(1)} cm`);
  assert.ok(worstPen < 0.02, `someone entered a wall by ${(worstPen * 100).toFixed(1)} cm`);
  assert.ok(room.stats.completed >= 60, `only ${room.stats.completed} visits completed`);
  assert.equal(room.stats.despawnedStuck, 0, 'nobody had to be removed for being stuck');
  assert.ok(room.stats.gaveUp <= 2, `${room.stats.gaveUp} visitors gave up a station`);
});

test('simulated visitors walk around real visitors standing in the way', () => {
  const room = new Room({ id: 'test-players', seed: 5, npcTarget: 24 });
  // Three people standing in awkward places: a gate, the courtyard axis, the rear lane.
  const spots = [{ x: 23.7, y: 28.6 }, { x: 15.2, y: 17.0 }, { x: 16.0, y: 5.0 }];
  const players = spots.map((p, i) => {
    const a = room.addPlayer({ name: `p${i}` });
    room.teleportPlayer(a.id, p.x, p.y);
    return a;
  });
  let minPlayerGap = Infinity;
  measure(room, 300, () => {
    for (const p of players) {
      room.updatePlayer(p.id, { x: p.x, y: p.y, vx: 0, vy: 0, h: 0, a: 0 });
      for (const a of room.list) {
        if (a === p) continue;
        minPlayerGap = Math.min(minPlayerGap, Math.hypot(a.x - p.x, a.y - p.y) - a.r - p.r);
      }
    }
  });
  assert.ok(minPlayerGap > -0.01, `an NPC overlapped a player by ${(-minPlayerGap * 100).toFixed(1)} cm`);
  assert.ok(room.stats.completed >= 15, `only ${room.stats.completed} visits completed`);
});

test('a player can take a cushion, act and step out', () => {
  const room = new Room({ id: 'test-flow', seed: 3, npcTarget: 0 });
  const assigns = [];
  room.onPlayerAssign = (id, payload) => assigns.push(payload);
  const p = room.addPlayer({ name: '測試' });
  const jp = room.stations.joinPoint('desk');
  room.teleportPlayer(p.id, jp.x, jp.y + 0.5);
  const res = room.playerJoin(p.id, 'desk');
  assert.equal(res.type, 'slot');
  const a1 = assigns.at(-1);
  assert.equal(a1.type, 'slot');
  assert.equal(a1.station, 'desk');
  // Walk onto the cushion.
  for (let t = 0; t < 10; t++) {
    room.updatePlayer(p.id, { x: a1.x, y: a1.y, vx: 0, vy: 0, h: 0, a: 0 });
    room.step(DT);
  }
  assert.ok(room.playerArrive(p.id));
  const act = room.playerAct(p.id, 'incense');
  assert.ok(act.ok);
  assert.equal(act.holding.incense, 5);
  assert.equal(room.playerAct(p.id, 'incense').reason, 'busy', 'cannot act twice at once');
  const exit = room.playerFinish(p.id);
  assert.ok(exit);
  assert.equal(assigns.at(-1).type, 'exit');
  assert.equal(room.stations.get('desk').owner.filter((o) => o !== 0).length, 0, 'cushion released');
});

test('a far-away player cannot reserve a cushion, and teleports are rejected', () => {
  const room = new Room({ id: 'test-far', seed: 2, npcTarget: 0 });
  const p = room.addPlayer({});
  assert.equal(room.playerJoin(p.id, 'main').type, 'far');
  const fix = room.updatePlayer(p.id, { x: 16, y: 9, vx: 0, vy: 0, h: 0, a: 0 });
  assert.ok(fix, 'jumping across the temple is corrected');
  assert.ok(Math.hypot(p.x - 16, p.y - 9) > 5);
});

test('random outcomes come from the room, and needs are enforced', () => {
  const room = new Room({ id: 'test-lots', seed: 9, npcTarget: 0 });
  const p = room.addPlayer({});
  const slot = STATION_BY_ID.lots.slots[0];
  room.teleportPlayer(p.id, slot.ax, slot.ay);
  assert.equal(room.playerJoin(p.id, 'lots').type, 'slot');
  const st = room.stations.get('lots');
  const idx = st.owner.indexOf(p.id);
  const mySlot = STATION_BY_ID.lots.slots[idx];
  room.updatePlayer(p.id, { x: mySlot.x, y: mySlot.y, vx: 0, vy: 0, h: 0, a: 0 });
  assert.equal(room.playerAct(p.id, 'burn').reason, 'unknownAction', 'furnace actions are not available here');
  const t = room.playerAct(p.id, 'throw');
  assert.ok(t.ok && [0, 1, 2].includes(t.jiao));
  for (let i = 0; i < 60; i++) room.step(DT);
  const d = room.playerAct(p.id, 'draw');
  assert.ok(d.ok && d.lot >= 1 && d.lot <= 30);
  const ev = room.drainEvents();
  assert.ok(ev.some((e) => e.type === 'jiao') && ev.some((e) => e.type === 'lot'));
});

test('an idle player does not block a cushion forever', () => {
  const room = new Room({ id: 'test-afk', seed: 4, npcTarget: 0 });
  const assigns = [];
  room.onPlayerAssign = (id, payload) => assigns.push(payload);
  const p = room.addPlayer({});
  const jp = room.stations.joinPoint('main');
  room.teleportPlayer(p.id, jp.x, jp.y);
  assert.equal(room.playerJoin(p.id, 'main').type, 'slot');
  for (let i = 0; i < Math.round(80 / DT); i++) room.step(DT);
  assert.equal(assigns.at(-1).type, 'none');
  assert.equal(assigns.at(-1).reason, 'afk');
  assert.equal(room.stations.get('main').owner.filter((o) => o !== 0).length, 0);
});

test('the same room seed produces the same crowd', () => {
  const a = new Room({ id: 'same', npcTarget: 12 });
  const b = new Room({ id: 'same', npcTarget: 12 });
  for (let i = 0; i < 900; i++) { a.step(DT); b.step(DT); }
  assert.deepEqual(a.snapshot(), b.snapshot());
});
