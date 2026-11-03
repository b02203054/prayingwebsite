// One room ("廟埕") of the temple: simulated visitors walk the loop, real
// visitors are kinematic bodies whose positions come from their browsers.
// The same class runs on the server and, in offline mode, inside the page.
import { NavGrid } from './nav.js';
import { OrcaSolver } from './orca.js';
import { gatherNeighbors, avoidVelocity, integrate, separateBodies, resolveStatic, turnToward, followPath, steerAround, updateJam } from './mover.js';
import { StationManager } from './stations.js';
import { STATIONS, STATION_BY_ID, viaPoints, SPAWN, EXIT, PLAYER_SPAWN, AGENT_RADIUS, GATES, WORLD } from './world.js';
import { createRng, hashString } from './rng.js';
import {
  ANIM, NPC_SCRIPTS, actionDef, npcRoute, randomLook, throwJiao,
  FORTUNE_COUNT, INCENSE_PER_VISIT, BURNERS, encodeLook, EMOTES,
} from './ritual.js';

let navSingleton = null;
export function sharedNav() {
  if (!navSingleton) navSingleton = new NavGrid();
  return navSingleton;
}

export const DT = 1 / 30;
export const FLAG = { still: 1, incense: 2, paper: 4, amulet: 8, player: 16 };
export const LAMP_SLOTS = 240;
export const JOIN_RADIUS = 2.2;
const BURNER_LIFE = 300;
const MAX_PLAYERS = 40;

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

export class Room {
  constructor({ id = 'court-1', seed, npcTarget = 18, warmup = 0 } = {}) {
    this.id = id;
    this.rng = createRng(seed ?? hashString(id));
    this.nav = sharedNav();
    this.solver = new OrcaSolver(64);
    this.stations = new StationManager(STATIONS);
    this.agents = new Map();
    this.list = [];
    this.nextId = 1;
    this.time = 0;
    this.npcTarget = npcTarget;
    this.spawnT = 0;
    this.events = [];
    this.added = [];
    this.removed = [];
    this.onPlayerAssign = null;
    this.burners = Object.fromEntries(BURNERS.map((b) => [b, []]));
    this.lamps = [];
    this.stats = { spawned: 0, completed: 0, gaveUp: 0, unstuck: 0, despawnedStuck: 0 };
    this._pref = { x: 0, y: 0, dist: 0, last: true };
    this._nbrs = [];
    if (warmup > 0) this.warmup(warmup);
  }

  // ------------------------------------------------------------------ agents

  makeAgent(kind, x, y, look) {
    const rng = this.rng;
    const child = look.age === 0;
    const elder = look.age === 2;
    const pref = child ? rng.range(1.0, 1.2) : elder ? rng.range(0.72, 0.9) : rng.range(0.98, 1.25);
    const a = {
      id: this.nextId++, kind, name: '', look,
      x, y, vx: 0, vy: 0, heading: -Math.PI / 2,
      r: child ? 0.21 : AGENT_RADIUS,
      prefSpeed: pref, maxSpeed: pref * 1.35,
      invMass: kind === 'player' ? 0 : 1, still: false, yields: kind !== 'player',
      anim: ANIM.idle, actionAnim: -1, actionUntil: 0,
      holding: { incense: 0, paper: false, amulet: false },
      route: null, routeIdx: -1, phase: 'idle', stationId: null, assign: null,
      path: null, pathIdx: 0, goal: null, goalFace: null, arrive: 0.15, losCheckAt: 0,
      slotStage: '', script: null, scriptIdx: 0, scriptT: 0, pending: null,
      retargetT: 0, waitT: 0, phaseT: 0, via: null,
      progX: x, progY: y, progT: 0, stuckT: 0,
      // players
      lastSeen: this.time, assignedAt: 0, atSlot: false, lastActAt: 0, farT: 0, done: new Set(), gateY: y,
    };
    this.agents.set(a.id, a);
    this.list.push(a);
    this.added.push(a.id);
    return a;
  }

