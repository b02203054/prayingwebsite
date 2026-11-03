// Two interchangeable sessions:
//   OnlineSession  – talks to the server room over WebSocket (real visitors).
//   OfflineSession – runs the same room simulation inside the page.
// Both expose: selfId, meta, shared, others(), sendState(), join(), leave(),
// arrive(), act(), finish(), emote(), respawn(), and the callbacks
// onAssign(payload), onEvent(id, type, value), onShared(state), onStatus(status), onCorrection(x, y).
import { Room, DT } from '../sim/room.js';
import { decodeLook, encodeLook } from '../sim/ritual.js';
import { SnapshotBuffer } from './interp.js';

const noop = () => {};

function metaEntry(m) {
  return { kind: m[1], name: m[2], look: decodeLook(m[3]) };
}

class BaseSession {
  constructor() {
    this.selfId = 0;
    this.meta = new Map();
    this.shared = { burners: {}, lamps: [], online: 1, stations: {} };
    this.buffer = new SnapshotBuffer();
    this.onAssign = noop;
    this.onEvent = noop;
    this.onShared = noop;
    this.onStatus = noop;
    this.onCorrection = noop;
    this.you = null;
  }

  withMeta(list) {
    for (const o of list) {
      const m = this.meta.get(o.id);
      if (m) {
        o.kind = m.kind;
        o.name = m.name;
        o.look = m.look;
      } else {
        o.kind = 0;
        o.name = '';
        o.look = { age: 1, skin: 0, hair: 0, style: 0, top: 6, bottom: 1, acc: 0 };
      }
    }
    return list;
  }
}

export class OfflineSession extends BaseSession {
  constructor({ roomId, name, look }) {
    super();
    this.mode = 'offline';
    this.room = new Room({ id: roomId, npcTarget: 18 });
    this.name = name;
    this.look = look;
    this.acc = 0;
    this.sharedT = 0;
  }

  // Fill the temple with visitors in small slices so the page stays responsive.
  async start(onProgress = noop) {
    const total = Math.round(70 / DT);
    const slice = 150;
    for (let i = 0; i < total; i += slice) {
      for (let k = 0; k < slice; k++) this.room.step(DT, true);
      onProgress(Math.min(1, (i + slice) / total));
      await new Promise((r) => setTimeout(r, 0));
    }
    this.room.drainEvents();
    const p = this.room.addPlayer({ name: this.name, look: this.look });
    this.selfId = p.id;
    this.you = { x: p.x, y: p.y, h: p.heading };
    this.room.onPlayerAssign = (id, payload) => {
      if (id === this.selfId) this.onAssign(payload);
    };
    for (const m of this.room.allMeta()) this.meta.set(m[0], metaEntry(m));
    this.room.drainMeta();
    this.buffer.push(this.room.time, this.room.snapshot());
    this.shared = this.room.sharedState();
    this.onShared(this.shared);
    this.onStatus('offline');
  }

  update(dt) {
    this.acc += Math.min(dt, 0.25);
    let steps = 0;
    while (this.acc >= DT && steps < 6) {
      this.room.step(DT);
      this.acc -= DT;
      steps++;
      this.buffer.push(this.room.time, this.room.snapshot());
    }
    const meta = this.room.drainMeta();
    for (const m of meta.add) this.meta.set(m[0], metaEntry(m));
    for (const id of meta.del) this.meta.delete(id);
    for (const e of this.room.drainEvents()) this.onEvent(e.id, e.type, e.value);
    this.sharedT -= dt;
    if (this.sharedT <= 0) {
      this.sharedT = 0.5;
      this.shared = this.room.sharedState();
      this.onShared(this.shared);
    }
  }

  others() {
    return this.withMeta(this.buffer.sample(this.room.time - DT + this.acc, this.selfId));
  }

  sendState(s) {
    const fix = this.room.updatePlayer(this.selfId, s);
    if (fix) this.onCorrection(fix.x, fix.y);
  }

  join(stationId) {
    const res = this.room.playerJoin(this.selfId, stationId);
    if (res.type !== 'slot' && res.type !== 'queue') this.onAssign({ station: stationId, type: res.type, index: -1, jx: res.jx, jy: res.jy });
  }

  leave() { this.room.playerLeave(this.selfId); }
  arrive() { this.room.playerArrive(this.selfId); }
  act(actionId) { return Promise.resolve(this.room.playerAct(this.selfId, actionId)); }
  finish() { this.room.playerFinish(this.selfId); }
  emote(i) { this.room.playerEmote(this.selfId, i); }

  respawn() {
    this.room.playerLeave(this.selfId);
    const p = this.room.teleportPlayer(this.selfId, 22.6, 38.6);
    if (p) this.onCorrection(p.x, p.y);
  }

  close() {}
}

