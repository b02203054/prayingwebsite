// The visitor's own character. It is simulated in the browser (instant
// response to the joystick), uses the same path finding and collision
// avoidance as the crowd, and follows cushion/queue assignments from the room.
import { OrcaSolver } from '../sim/orca.js';
import { avoidVelocity, integrate, resolveStatic, turnToward, followPath, steerAround, updateJam, MOVE } from '../sim/mover.js';
import { STATION_BY_ID, ROUTE, viaPoints, PLAYER_SPAWN, AGENT_RADIUS } from '../sim/world.js';
import { joinPointFor, slotOrder } from '../sim/stations.js';
import { ANIM, ACTIONS, actionDef } from '../sim/ritual.js';
import { JOIN_RADIUS } from '../sim/room.js';

const ORDERS = Object.fromEntries(Object.values(STATION_BY_ID).map((d) => [d.id, slotOrder(d)]));
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

export class AvatarController {
  constructor({ nav, session, look, onChange = () => {} }) {
    this.nav = nav;
    this.session = session;
    this.look = look;
    this.onChange = onChange;
    const you = session.you || { x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y, h: PLAYER_SPAWN.face };
    this.x = you.x;
    this.y = you.y;
    this.vx = 0;
    this.vy = 0;
    this.heading = you.h;
    this.r = AGENT_RADIUS;
    this.id = -1;
    this.prefSpeed = 1.35;
    this.maxSpeed = 1.8;
    this.solver = new OrcaSolver(64);
    this.nbrs = [];
    this.pref = { x: 0, y: 0, dist: 0, last: true };
    this.input = { x: 0, y: 0 };
    this.mode = 'idle';
    this.path = null;
    this.pathIdx = 0;
    this.goal = null;
    this.goalFace = null;
    this.arrive = 0.2;
    this.losCheckAt = 0;
    this.plan = null;
    this.lastStation = null;
    this.done = new Set();
    this.holding = { incense: 0, paper: false, amulet: false };
    this.actionAnim = -1;
    this.actionUntil = 0;
    this.busyUntil = 0;
    this.autoGuide = true;
    this.autoAlign = false;
    this.progT = 0;
    this.progX = this.x;
    this.progY = this.y;
    this.stuckT = 0;
    this.sendT = 0;
    this.now = 0;
    this.gateHint = '';
    session.onAssign = (p) => this.onAssign(p);
    session.onCorrection = (x, y) => { this.x = x; this.y = y; this.vx = 0; this.vy = 0; };
  }

  // ------------------------------------------------------------ commands

  setInput(x, y) {
    this.input.x = x;
    this.input.y = y;
    if (Math.hypot(x, y) > 0.15 && this.mode !== 'manual') {
      // Taking the joystick cancels walking on autopilot (and leaves a queue).
      if (this.plan) this.cancelPlan();
      this.mode = 'manual';
      this.path = null;
      this.goal = null;
      this.emit();
    }
  }

  goToPoint(x, y) {
    if (this.plan) this.cancelPlan();
    const p = this.nav.nearestFreePoint(x, y);
    this.mode = 'auto';
    this.setGoal(p.x, p.y, 0.25, null);
    this.autoAlign = false;
    this.emit();
    return p;
  }

  goToStation(id) {
    if (!STATION_BY_ID[id] && id !== 'exit') return;
    if (this.plan) this.cancelPlan();
    const via = viaPoints(this.lastStation, id).slice();
    this.plan = { station: id, phase: 'travel', via, joinSentAt: -10, retryAt: 0, ahead: 0 };
    this.mode = 'auto';
    this.autoAlign = true;
    this.goal = null;
    this.emit();
  }

  nextStation() {
    for (const id of ROUTE) if (!this.done.has(id)) return id;
    return null;
  }

  cancelPlan() {
    if (this.plan && this.plan.phase !== 'travel' && this.plan.phase !== 'toExit') this.session.leave();
    this.plan = null;
    this.actionAnim = -1;
    this.emit();
  }

  stop() {
    this.cancelPlan();
    this.mode = 'idle';
    this.path = null;
    this.goal = null;
    this.emit();
  }