  removeAgent(id) {
    const a = this.agents.get(id);
    if (!a) return;
    if (a.stationId) this.applyChanges(this.stations.leave(a.stationId, a.id));
    this.agents.delete(id);
    const i = this.list.indexOf(a);
    if (i >= 0) this.list.splice(i, 1);
    this.removed.push(id);
  }

  npcCount() {
    let n = 0;
    for (const a of this.list) if (a.kind === 'npc') n++;
    return n;
  }

  playerCount() {
    return this.list.length - this.npcCount();
  }

  // ------------------------------------------------------------- simulation

  warmup(seconds) {
    const steps = Math.round(seconds / DT);
    for (let i = 0; i < steps; i++) this.step(DT, true);
    this.events.length = 0;
  }

  step(dt = DT, warming = false) {
    this.time += dt;
    this.spawnT -= dt;
    const target = Math.max(0, this.npcTarget - Math.max(0, this.playerCount() - 2));
    if (this.spawnT <= 0 && this.npcCount() < target) {
      const q = this.stations.get('desk').queue.length + this.stations.get('tiangong').queue.length;
      if (q < 9 && this.trySpawn()) this.spawnT = warming ? this.rng.range(0.5, 1.1) : this.rng.range(1.2, 3.2);
      else this.spawnT = 0.5;
    }
    for (const a of this.list) if (a.kind === 'npc') this.think(a, dt);
    this.move(dt);
    for (const a of this.list) if (a.kind === 'npc') this.afterMove(a, dt);
    this.tickPlayers(dt);
    if (Math.floor(this.time) !== Math.floor(this.time - dt)) this.decay();
  }

  trySpawn() {
    const x = this.rng.range(SPAWN.x0, SPAWN.x1);
    const y = SPAWN.y;
    for (const a of this.list) if (dist(a.x, a.y, x, y) < 1.1) return false;
    const a = this.makeAgent('npc', x, y, randomLook(this.rng));
    a.route = npcRoute(this.rng);
    this.stats.spawned++;
    this.nextStation(a);
    return true;
  }

  goTo(a, x, y, arrive = 0.15, face = null) {
    a.goal = { x, y };
    a.goalFace = face;
    a.arrive = arrive;
    a.pathIdx = 0;
    a.still = false;
    a.losCheckAt = 0;
    if (this.nav.lineOfSight(a.x, a.y, x, y, 1.6)) a.path = [{ x, y }];
    else a.path = this.nav.findPath(a.x, a.y, x, y) ?? [{ x, y }];
    a.progX = a.x;
    a.progY = a.y;
    a.progT = 0;
  }

  nextStation(a) {
    const prev = a.route[a.routeIdx];
    a.routeIdx++;
    const next = a.route[a.routeIdx];
    a.assign = null;
    a.script = null;
    a.slotStage = '';
    a.phaseT = 0;
    a.via = viaPoints(prev, next).slice();
    a.goal = null;
    if (next === 'exit' || next === undefined) {
      a.stationId = null;
      a.phase = 'leaving';
    } else {
      a.stationId = next;
      a.phase = 'travel';
    }
  }

