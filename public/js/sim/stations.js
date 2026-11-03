// Slot and queue bookkeeping. One person per kneeling cushion; when all are
// taken, people line up on fixed spots and everyone steps forward together
// when the head of the line gets a cushion.

// Downstream-first order: fill the cushions farthest along the flow first,
// so people stepping out never cut across someone walking in.
export function slotOrder(def) {
  return def.slots
    .map((s, i) => ({ i, p: (s.ex - s.ax) * s.x + (s.ey - s.ay) * s.y }))
    .sort((a, b) => b.p - a.p)
    .map((o) => o.i);
}

// Same rule as StationManager.joinPoint, from broadcast data (queue length and
// a bitmask of occupied cushions), so browsers walk where the server expects.
export function joinPointFor(def, order, queueLength, occupiedMask) {
  if (queueLength === 0) {
    for (const i of order) {
      if ((occupiedMask & (1 << i)) === 0) return { x: def.slots[i].ax, y: def.slots[i].ay };
    }
  }
  return def.queue[Math.min(queueLength, def.queue.length - 1)];
}

export class StationManager {
  constructor(defs) {
    this.map = new Map();
    for (const def of defs) {
      this.map.set(def.id, { def, owner: new Array(def.slots.length).fill(0), queue: [], order: slotOrder(def) });
    }
  }

  get(id) {
    return this.map.get(id);
  }

  freeSlot(id) {
    const s = this.map.get(id);
    for (const i of s.order) if (s.owner[i] === 0) return i;
    return -1;
  }

  // Where a newcomer should walk to before asking to join.
  joinPoint(id) {
    const s = this.map.get(id);
    if (s.queue.length === 0) {
      const free = this.freeSlot(id);
      if (free >= 0) {
        const slot = s.def.slots[free];
        return { x: slot.ax, y: slot.ay };
      }
    }
    const k = Math.min(s.queue.length, s.def.queue.length - 1);
    return s.def.queue[k];
  }

  join(id, agentId) {
    const s = this.map.get(id);
    if (s.queue.length === 0) {
      const free = this.freeSlot(id);
      if (free >= 0) {
        s.owner[free] = agentId;
        return { type: 'slot', index: free };
      }
    }
    if (s.queue.length >= s.def.queue.length) return { type: 'full' };
    s.queue.push(agentId);
    return { type: 'queue', index: s.queue.length - 1 };
  }

  // Remove an agent from a station. Returns [[agentId, assignment], ...] for
  // everyone whose assignment changed as a result.
  leave(id, agentId) {
    const s = this.map.get(id);
    if (!s) return [];
    const changes = [];
    const qi = s.queue.indexOf(agentId);
    if (qi >= 0) {
      s.queue.splice(qi, 1);
      for (let k = qi; k < s.queue.length; k++) changes.push([s.queue[k], { type: 'queue', index: k }]);
    }
    const si = s.owner.indexOf(agentId);
    if (si >= 0) s.owner[si] = 0;
    return this.promote(id, changes);
  }

  promote(id, changes = []) {
    const s = this.map.get(id);
    let moved = false;
    while (s.queue.length > 0) {
      const free = this.freeSlot(id);
      if (free < 0) break;
      const head = s.queue.shift();
      s.owner[free] = head;
      changes.push([head, { type: 'slot', index: free }]);
      moved = true;
    }
    if (moved) {
      for (let k = 0; k < s.queue.length; k++) changes.push([s.queue[k], { type: 'queue', index: k }]);
    }
    // Keep only the latest assignment per agent.
    const last = new Map();
    for (const [a, as] of changes) last.set(a, as);
    return [...last.entries()];
  }

  summary() {
    const out = {};
    for (const [id, s] of this.map) {
      out[id] = { q: s.queue.length, busy: s.owner.filter((o) => o !== 0).length, slots: s.owner.length };
    }
    return out;
  }

  // Invariant check used by tests.
  validate() {
    const seen = new Set();
    for (const [id, s] of this.map) {
      for (const a of [...s.queue, ...s.owner.filter((o) => o !== 0)]) {
        if (seen.has(a)) return `agent ${a} appears twice (station ${id})`;
        seen.add(a);
      }
      if (s.queue.length > 0 && this.freeSlot(id) >= 0) return `station ${id} has a free slot while people queue`;
    }
    return null;
  }
}
