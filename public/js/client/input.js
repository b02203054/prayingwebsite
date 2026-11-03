// Keyboard (WASD / arrows), an on-screen joystick, tap-to-walk, drag to look
// around, pinch / wheel to zoom.

export class Input {
  constructor({ canvas, joystick, knob, onTap, onDrag, onZoom, onKey }) {
    this.keys = new Set();
    this.joy = { x: 0, y: 0, id: null, cx: 0, cy: 0 };
    this.pointers = new Map();
    this.dragging = false;
    this.pinchDist = 0;
    this.onTap = onTap;
    this.onDrag = onDrag;
    this.onZoom = onZoom;
    this.onKey = onKey;
    this.knob = knob;
    this.joystick = joystick;

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        this.keys.add(k);
        e.preventDefault();
      } else if (!e.repeat) {
        this.onKey?.(k, e);
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('pointerdown', (e) => this.down(e, canvas));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.up(e, true));
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.onZoom?.(e.deltaY > 0 ? 1.1 : 1 / 1.1);
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    if (joystick) {
      joystick.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        joystick.setPointerCapture(e.pointerId);
        const r = joystick.getBoundingClientRect();
        this.joy.id = e.pointerId;
        this.joy.cx = r.left + r.width / 2;
        this.joy.cy = r.top + r.height / 2;
        this.joyMove(e);
      });
      joystick.addEventListener('pointermove', (e) => {
        if (e.pointerId === this.joy.id) this.joyMove(e);
      });
      const end = (e) => {
        if (e.pointerId !== this.joy.id) return;
        this.joy.id = null;
        this.joy.x = 0;
        this.joy.y = 0;
        if (this.knob) this.knob.style.transform = 'translate(-50%, -50%)';
      };
      joystick.addEventListener('pointerup', end);
      joystick.addEventListener('pointercancel', end);
    }
  }

  joyMove(e) {
    const max = 46;
    let dx = e.clientX - this.joy.cx;
    let dy = e.clientY - this.joy.cy;
    const d = Math.hypot(dx, dy);
    if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
    this.joy.x = dx / max;
    this.joy.y = -dy / max;
    if (this.knob) this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  down(e, canvas) {
    canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.dragging = true;
    }
  }

  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchDist > 0 && d > 0) this.onZoom?.(this.pinchDist / d);
      this.pinchDist = d;
      return;
    }
    if (!this.dragging && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 7) this.dragging = true;
    if (this.dragging) this.onDrag?.(dx, dy);
  }

  up(e, cancelled = false) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (!p) return;
    const quick = performance.now() - p.t < 450;
    if (!cancelled && !this.dragging && quick && this.pointers.size === 0) this.onTap?.(e.clientX, e.clientY);
    if (this.pointers.size === 0) {
      this.dragging = false;
      this.pinchDist = 0;
    }
  }

  // Movement intent in screen terms: x = right, y = forward. Length ≤ 1.
  moveVector() {
    let x = this.joy.x;
    let y = this.joy.y;
    const k = this.keys;
    if (k.has('w') || k.has('arrowup')) y += 1;
    if (k.has('s') || k.has('arrowdown')) y -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }
}