  think(a, dt) {
    a.phaseT += dt;
    if (a.pending && this.time >= a.pending.at) {
      this.applyEffect(a, a.pending.effect);
      a.pending = null;
    }
    switch (a.phase) {
      case 'travel': {
        if (a.via && a.via.length) {
          const v = a.via[0];
          if (!a.goal || a.goal.x !== v.x || a.goal.y !== v.y) this.goTo(a, v.x, v.y, 1.0);
          if (dist(a.x, a.y, v.x, v.y) < 1.1) { a.via.shift(); a.goal = null; }
          break;
        }
        const jp = this.stations.joinPoint(a.stationId);
        a.retargetT -= dt;
        if (!a.goal || (a.retargetT <= 0 && dist(jp.x, jp.y, a.goal.x, a.goal.y) > 0.4)) {
          this.goTo(a, jp.x, jp.y, 0.3);
          a.retargetT = 0.5;
        }
        if (dist(a.x, a.y, jp.x, jp.y) < JOIN_RADIUS) this.npcJoin(a);
        break;
      }
      case 'wait':
        a.waitT -= dt;
        if (a.waitT <= 0) {
          a.waitT = 1;
          if (a.phaseT > 18) this.nextStation(a);
          else this.npcJoin(a);
        }
        break;
      case 'atSlot':
        this.runScript(a, dt);
        break;
      case 'leaving':
        if (a.via && a.via.length) {
          const v = a.via[0];
          if (!a.goal || a.goal.x !== v.x) this.goTo(a, v.x, v.y, 1.0);
          if (dist(a.x, a.y, v.x, v.y) < 1.1) { a.via.shift(); a.goal = null; }
        } else if (!a.goal) {
          this.goTo(a, EXIT.x + this.rng.range(-1.2, 1.2), EXIT.y, 0.7);
        }
        break;
      default:
        break;
    }
  }

  npcJoin(a) {
    const res = this.stations.join(a.stationId, a.id);
    if (res.type === 'full') {
      if (a.phase !== 'wait') {
        a.phase = 'wait';
        a.phaseT = 0;
        a.waitT = 1;
        a.goal = null;
        a.still = true;
      }
      return;
    }
    this.assignTo(a, res);
  }

  // Route a station assignment to an NPC brain or to a player's browser.
  assignTo(a, res) {
    a.assign = res;
    const st = STATION_BY_ID[a.stationId];
    if (a.kind === 'player') {
      a.assignedAt = this.time;
      a.atSlot = false;
      a.farT = 0;
      this.notifyPlayer(a);
      return;
    }
    if (res.type === 'queue') {
      a.phase = 'queue';
      const spot = st.queue[res.index];
      this.goTo(a, spot.x, spot.y, 0.12, spot.face);
    } else if (res.type === 'slot') {
      a.phase = 'toSlot';
      a.slotStage = 'approach';
      const slot = st.slots[res.index];
      this.goTo(a, slot.ax, slot.ay, 0.3);
    }
  }

  applyChanges(changes) {
    for (const [agentId, res] of changes) {
      const ag = this.agents.get(agentId);
      if (ag) this.assignTo(ag, res);
    }
  }

  onArrive(a) {
    switch (a.phase) {
      case 'queue':
        a.still = true;
        break;
      case 'toSlot': {
        const slot = STATION_BY_ID[a.stationId].slots[a.assign.index];
        if (a.slotStage === 'approach') {
          a.slotStage = 'slot';
          this.goTo(a, slot.x, slot.y, 0.1, slot.face);
          a.path = [{ x: slot.x, y: slot.y }];
        } else {
          a.phase = 'atSlot';
          a.still = true;
          a.goalFace = slot.face;
          a.script = null;
        }
        break;
      }
      case 'exitSlot':
        this.nextStation(a);
        break;
      case 'leaving':
        if (!a.via || a.via.length === 0) {
          this.stats.completed++;
          this.removeAgent(a.id);
        }
        break;
      default:
        break;
    }
  }

  runScript(a, dt) {
    const st = STATION_BY_ID[a.stationId];
    if (!a.script) {
      let key = st.kind;
      if (key === 'altar' && this.rng.chance(0.3)) key = 'altarKneel';
      a.script = NPC_SCRIPTS[key].map(([anim, lo, hi, effect]) => [anim, this.rng.range(lo, hi), effect]);
      a.scriptIdx = 0;
      a.scriptT = this.rng.range(0.2, 0.6);
      a.anim = ANIM.idle;
      a.actionAnim = -1;
    }
    a.scriptT -= dt;
    if (a.scriptT > 0) return;
    if (a.scriptIdx >= a.script.length) {
      this.npcFinish(a);
      return;
    }
    const [anim, dur, effect] = a.script[a.scriptIdx++];
    if (effect === 'insert' && a.holding.incense <= 0) {
      a.scriptT = 0;
      return;
    }
    a.actionAnim = ANIM[anim];
    a.actionUntil = this.time + dur;
    a.scriptT = dur;
    if (effect) a.pending = { effect, at: this.time + dur * 0.6 };
  }

