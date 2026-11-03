// Snapshot interpolation: other visitors are drawn slightly in the past,
// between two received states, so motion stays smooth despite network jitter.

const angleLerp = (a, b, t) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

export class SnapshotBuffer {
  constructor(max = 40) {
    this.max = max;
    this.list = [];
  }

  // agents: [[id, x*100, y*100, vx*100, vy*100, heading*100, anim, flags], ...]
  push(time, agents) {
    const last = this.list[this.list.length - 1];
    if (last && time <= last.t) return;
    const map = new Map();
    for (const a of agents) map.set(a[0], a);
    this.list.push({ t: time, map });
    if (this.list.length > this.max) this.list.shift();
  }

  latestTime() {
    return this.list.length ? this.list[this.list.length - 1].t : 0;
  }

  // Interpolated agent states at time `t` (server clock).
  sample(t, skipId) {
    const out = [];
    const n = this.list.length;
    if (n === 0) return out;
    let older = this.list[0];
    let newer = this.list[0];
    if (t >= this.list[n - 1].t) {
      older = newer = this.list[n - 1];
    } else {
      for (let i = n - 1; i > 0; i--) {
        if (this.list[i - 1].t <= t) {
          older = this.list[i - 1];
          newer = this.list[i];
          break;
        }
      }
    }
    const span = newer.t - older.t;
    const k = span > 1e-6 ? Math.min(1, Math.max(0, (t - older.t) / span)) : 1;
    // Extrapolate a little past the newest snapshot (packet late), using velocity.
    const ahead = older === newer ? Math.min(0.15, Math.max(0, t - newer.t)) : 0;
    for (const [id, b] of newer.map) {
      if (id === skipId) continue;
      const a = older.map.get(id) || b;
      const vx = (a[3] + (b[3] - a[3]) * k) / 100;
      const vy = (a[4] + (b[4] - a[4]) * k) / 100;
      out.push({
        id,
        x: (a[1] + (b[1] - a[1]) * k) / 100 + vx * ahead,
        y: (a[2] + (b[2] - a[2]) * k) / 100 + vy * ahead,
        vx,
        vy,
        heading: angleLerp(a[5] / 100, b[5] / 100, k),
        anim: b[6],
        flags: b[7],
        still: (b[7] & 1) !== 0,
        speed: Math.hypot(vx, vy),
      });
    }
    return out;
  }
}