  skip() {
    const id = this.plan ? this.plan.station : this.nextStation();
    if (!id) return;
    if (this.plan) this.cancelPlan();
    this.done.add(id);
    this.lastStation = id;
    const next = this.nextStation();
    if (next) this.goToStation(next);
    this.emit();
  }

  respawn() {
    this.cancelPlan();
    this.session.respawn();
    this.mode = 'idle';
    this.path = null;
    this.goal = null;
    this.done.clear();
    this.lastStation = null;
    this.holding = { incense: 0, paper: false, amulet: false };
    this.emit();
  }

  canAct(actionId) {
    if (!this.plan || this.plan.phase !== 'atSlot') return false;
    const def = actionDef(STATION_BY_ID[this.plan.station].kind, actionId);
    if (!def || this.now < this.busyUntil) return false;
    if (def.needs === 'incense' && this.holding.incense <= 0) return false;
    if (def.needs === 'paper' && !this.holding.paper) return false;
    if (def.needs === 'amulet' && !this.holding.amulet) return false;
    return true;
  }

  async act(actionId) {
    if (!this.canAct(actionId)) return { ok: false, reason: 'notReady' };
    const def = actionDef(STATION_BY_ID[this.plan.station].kind, actionId);
    this.busyUntil = this.now + def.dur;
    this.actionAnim = ANIM[def.anim];
    this.actionUntil = this.now + def.dur;
    this.emit();
    const res = await this.session.act(actionId);
    if (!res.ok) {
      this.actionAnim = -1;
      this.busyUntil = 0;
    } else {
      if (res.holding) this.holding = res.holding;
      if (this.plan) this.done.add(this.plan.station);
    }
    this.emit();
    return res;
  }

  finishStation() {
    if (!this.plan || this.plan.phase !== 'atSlot') return;
    this.done.add(this.plan.station);
    this.lastStation = this.plan.station;
    this.actionAnim = -1;
    this.session.finish();
    this.emit();
  }

  // --------------------------------------------------------- assignments

  onAssign(p) {
    const plan = this.plan;
    if (!plan || p.station !== plan.station) {
      if (p.type === 'exit' || p.type === 'none') return;
      return;
    }
    plan.assign = p.type;
    switch (p.type) {
      case 'queue':
        plan.phase = 'queue';
        plan.ahead = p.ahead ?? p.index;
        this.setGoal(p.x, p.y, 0.15, p.face);
        break;
      case 'slot':
        plan.phase = 'toApproach';
        plan.slot = { x: p.x, y: p.y, face: p.face, ax: p.ax, ay: p.ay };
        this.setGoal(p.ax, p.ay, 0.3, null);
        break;
      case 'exit':
        plan.phase = 'toExit';
        this.setGoal(p.x, p.y, 0.35, null);
        break;
      case 'full':
        plan.phase = 'wait';
        plan.retryAt = this.now + 1.5;
        this.goal = null;
        break;
      case 'far':
        plan.phase = 'travel';
        plan.joinSentAt = -10;
        if (Number.isFinite(p.jx)) plan.serverJoin = { x: p.jx, y: p.jy };
        break;
      case 'none':
        this.plan = null;
        this.mode = 'idle';
        this.onChange({ type: 'released', reason: p.reason });
        break;
      default:
        this.plan = null;
    }
    this.emit();
  }

  // ------------------------------------------------------------ movement

  setGoal(x, y, arrive, face) {
    this.goal = { x, y };
    this.goalFace = face;
    this.arrive = arrive;
    this.pathIdx = 0;
    this.losCheckAt = 0;
    this.path = this.nav.lineOfSight(this.x, this.y, x, y, 1.6) ? [{ x, y }] : this.nav.findPath(this.x, this.y, x, y) ?? [{ x, y }];
    this.progT = 0;
    this.stuckT = 0;
  }

  joinPoint(id) {
    const def = STATION_BY_ID[id];
    const s = this.session.shared?.stations?.[id];
    if (this.plan?.serverJoin) return this.plan.serverJoin;
    return joinPointFor(def, ORDERS[id], s ? s[0] : 0, s ? s[1] : 0);
  }