  npcFinish(a) {
    const slot = STATION_BY_ID[a.stationId].slots[a.assign.index];
    a.actionAnim = -1;
    this.applyChanges(this.stations.leave(a.stationId, a.id));
    a.phase = 'exitSlot';
    a.assign = null;
    this.goTo(a, slot.ex, slot.ey, 0.3);
  }

  applyEffect(a, effect) {
    const sid = a.stationId;
    switch (effect) {
      case 'incense':
        a.holding.incense = INCENSE_PER_VISIT;
        a.holding.paper = true;
        break;
      case 'insert':
        if (a.holding.incense > 0 && this.burners[sid]) {
          a.holding.incense--;
          this.burners[sid].push(this.time);
          this.emit(a, 'insert', sid);
        }
        break;
      case 'lamp': {
        const idx = this.lightLamp();
        if (idx >= 0) this.emit(a, 'lamp', idx);
        break;
      }
      case 'jiao':
        this.emit(a, 'jiao', throwJiao(this.rng));
        break;
      case 'lot':
        this.emit(a, 'lot', this.rng.int(1, FORTUNE_COUNT));
        break;
      case 'burn':
        if (a.holding.paper) {
          a.holding.paper = false;
          this.emit(a, 'burn', 0);
        }
        break;
      default:
        break;
    }
  }

  lightLamp() {
    if (this.lamps.length >= LAMP_SLOTS) this.lamps.shift();
    // Pick a free lamp position, spreading lamps over both walls.
    const used = new Set(this.lamps.map((l) => l.i));
    for (let tries = 0; tries < 40; tries++) {
      const i = this.rng.int(0, LAMP_SLOTS - 1);
      if (!used.has(i)) {
        this.lamps.push({ i, t: this.time });
        return i;
      }
    }
    return -1;
  }

  emit(a, type, value) {
    this.events.push({ id: a.id, type, value });
  }

  // Compute velocities for everyone first, then integrate, then resolve contacts.
  move(dt) {
    const pref = this._pref;
    const nbrs = this._nbrs;
    for (const a of this.list) {
      if (a.kind !== 'npc') continue;
      if (a.still || !a.goal) {
        a._nvx = 0;
        a._nvy = 0;
        continue;
      }
      a.losCheckAt -= dt;
      followPath(this.nav, a, a.path, a.prefSpeed, pref);
      const wanted = Math.hypot(pref.x, pref.y);
      gatherNeighbors(a, this.list, nbrs);
      steerAround(a, pref.x, pref.y, nbrs, pref.last ? pref.dist : Infinity, pref);
      const v = avoidVelocity(this.solver, this.nav, a, pref.x, pref.y, nbrs, dt);
      updateJam(a, wanted, v.x, v.y, dt);
      a._nvx = v.x;
      a._nvy = v.y;
    }
    for (const a of this.list) {
      if (a.kind !== 'npc') continue;
      if (a.still || !a.goal) {
        a.vx *= 0.6;
        a.vy *= 0.6;
        if (a.still && a.goal) {
          // Settle gently onto the standing spot.
          const k = Math.min(1, dt * 5);
          a.x += (a.goal.x - a.x) * k;
          a.y += (a.goal.y - a.y) * k;
        }
        continue;
      }
      integrate(a, a._nvx, a._nvy, dt);
    }
    for (const a of this.list) {
      if (a.kind === 'npc') a.invMass = a.still ? 0.12 : 1;
    }
    separateBodies(this.list, 2);
    for (const a of this.list) if (a.kind === 'npc') resolveStatic(this.nav, a);
  }

