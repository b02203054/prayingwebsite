// ORCA (Optimal Reciprocal Collision Avoidance), following van den Berg et al.
// and the RVO2 reference implementation. Each constraint is a half-plane in
// velocity space; a velocity is allowed when it lies on the left of the directed
// line (point, direction). Static obstacle lines are hard; agent lines may be
// relaxed (linear program 3) when the crowd is too dense to satisfy them all.

const EPS = 1e-5;
const det = (ax, ay, bx, by) => ax * by - ay * bx;

function makeLines(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ px: 0, py: 0, dx: 1, dy: 0 });
  return out;
}

function lp1(lines, lineNo, radius, optX, optY, dirOpt, res) {
  const L = lines[lineNo];
  const dot = L.px * L.dx + L.py * L.dy;
  const disc = dot * dot + radius * radius - (L.px * L.px + L.py * L.py);
  if (disc < 0) return false;
  const sq = Math.sqrt(disc);
  let tLeft = -dot - sq;
  let tRight = -dot + sq;
  for (let i = 0; i < lineNo; i++) {
    const M = lines[i];
    const denom = det(L.dx, L.dy, M.dx, M.dy);
    const numer = det(M.dx, M.dy, L.px - M.px, L.py - M.py);
    if (Math.abs(denom) <= EPS) {
      if (numer < 0) return false;
      continue;
    }
    const t = numer / denom;
    if (denom >= 0) tRight = Math.min(tRight, t);
    else tLeft = Math.max(tLeft, t);
    if (tLeft > tRight) return false;
  }
  if (dirOpt) {
    const t = optX * L.dx + optY * L.dy > 0 ? tRight : tLeft;
    res.x = L.px + t * L.dx;
    res.y = L.py + t * L.dy;
  } else {
    let t = L.dx * (optX - L.px) + L.dy * (optY - L.py);
    if (t < tLeft) t = tLeft;
    else if (t > tRight) t = tRight;
    res.x = L.px + t * L.dx;
    res.y = L.py + t * L.dy;
  }
  return true;
}

function lp2(lines, count, radius, optX, optY, dirOpt, res) {
  if (dirOpt) {
    res.x = optX * radius;
    res.y = optY * radius;
  } else if (optX * optX + optY * optY > radius * radius) {
    const l = Math.hypot(optX, optY);
    res.x = (optX / l) * radius;
    res.y = (optY / l) * radius;
  } else {
    res.x = optX;
    res.y = optY;
  }
  for (let i = 0; i < count; i++) {
    const L = lines[i];
    if (det(L.dx, L.dy, L.px - res.x, L.py - res.y) > 0) {
      const tx = res.x;
      const ty = res.y;
      if (!lp1(lines, i, radius, optX, optY, dirOpt, res)) {
        res.x = tx;
        res.y = ty;
        return i;
      }
    }
  }
  return count;
}

function lp3(lines, count, numObst, beginLine, radius, res, proj) {
  let distance = 0;
  for (let i = beginLine; i < count; i++) {
    const Li = lines[i];
    if (det(Li.dx, Li.dy, Li.px - res.x, Li.py - res.y) <= distance) continue;
    let pc = 0;
    for (let j = 0; j < numObst; j++) {
      const P = proj[pc++];
      const S = lines[j];
      P.px = S.px; P.py = S.py; P.dx = S.dx; P.dy = S.dy;
    }
    for (let j = numObst; j < i; j++) {
      const Lj = lines[j];
      const P = proj[pc];
      const determinant = det(Li.dx, Li.dy, Lj.dx, Lj.dy);
      if (Math.abs(determinant) <= EPS) {
        if (Li.dx * Lj.dx + Li.dy * Lj.dy > 0) continue;
        P.px = 0.5 * (Li.px + Lj.px);
        P.py = 0.5 * (Li.py + Lj.py);
      } else {
        const s = det(Lj.dx, Lj.dy, Li.px - Lj.px, Li.py - Lj.py) / determinant;
        P.px = Li.px + s * Li.dx;
        P.py = Li.py + s * Li.dy;
      }
      const ddx = Lj.dx - Li.dx;
      const ddy = Lj.dy - Li.dy;
      const dl = Math.hypot(ddx, ddy);
      if (dl < EPS) continue;
      P.dx = ddx / dl;
      P.dy = ddy / dl;
      pc++;
    }
    const tx = res.x;
    const ty = res.y;
    if (lp2(proj, pc, radius, -Li.dy, Li.dx, true, res) < pc) {
      res.x = tx;
      res.y = ty;
    }
    distance = det(Li.dx, Li.dy, Li.px - res.x, Li.py - res.y);
  }
}