export class OnlineSession extends BaseSession {
  constructor({ roomId, name, look, url }) {
    super();
    this.mode = 'online';
    this.roomId = roomId;
    this.name = name;
    this.look = look;
    this.url = url;
    this.ws = null;
    this.offsets = [];
    this.offset = 0;
    this.req = 0;
    this.pending = new Map();
    this.closed = false;
    this.retry = 0;
    this.delay = 0.14;
  }

  start(timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.closed = true;
        if (this.ws) this.ws.close();
        reject(new Error('timeout'));
      }, timeoutMs);
      this.connect({
        welcome: () => { if (!settled) { settled = true; clearTimeout(timer); resolve(); } },
        fail: (e) => { if (!settled) { settled = true; clearTimeout(timer); reject(e); } },
      });
    });
  }

  connect(hooks = {}) {
    let ws;
    try {
      ws = new WebSocket(this.url);
    } catch (e) {
      hooks.fail?.(e);
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      const hello = { t: 'hello', name: this.name, look: encodeLook(this.look) };
      if (this.resumeAt) { hello.x = this.resumeAt.x; hello.y = this.resumeAt.y; }
      ws.send(JSON.stringify(hello));
    };
    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      this.handle(msg, hooks);
    };
    ws.onerror = () => hooks.fail?.(new Error('socket'));
    ws.onclose = () => {
      hooks.fail?.(new Error('closed'));
      if (this.closed || !this.selfId) return;
      this.onStatus('reconnecting');
      const wait = Math.min(10000, 1000 * 2 ** this.retry++);
      setTimeout(() => {
        if (this.closed) return;
        this.selfId = 0;
        this.connect({ welcome: () => this.onStatus('online') });
      }, wait);
    };
  }

  handle(msg, hooks) {
    switch (msg.t) {
      case 'welcome':
        this.selfId = msg.id;
        this.you = msg.you;
        this.meta.clear();
        for (const m of msg.meta) this.meta.set(m[0], metaEntry(m));
        this.buffer = new SnapshotBuffer();
        this.offsets = [];
        this.noteTime(msg.time);
        this.buffer.push(msg.time, msg.snap);
        this.shared = msg.state;
        this.onShared(this.shared);
        this.onStatus('online', { reconnected: !!hooks.reconnected, you: msg.you });
        hooks.welcome?.();
        break;
      case 's':
        this.noteTime(msg.time);
        this.buffer.push(msg.time, msg.a);
        break;
      case 'm':
        for (const m of msg.add) this.meta.set(m[0], metaEntry(m));
        for (const id of msg.del) this.meta.delete(id);
        break;
      case 'e':
        for (const [id, type, value] of msg.list) this.onEvent(id, type, value);
        break;
      case 'st':
        this.shared = msg;
        this.onShared(msg);
        break;
      case 'as':
        this.onAssign(msg);
        break;
      case 'res': {
        const p = this.pending.get(msg.req);
        if (p) {
          this.pending.delete(msg.req);
          p(msg);
        }
        break;
      }
      case 'fix':
        this.onCorrection(msg.x, msg.y);
        break;
      case 'err':
        this.onStatus('error', { code: msg.code });
        hooks.fail?.(new Error(msg.code));
        break;
      default:
    }
  }

  // Server clock estimate: the fastest-arriving packets bound the offset best.
  noteTime(serverTime) {
    const sample = serverTime - performance.now() / 1000;
    this.offsets.push(sample);
    if (this.offsets.length > 45) this.offsets.shift();
    this.offset = Math.max(...this.offsets);
  }

  update() {}

  others() {
    const t = performance.now() / 1000 + this.offset - this.delay;
    return this.withMeta(this.buffer.sample(t, this.selfId));
  }

  send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  sendState(s) {
    this.resumeAt = { x: s.x, y: s.y };
    this.send({ t: 'p', x: +s.x.toFixed(3), y: +s.y.toFixed(3), vx: +s.vx.toFixed(2), vy: +s.vy.toFixed(2), h: +s.h.toFixed(3), a: s.a });
  }
  join(stationId) { this.send({ t: 'join', s: stationId }); }
  leave() { this.send({ t: 'leave' }); }
  arrive() { this.send({ t: 'arrive' }); }
  finish() { this.send({ t: 'finish' }); }
  emote(i) { this.send({ t: 'emote', e: i }); }
  respawn() { this.send({ t: 'respawn' }); }

  act(actionId) {
    const req = ++this.req;
    this.send({ t: 'act', a: actionId, req });
    return new Promise((resolve) => {
      this.pending.set(req, resolve);
      setTimeout(() => {
        if (this.pending.has(req)) {
          this.pending.delete(req);
          resolve({ ok: false, reason: 'timeout' });
        }
      }, 5000);
    });
  }

  close() {
    this.closed = true;
    if (this.ws) this.ws.close();
  }
}