  afterMove(a, dt) {
    const speed = Math.hypot(a.vx, a.vy);
    if (speed > 0.12) a.heading = turnToward(a.heading, Math.atan2(a.vy, a.vx), 7, dt);
    else if (a.goalFace !== null && (a.still || a.phase === 'atSlot')) a.heading = turnToward(a.heading, a.goalFace, 5, dt);
    if (a.actionAnim >= 0 && this.time < a.actionUntil) a.anim = a.actionAnim;
    else {
      a.actionAnim = -1;
      a.anim = speed > 0.15 ? ANIM.walk : ANIM.idle;
    }
    if (a.goal && !a.still) {
      if (a.path && a.pathIdx === a.path.length - 1 && dist(a.x, a.y, a.goal.x, a.goal.y) < a.arrive) {
        this.onArrive(a);
        return;
      }
      this.checkStuck(a, dt);
    }
  }

  checkStuck(a, dt) {
    a.progT += dt;
    if (a.progT < 1.5) return;
    const moved = dist(a.x, a.y, a.progX, a.progY);
    a.progX = a.x;
    a.progY = a.y;
    const period = a.progT;
    a.progT = 0;
    if (moved > 0.3) {
      a.stuckT = 0;
      return;
    }
    a.stuckT += period;
    if (a.phase === 'queue' && a.stuckT >= 4) {
      // Someone is standing on our spot: wait where we are instead of pushing.
      a.still = true;
      return;
    }
    if (a.stuckT >= 3 && a.stuckT < 9) {
      this.stats.unstuck++;
      const g = a.goal;
      if (g) {
        const keepFace = a.goalFace;
        const keepArrive = a.arrive;
        a.path = this.nav.findPath(a.x, a.y, g.x, g.y) ?? [{ x: g.x, y: g.y }];
        if (a.stuckT >= 6) {
          // Side-step to break a symmetric standoff.
          const ang = Math.atan2(g.y - a.y, g.x - a.x) + (this.rng.chance(0.5) ? 1.3 : -1.3);
          const sx = a.x + Math.cos(ang) * 0.8;
          const sy = a.y + Math.sin(ang) * 0.8;
          if (!this.nav.isBlockedAt(sx, sy)) a.path.unshift({ x: sx, y: sy });
        }
        a.pathIdx = 0;
        a.goalFace = keepFace;
        a.arrive = keepArrive;
      }
    } else if (a.stuckT >= 14) {
      if (a.phase === 'leaving' || a.stuckT >= 30) {
        this.stats.despawnedStuck++;
        this.removeAgent(a.id);
      } else if (a.phase === 'travel' || a.phase === 'exitSlot' || a.phase === 'toSlot') {
        this.stats.gaveUp++;
        if (a.stationId) this.applyChanges(this.stations.leave(a.stationId, a.id));
        a.stuckT = 0;
        this.nextStation(a);
      }
    }
  }

  decay() {
    for (const b of BURNERS) {
      const arr = this.burners[b];
      while (arr.length && this.time - arr[0] > BURNER_LIFE) arr.shift();
      if (arr.length > 60) arr.splice(0, arr.length - 60);
    }
  }

  // ---------------------------------------------------------------- players

  addPlayer({ name = '', look } = {}) {
    if (this.playerCount() >= MAX_PLAYERS) return null;
    const p = this.freeSpotNear(PLAYER_SPAWN.x, PLAYER_SPAWN.y);
    const a = this.makeAgent('player', p.x, p.y, look ?? randomLook(this.rng, 1));
    a.name = String(name).slice(0, 12);
    a.heading = PLAYER_SPAWN.face;
    a.still = true;
    a.lastSeen = this.time;
    return a;
  }

