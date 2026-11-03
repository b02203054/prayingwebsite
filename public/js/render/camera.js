// Third-person camera: follows the avatar, orbits on drag, zooms, pulls in
// instead of clipping through walls, and stays under the hall ceilings.
// An overview mode shows the whole temple and its crowd flow.
import * as THREE from '../../vendor/three/build/three.module.min.js';
import { SOLIDS, CIRCLES, AREAS, pointInRect } from '../sim/world.js';

const BLOCKERS = [...SOLIDS.filter((s) => s.h > 1.6), ...CIRCLES.filter((c) => c.h > 2.5)];

function blockedAt(x, z, h) {
  for (const o of BLOCKERS) {
    if (h > o.h + 0.2) continue;
    if (o.r !== undefined) {
      if (Math.hypot(x - o.x, z - o.y) < o.r + 0.15) return true;
    } else if (x > o.x0 - 0.15 && x < o.x1 + 0.15 && z > o.y0 - 0.15 && z < o.y1 + 0.15) return true;
  }
  return false;
}

function ceilingAt(x, z) {
  for (const r of Object.values(AREAS)) if (pointInRect(x, z, r)) return r.ceiling;
  return 40;
}

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'follow';
    this.yaw = 0; // 0 = camera south of the target, looking north
    this.pitch = 0.36;
    this.dist = 7.2;
    this.target = new THREE.Vector3(16, 1, 36);
    this.pos = new THREE.Vector3(16, 4, 42);
    this.lookAt = new THREE.Vector3(16, 1, 36);
    this.overview = { yaw: 0, pitch: 0.98, dist: 44, target: new THREE.Vector3(16, 0, 19.5) };
    this.manualUntil = 0;
    this.curDist = this.dist;
    this.snap = true;
  }

  setMode(mode) {
    this.mode = mode;
  }

  // Camera-relative "forward" on the ground plane, as plan (x, y).
  forward() {
    const yaw = this.mode === 'overview' ? this.overview.yaw : this.yaw;
    return { x: -Math.sin(yaw), y: -Math.cos(yaw) };
  }

  rotate(dxPx, dyPx, now) {
    const o = this.mode === 'overview' ? this.overview : this;
    o.yaw -= dxPx * 0.0065;
    o.pitch = Math.min(this.mode === 'overview' ? 1.35 : 1.2, Math.max(this.mode === 'overview' ? 0.45 : 0.12, o.pitch + dyPx * 0.0045));
    this.manualUntil = now + 6;
  }

  zoom(factor) {
    if (this.mode === 'overview') this.overview.dist = Math.min(70, Math.max(16, this.overview.dist * factor));
    else this.dist = Math.min(14, Math.max(2.6, this.dist * factor));
  }

  // Auto-align behind the avatar while it walks on its own (guided walking).
  update(dt, now, avatar, autoAlign) {
    const k = 1 - Math.exp(-dt * 7);
    if (this.mode === 'overview') {
      const o = this.overview;
      const cp = Math.cos(o.pitch);
      const desired = new THREE.Vector3(
        o.target.x + Math.sin(o.yaw) * cp * o.dist,
        o.target.y + Math.sin(o.pitch) * o.dist,
        o.target.z + Math.cos(o.yaw) * cp * o.dist,
      );
      this.pos.lerp(desired, this.snap ? 1 : k * 0.6);
      this.lookAt.lerp(o.target, this.snap ? 1 : k * 0.6);
    } else {
      if (autoAlign && now > this.manualUntil && avatar.speed > 0.3) {
        const behind = Math.PI / 2 - avatar.heading + Math.PI;
        let d = behind - this.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        this.yaw += d * Math.min(1, dt * 1.2);
      }
      const tx = avatar.x;
      const tz = avatar.y;
      const ty = 1.05;
      this.target.set(tx, ty, tz);
      // Find how far back the camera can sit without entering a wall or ceiling.
      const cp = Math.cos(this.pitch);
      const dx = Math.sin(this.yaw) * cp;
      const dy = Math.sin(this.pitch);
      const dz = Math.cos(this.yaw) * cp;
      let allowed = this.dist;
      for (let d = 0.4; d <= this.dist; d += 0.12) {
        const x = tx + dx * d;
        const y = ty + dy * d;
        const z = tz + dz * d;
        if (blockedAt(x, z, y) || y > ceilingAt(x, z) - 0.35) {
          allowed = Math.max(0.9, d - 0.25);
          break;
        }
      }
      // Pull in immediately (never show a wall), ease back out slowly.
      this.curDist = allowed < this.curDist ? allowed : this.curDist + (allowed - this.curDist) * Math.min(1, dt * 2.5);
      const desired = new THREE.Vector3(tx + dx * this.curDist, ty + dy * this.curDist, tz + dz * this.curDist);
      this.pos.lerp(desired, this.snap ? 1 : 1 - Math.exp(-dt * 10));
      this.lookAt.lerp(this.target, this.snap ? 1 : 1 - Math.exp(-dt * 12));
    }
    this.snap = false;
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.lookAt);
  }
}