  think() {
    const plan = this.plan;
    if (!plan) return;
    switch (plan.phase) {
      case 'travel': {
        if (plan.station === 'exit') {
          if (!this.goal) this.setGoal(5.4, 40.0, 0.8, null);
          if (dist(this.x, this.y, 5.4, 40.0) < 1.0) {
            this.done.add('exit');
            this.lastStation = 'exit';
            this.plan = null;
            this.mode = 'idle';
            this.onChange({ type: 'complete' });
          }
          break;
        }
        if (plan.via.length) {
          const v = plan.via[0];
          if (!this.goal || this.goal.x !== v.x || this.goal.y !== v.y) this.setGoal(v.x, v.y, 1.0, null);
          if (dist(this.x, this.y, v.x, v.y) < 1.1) { plan.via.shift(); this.goal = null; }
          break;
        }
        const jp = this.joinPoint(plan.station);
        if (!this.goal || dist(jp.x, jp.y, this.goal.x, this.goal.y) > 0.5) this.setGoal(jp.x, jp.y, 0.3, null);
        if (dist(this.x, this.y, jp.x, jp.y) < JOIN_RADIUS && this.now - plan.joinSentAt > 1.5) {
          plan.joinSentAt = this.now;
          plan.serverJoin = null;
          this.session.join(plan.station);
        }
        break;
      }
      case 'wait':
        if (this.now >= plan.retryAt) {
          plan.retryAt = this.now + 1.5;
          this.session.join(plan.station);
        }
        break;
      default:
    }
  }

  onArrive() {
    const plan = this.plan;
    if (!plan) {
      this.mode = 'idle';
      this.goal = null;
      this.emit();
      return;
    }
    switch (plan.phase) {
      case 'toApproach':
        plan.phase = 'toSlot';
        this.setGoal(plan.slot.x, plan.slot.y, 0.12, plan.slot.face);
        this.path = [{ x: plan.slot.x, y: plan.slot.y }];
        break;
      case 'toSlot':
        plan.phase = 'atSlot';
        this.goal = { x: plan.slot.x, y: plan.slot.y };
        this.goalFace = plan.slot.face;
        this.session.arrive();
        this.autoAlign = false;
        this.emit();
        this.onChange({ type: 'atSlot', station: plan.station });
        break;
      case 'toExit': {
        const finished = plan.station;
        this.plan = null;
        this.mode = 'idle';
        this.goal = null;
        this.emit();
        this.onChange({ type: 'stationDone', station: finished });
        break;
      }
      default:
    }
  }