  freeSpotNear(x, y) {
    for (let ring = 0; ring < 8; ring++) {
      for (let k = 0; k < Math.max(1, ring * 6); k++) {
        const ang = (k / Math.max(1, ring * 6)) * Math.PI * 2;
        const px = x + Math.cos(ang) * ring * 0.7;
        const py = y + Math.sin(ang) * ring * 0.7;
        if (this.nav.isBlockedAt(px, py)) continue;
        let ok = true;
        for (const o of this.list) if (dist(o.x, o.y, px, py) < 0.75) { ok = false; break; }
        if (ok) return { x: px, y: py };
      }
    }
    return { x, y };
  }

  // Move a visitor without the speed check (respawn at the entrance, tests).
  teleportPlayer(id, x, y) {
    const a = this.agents.get(id);
    if (!a || a.kind !== 'player') return null;
    const p = this.nav.nearestFreePoint(x, y);
    a.x = p.x;
    a.y = p.y;
    a.vx = 0;
    a.vy = 0;
    a.lastSeen = this.time;
    return p;
  }

  // Kinematic update from the visitor's browser. Returns a correction or null.
  updatePlayer(id, s) {
    const a = this.agents.get(id);
    if (!a || a.kind !== 'player') return null;
    const num = (v, lo, hi, d) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
    let x = num(s.x, 0, WORLD.w, a.x);
    let y = num(s.y, 0, WORLD.h, a.y);
    const elapsed = Math.max(0.05, this.time - a.lastSeen);
    let correction = null;
    if (dist(x, y, a.x, a.y) > 2 + elapsed * 4) {
      x = a.x;
      y = a.y;
      correction = { x, y };
    }
    const prevY = a.y;
    a.x = x;
    a.y = y;
    a.vx = num(s.vx, -3, 3, 0);
    a.vy = num(s.vy, -3, 3, 0);
    a.heading = num(s.h, -10, 10, a.heading);
    const anim = Math.floor(num(s.a, 0, ANIM.wave, 0));
    a.anim = anim;
    a.still = Math.hypot(a.vx, a.vy) < 0.05;
    a.lastSeen = this.time;
    if (this.nav.clearanceAt(a.x, a.y) < a.r - 0.12) {
      resolveStatic(this.nav, a);
      correction = { x: a.x, y: a.y };
    }
    this.detectGate(a, prevY);
    return correction;
  }

  // Report which gate a visitor walked through, and in which direction.
  detectGate(a, prevY) {
    const mid = (GATES.dragon.y0 + GATES.dragon.y1) / 2;
    if ((prevY - mid) * (a.y - mid) >= 0) return;
    const north = a.y < prevY;
    for (const key of ['dragon', 'tiger']) {
      const g = GATES[key];
      if (a.x >= g.x0 - 0.3 && a.x <= g.x1 + 0.3) this.emit(a, 'gate', `${key}:${north ? 'in' : 'out'}`);
    }
  }

  notifyPlayer(a) {
    if (!this.onPlayerAssign) return;
    const res = a.assign;
    const st = a.stationId ? STATION_BY_ID[a.stationId] : null;
    let payload = { station: a.stationId, type: res ? res.type : 'none', index: res ? res.index ?? -1 : -1 };
    if (res && st && res.type === 'queue') {
      const spot = st.queue[res.index];
      payload = { ...payload, x: spot.x, y: spot.y, face: spot.face, ahead: res.index };
    } else if (res && st && res.type === 'slot') {
      const slot = st.slots[res.index];
      payload = { ...payload, x: slot.x, y: slot.y, face: slot.face, ax: slot.ax, ay: slot.ay, ex: slot.ex, ey: slot.ey };
    } else if (res && res.type === 'exit') {
      payload = { ...payload, x: res.x, y: res.y };
    }
    if (res && res.reason) payload.reason = res.reason;
    this.onPlayerAssign(a.id, payload);
  }