export class OrcaSolver {
  constructor(capacity = 64) {
    this.capacity = capacity;
    this.lines = makeLines(capacity);
    this.proj = makeLines(capacity);
    this.count = 0;
    this.numObst = 0;
    this.res = { x: 0, y: 0 };
  }

  begin() {
    this.count = 0;
    this.numObst = 0;
  }

  // Hard half-plane v·n >= c (n is a unit normal pointing into free space).
  // Must be added before any agent lines.
  addHalfPlane(nx, ny, c) {
    if (this.count >= this.capacity) return;
    const L = this.lines[this.count++];
    L.px = c * nx;
    L.py = c * ny;
    L.dx = ny;
    L.dy = -nx;
    this.numObst = this.count;
  }

  // Reciprocal constraint against another agent. `share` is how much of the
  // avoidance this agent takes on: 0.5 when both steer, 1 when the other is
  // standing still or does not react to us.
  // `bodyR` is the true combined body radius; r + orad may include personal space,
  // which shrinks when people are closer than that but not actually touching.
  addAgent(px, py, vx, vy, r, ox, oy, ovx, ovy, orad, tau, dt, share, bodyR = r + orad) {
    if (this.count >= this.capacity) return;
    const rpx = ox - px;
    const rpy = oy - py;
    const rvx = vx - ovx;
    const rvy = vy - ovy;
    const distSq = rpx * rpx + rpy * rpy;
    let R = r + orad;
    if (distSq <= R * R) {
      const d = Math.sqrt(distSq);
      if (d > bodyR + 2e-3) R = d - 1e-3;
    }
    const RSq = R * R;
    let ldx;
    let ldy;
    let ux;
    let uy;
    if (distSq > RSq) {
      const invT = 1 / tau;
      const wx = rvx - invT * rpx;
      const wy = rvy - invT * rpy;
      const wLenSq = wx * wx + wy * wy;
      const dot1 = wx * rpx + wy * rpy;
      if (dot1 < 0 && dot1 * dot1 > RSq * wLenSq) {
        // Project on the cut-off circle.
        const wLen = Math.sqrt(wLenSq);
        const uwx = wx / wLen;
        const uwy = wy / wLen;
        ldx = uwy;
        ldy = -uwx;
        const m = R * invT - wLen;
        ux = m * uwx;
        uy = m * uwy;
      } else {
        // Project on the legs of the velocity obstacle cone.
        const leg = Math.sqrt(distSq - RSq);
        if (det(rpx, rpy, wx, wy) > 0) {
          ldx = (rpx * leg - rpy * R) / distSq;
          ldy = (rpx * R + rpy * leg) / distSq;
        } else {
          ldx = -(rpx * leg + rpy * R) / distSq;
          ldy = -(-rpx * R + rpy * leg) / distSq;
        }
        const dot2 = rvx * ldx + rvy * ldy;
        ux = dot2 * ldx - rvx;
        uy = dot2 * ldy - rvy;
      }
    } else {
      // Already overlapping: resolve within one time step.
      const invDt = 1 / dt;
      const wx = rvx - invDt * rpx;
      const wy = rvy - invDt * rpy;
      const wLen = Math.hypot(wx, wy) || 1e-6;
      const uwx = wx / wLen;
      const uwy = wy / wLen;
      ldx = uwy;
      ldy = -uwx;
      const m = R * invDt - wLen;
      ux = m * uwx;
      uy = m * uwy;
    }
    const L = this.lines[this.count++];
    L.px = vx + share * ux;
    L.py = vy + share * uy;
    L.dx = ldx;
    L.dy = ldy;
  }

  solve(prefVx, prefVy, maxSpeed) {
    const res = this.res;
    const fail = lp2(this.lines, this.count, maxSpeed, prefVx, prefVy, false, res);
    if (fail < this.count) lp3(this.lines, this.count, this.numObst, fail, maxSpeed, res, this.proj);
    return res;
  }
}