  update(dt, others, now) {
    this.now = now;
    this.think();
    const still = this.plan && (this.plan.phase === 'atSlot' || this.plan.phase === 'wait' || (this.plan.phase === 'queue' && this.goal && dist(this.x, this.y, this.goal.x, this.goal.y) < 0.15));
    let pvx = 0;
    let pvy = 0;
    if (this.mode === 'manual') {
      pvx = this.input.x * this.prefSpeed;
      pvy = this.input.y * this.prefSpeed;
      if (Math.hypot(this.input.x, this.input.y) < 0.05) this.mode = 'idle';
    } else if (this.goal && !still) {
      this.losCheckAt -= dt;
      followPath(this.nav, this, this.path, this.prefSpeed, this.pref);
      pvx = this.pref.x;
      pvy = this.pref.y;
    }
    // Others never react to our future here, so we take full responsibility.
    const nbrs = this.nbrs;
    nbrs.length = 0;
    for (const o of others) {
      const d2 = (o.x - this.x) ** 2 + (o.y - this.y) ** 2;
      if (d2 > MOVE.neighborDist * MOVE.neighborDist) continue;
      nbrs.push({ id: o.id, x: o.x, y: o.y, vx: o.vx, vy: o.vy, r: o.look?.age === 0 ? 0.21 : AGENT_RADIUS, still: o.still, yields: false, _d2: d2 });
    }
    nbrs.sort((a, b) => a._d2 - b._d2);
    if (nbrs.length > MOVE.maxNeighbors) nbrs.length = MOVE.maxNeighbors;
    let nvx = 0;
    let nvy = 0;
    const wanted = Math.hypot(pvx, pvy);
    if (wanted > 1e-3) {
      const goalDist = this.mode === 'manual' ? Infinity : this.pref.last ? this.pref.dist : Infinity;
      steerAround(this, pvx, pvy, nbrs, goalDist, this.pref);
      const v = avoidVelocity(this.solver, this.nav, this, this.pref.x, this.pref.y, nbrs, dt);
      updateJam(this, wanted, v.x, v.y, dt);
      nvx = v.x;
      nvy = v.y;
    }
    integrate(this, nvx, nvy, dt);
    if (still && this.goal) {
      const k = Math.min(1, dt * 6);
      this.x += (this.goal.x - this.x) * k;
      this.y += (this.goal.y - this.y) * k;
    }
    // Hard separation: we yield to everyone else on our screen.
    for (const o of nbrs) {
      const dx = this.x - o.x;
      const dy = this.y - o.y;
      const min = this.r + o.r + MOVE.contactGap;
      const d = Math.hypot(dx, dy);
      if (d < min && d > 1e-6) {
        this.x += (dx / d) * (min - d);
        this.y += (dy / d) * (min - d);
      }
    }
    resolveStatic(this.nav, this);
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > 0.12) this.heading = turnToward(this.heading, Math.atan2(this.vy, this.vx), 9, dt);
    else if (this.goalFace !== null && this.goalFace !== undefined && still) this.heading = turnToward(this.heading, this.goalFace, 6, dt);
    if (this.mode === 'auto' && this.goal && !still && this.path && this.pathIdx === this.path.length - 1 && dist(this.x, this.y, this.goal.x, this.goal.y) < this.arrive) {
      this.onArrive();
    }
    this.checkStuck(dt, still);
    if (this.actionAnim >= 0 && now >= this.actionUntil) {
      this.actionAnim = -1;
      this.emit();
    }
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = this.session.mode === 'online' ? 1 / 15 : 0;
      this.session.sendState({ x: this.x, y: this.y, vx: this.vx, vy: this.vy, h: this.heading, a: this.animCode() });
    }
  }

  checkStuck(dt, still) {
    if (this.mode !== 'auto' || !this.goal || still) { this.progT = 0; this.stuckT = 0; return; }
    this.progT += dt;
    if (this.progT < 1.5) return;
    const moved = dist(this.x, this.y, this.progX, this.progY);
    this.progX = this.x;
    this.progY = this.y;
    const period = this.progT;
    this.progT = 0;
    if (moved > 0.3) { this.stuckT = 0; return; }
    this.stuckT += period;
    if (this.stuckT >= 3) {
      const g = this.goal;
      this.path = this.nav.findPath(this.x, this.y, g.x, g.y) ?? [{ x: g.x, y: g.y }];
      this.pathIdx = 0;
      if (this.stuckT >= 6) this.onChange({ type: 'crowded' });
    }
  }

  animCode() {
    if (this.actionAnim >= 0) return this.actionAnim;
    return Math.hypot(this.vx, this.vy) > 0.15 ? ANIM.walk : ANIM.idle;
  }

  state() {
    return {
      x: this.x, y: this.y, heading: this.heading, speed: Math.hypot(this.vx, this.vy),
      anim: this.animCode(), incense: this.holding.incense > 0,
    };
  }

  // Snapshot of what the UI needs.
  status() {
    const plan = this.plan;
    const st = plan ? STATION_BY_ID[plan.station] : null;
    return {
      mode: this.mode,
      station: plan ? plan.station : null,
      phase: plan ? plan.phase : null,
      ahead: plan && plan.phase === 'queue' ? plan.ahead : 0,
      actions: plan && plan.phase === 'atSlot' && st ? ACTIONS[st.kind] : null,
      holding: this.holding,
      busy: this.now < this.busyUntil,
      next: this.nextStation(),
      done: this.done,
    };
  }

  emit() {
    this.onChange({ type: 'status' });
  }
}