  playerJoin(id, stationId) {
    const a = this.agents.get(id);
    const st = STATION_BY_ID[stationId];
    if (!a || a.kind !== 'player' || !st) return { type: 'invalid' };
    if (a.stationId === stationId && a.assign && (a.assign.type === 'queue' || a.assign.type === 'slot')) {
      this.notifyPlayer(a);
      return a.assign;
    }
    this.playerLeave(id);
    const jp = this.stations.joinPoint(stationId);
    if (dist(a.x, a.y, jp.x, jp.y) > JOIN_RADIUS * 3) return { type: 'far', jx: jp.x, jy: jp.y };
    a.stationId = stationId;
    const res = this.stations.join(stationId, id);
    if (res.type === 'full') {
      a.stationId = null;
      return res;
    }
    this.assignTo(a, res);
    return res;
  }

  playerLeave(id) {
    const a = this.agents.get(id);
    if (!a || !a.stationId) return;
    const sid = a.stationId;
    a.stationId = null;
    a.assign = null;
    a.atSlot = false;
    this.applyChanges(this.stations.leave(sid, id));
  }

  playerArrive(id) {
    const a = this.agents.get(id);
    if (!a || !a.assign || a.assign.type !== 'slot') return false;
    const slot = STATION_BY_ID[a.stationId].slots[a.assign.index];
    if (dist(a.x, a.y, slot.x, slot.y) > 0.9) return false;
    a.atSlot = true;
    a.lastActAt = this.time;
    return true;
  }

  // Perform an action at the current cushion. Returns { ok, ... } for the browser.
  playerAct(id, actionId) {
    const a = this.agents.get(id);
    if (!a || !a.assign || a.assign.type !== 'slot') return { ok: false, reason: 'notAtSlot' };
    const st = STATION_BY_ID[a.stationId];
    const def = actionDef(st.kind, actionId);
    if (!def) return { ok: false, reason: 'unknownAction' };
    if (this.time < a.actionUntil - 0.05) return { ok: false, reason: 'busy' };
    if (def.needs === 'incense' && a.holding.incense <= 0) return { ok: false, reason: 'noIncense' };
    if (def.needs === 'paper' && !a.holding.paper) return { ok: false, reason: 'noPaper' };
    if (def.needs === 'amulet' && !a.holding.amulet) return { ok: false, reason: 'noAmulet' };
    a.atSlot = true;
    a.lastActAt = this.time;
    a.actionAnim = ANIM[def.anim];
    a.actionUntil = this.time + def.dur;
    a.done.add(a.stationId);
    const out = { ok: true, action: actionId, dur: def.dur };
    switch (actionId) {
      case 'incense':
        a.holding.incense = INCENSE_PER_VISIT;
        a.holding.paper = true;
        break;
      case 'amulet':
        a.holding.amulet = true;
        break;
      case 'insert':
        if (this.burners[a.stationId]) {
          a.holding.incense--;
          this.burners[a.stationId].push(this.time);
          this.emit(a, 'insert', a.stationId);
        }
        break;
      case 'lamp': {
        out.lamp = this.lightLamp();
        if (out.lamp >= 0) this.emit(a, 'lamp', out.lamp);
        break;
      }
      case 'throw':
        out.jiao = throwJiao(this.rng);
        this.emit(a, 'jiao', out.jiao);
        break;
      case 'draw':
        out.lot = this.rng.int(1, FORTUNE_COUNT);
        this.emit(a, 'lot', out.lot);
        break;
      case 'burn':
        a.holding.paper = false;
        this.emit(a, 'burn', 0);
        break;
      case 'amuletPass':
        this.emit(a, 'amulet', 0);
        break;
      default:
        break;
    }
    out.holding = { ...a.holding };
    return out;
  }

  playerFinish(id) {
    const a = this.agents.get(id);
    if (!a || !a.stationId || !a.assign) return null;
    const st = STATION_BY_ID[a.stationId];
    let exit = null;
    if (a.assign.type === 'slot') {
      const slot = st.slots[a.assign.index];
      exit = { x: slot.ex, y: slot.ey };
    }
    const sid = a.stationId;
    a.stationId = null;
    a.atSlot = false;
    a.actionAnim = -1;
    this.applyChanges(this.stations.leave(sid, id));
    a.assign = exit ? { type: 'exit', x: exit.x, y: exit.y } : null;
    a.stationId = sid;
    this.notifyPlayer(a);
    a.stationId = null;
    a.assign = null;
    return exit;
  }

  playerEmote(id, index) {
    const a = this.agents.get(id);
    const i = Math.floor(Number(index));
    if (!a || !(i >= 0 && i < EMOTES.length)) return;
    this.emit(a, 'emote', i);
  }

  tickPlayers(dt) {
    for (const a of this.list) {
      if (a.kind !== 'player') continue;
      if (a.actionAnim >= 0 && this.time >= a.actionUntil) a.actionAnim = -1;
      if (!a.assign) continue;
      if (a.assign.type === 'slot') {
        const idle = a.atSlot ? this.time - a.lastActAt > 150 : this.time - a.assignedAt > 75;
        if (idle) this.releasePlayer(a, 'afk');
      } else if (a.assign.type === 'queue') {
        const spot = STATION_BY_ID[a.stationId].queue[a.assign.index];
        a.farT = dist(a.x, a.y, spot.x, spot.y) > 9 ? a.farT + dt : 0;
        if (a.farT > 30) this.releasePlayer(a, 'afk');
      }
    }
  }

  releasePlayer(a, reason) {
    const sid = a.stationId;
    this.playerLeave(a.id);
    a.assign = { type: 'none', reason };
    a.stationId = sid;
    this.notifyPlayer(a);
    a.stationId = null;
    a.assign = null;
  }

  // -------------------------------------------------------------- snapshots

  flags(a) {
    let f = 0;
    if (a.still || Math.hypot(a.vx, a.vy) < 0.05) f |= FLAG.still;
    if (a.holding.incense > 0) f |= FLAG.incense;
    if (a.holding.paper) f |= FLAG.paper;
    if (a.holding.amulet) f |= FLAG.amulet;
    if (a.kind === 'player') f |= FLAG.player;
    return f;
  }

  // Compact per-tick state: [id, x, y, vx, vy, heading, anim, flags] (cm / cm·s⁻¹ / centi-rad).
  snapshot() {
    const out = new Array(this.list.length);
    for (let i = 0; i < this.list.length; i++) {
      const a = this.list[i];
      const anim = a.kind === 'player' && a.actionAnim >= 0 ? a.actionAnim : a.anim;
      out[i] = [
        a.id, Math.round(a.x * 100), Math.round(a.y * 100), Math.round(a.vx * 100), Math.round(a.vy * 100),
        Math.round(a.heading * 100), anim, this.flags(a),
      ];
    }
    return out;
  }

  metaOf(a) {
    return [a.id, a.kind === 'player' ? 1 : 0, a.name, encodeLook(a.look)];
  }

  allMeta() {
    return this.list.map((a) => this.metaOf(a));
  }

  drainMeta() {
    const add = this.added.filter((id) => this.agents.has(id)).map((id) => this.metaOf(this.agents.get(id)));
    const del = this.removed.slice();
    this.added.length = 0;
    this.removed.length = 0;
    return { add, del };
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  // Shared temple state: burner stick counts, lit lamps, queue/cushion occupancy.
  sharedState() {
    const st = {};
    for (const [id, s] of this.stations.map) {
      let mask = 0;
      s.owner.forEach((o, i) => { if (o !== 0) mask |= 1 << i; });
      st[id] = [s.queue.length, mask];
    }
    return {
      burners: Object.fromEntries(BURNERS.map((b) => [b, this.burners[b].length])),
      lamps: this.lamps.map((l) => l.i),
      online: this.playerCount(),
      stations: st,
    };
  }
}
