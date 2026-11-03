// Procedural canvas textures: floors, roof tiles, plaques, lanterns, doors.
// Everything is drawn here so the site ships no image assets.
import * as THREE from '../../vendor/three/build/three.module.min.js';

const SERIF = '"Noto Serif TC", "Noto Serif CJK TC", "Source Han Serif TC", "PMingLiU", "MingLiU", "Songti TC", serif';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c, { repeat = null, color = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

// Seeded noise so textures look the same on every visit.
function prng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function speckle(ctx, w, h, count, colors, rnd, size = 1.5) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
    ctx.globalAlpha = 0.05 + rnd() * 0.12;
    ctx.fillRect(rnd() * w, rnd() * h, size, size);
  }
  ctx.globalAlpha = 1;
}

// Granite paving: `tiles` x `tiles` stones per texture.
export function stoneTexture({ base = '#cfc9bf', tiles = 2, seed = 1, grout = '#a49d92', repeat = [1, 1] } = {}) {
  const [c, ctx] = canvas(512, 512);
  const rnd = prng(seed);
  const s = 512 / tiles;
  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      const v = (rnd() - 0.5) * 16;
      ctx.fillStyle = shade(base, v);
      ctx.fillRect(x * s, y * s, s, s);
    }
  }
  speckle(ctx, 512, 512, 5000, ['#000', '#fff', '#7a7066'], rnd, 2);
  ctx.strokeStyle = grout;
  ctx.lineWidth = 4;
  for (let i = 0; i <= tiles; i++) {
    ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(512, i * s); ctx.stroke();
  }
  return finish(c, { repeat });
}

// Square terracotta floor tiles used inside the halls.
export function brickTexture({ repeat = [1, 1] } = {}) {
  const [c, ctx] = canvas(512, 512);
  const rnd = prng(7);
  const n = 4;
  const s = 512 / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      ctx.fillStyle = shade('#a9553d', (rnd() - 0.5) * 22);
      ctx.fillRect(x * s, y * s, s, s);
      const g = ctx.createLinearGradient(x * s, y * s, x * s + s, y * s + s);
      g.addColorStop(0, 'rgba(255,255,255,0.06)');
      g.addColorStop(1, 'rgba(0,0,0,0.08)');
      ctx.fillStyle = g;
      ctx.fillRect(x * s, y * s, s, s);
    }
  }
  speckle(ctx, 512, 512, 3500, ['#000', '#e8b9a0'], rnd, 2);
  ctx.strokeStyle = '#6e3626';
  ctx.lineWidth = 5;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(512, i * s); ctx.stroke();
  }
  return finish(c, { repeat });
}

// Barrel roof tiles (筒瓦): vertical ribs with a glazed highlight.
export function roofTexture({ base = '#c8612f', rib = '#a84b22', repeat = [1, 1] } = {}) {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  const ribs = 8;
  const w = 256 / ribs;
  for (let i = 0; i < ribs; i++) {
    const x = i * w;
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, rib);
    g.addColorStop(0.35, shade(base, 22));
    g.addColorStop(0.6, base);
    g.addColorStop(1, rib);
    ctx.fillStyle = g;
    ctx.fillRect(x + w * 0.15, 0, w * 0.7, 256);
  }
  ctx.strokeStyle = 'rgba(60,20,8,0.35)';
  ctx.lineWidth = 2;
  for (let y = 0; y < 256; y += 32) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
  }
  return finish(c, { repeat });
}

// Plaque with gold characters. `vertical` stacks the characters top to bottom.
export function plaqueTexture(text, { bg = '#2a1410', fg = '#e9c46a', border = '#c9a227', vertical = false, w = 512, h = 160, font = SERIF } = {}) {
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = border;
  ctx.lineWidth = Math.max(4, Math.min(w, h) * 0.06);
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
  ctx.lineWidth = 2;
  const inset = Math.min(w, h) * 0.12;
  ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const chars = [...text];
  if (vertical) {
    const size = Math.min(w * 0.62, (h - inset * 2) / chars.length * 0.86);
    ctx.font = `700 ${size}px ${font}`;
    const step = (h - inset * 2) / chars.length;
    chars.forEach((ch, i) => ctx.fillText(ch, w / 2, inset + step * (i + 0.5)));
  } else {
    const size = Math.min(h * 0.6, (w - inset * 2) / chars.length * 0.9);
    ctx.font = `700 ${size}px ${font}`;
    const step = (w - inset * 2) / chars.length;
    chars.forEach((ch, i) => ctx.fillText(ch, inset + step * (i + 0.5), h / 2 + size * 0.04));
  }
  return finish(c);
}

// Round medallion with one character (dragon / tiger walls of the façade).
export function medallionTexture(ch, { ring = '#c9a227', bg = '#f3e7d0', fg = '#8c2a1c' } = {}) {
  const [c, ctx] = canvas(256, 256);
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = ring;
  ctx.beginPath(); ctx.arc(128, 128, 124, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.arc(128, 128, 108, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = ring;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(128, 128, 96, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = fg;
  ctx.font = `700 132px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, 128, 136);
  return finish(c);
}

// Red door leaf with rows of gold studs (門釘) and a ring knocker.
export function doorTexture({ studs = true } = {}) {
  const [c, ctx] = canvas(256, 512);
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, '#8e1f17');
  g.addColorStop(0.5, '#b3281d');
  g.addColorStop(1, '#8e1f17');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 512);
  ctx.strokeStyle = '#5c120c';
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, 240, 496);
  if (studs) {
    for (let r = 0; r < 7; r++) {
      for (let k = 0; k < 4; k++) {
        const x = 46 + k * 55;
        const y = 50 + r * 66;
        const sg = ctx.createRadialGradient(x - 4, y - 4, 2, x, y, 13);
        sg.addColorStop(0, '#fff1b8');
        sg.addColorStop(0.5, '#d9ac3a');
        sg.addColorStop(1, '#7a5714');
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  ctx.strokeStyle = '#d9ac3a';
  ctx.lineWidth = 7;
  ctx.beginPath(); ctx.arc(30, 270, 22, 0, Math.PI * 2); ctx.stroke();
  return finish(c);
}

// Lantern skin: red paper with dark caps and one gold character.
export function lanternTexture(ch = '福') {
  const [c, ctx] = canvas(512, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#7d0d0d');
  g.addColorStop(0.5, '#e02a1f');
  g.addColorStop(1, '#7d0d0d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = 'rgba(70,0,0,0.35)';
  ctx.lineWidth = 3;
  for (let x = 0; x < 512; x += 32) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke();
  }
  ctx.fillStyle = '#ffd56b';
  ctx.font = `700 120px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, 128, 134);
  ctx.fillText(ch, 384, 134);
  return finish(c);
}

// Embroidered altar cloth (桌裙).
export function altarClothTexture(ch = '福') {
  const [c, ctx] = canvas(512, 256);
  ctx.fillStyle = '#b3261e';
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = '#e8b84a';
  ctx.lineWidth = 10;
  ctx.strokeRect(14, 14, 484, 228);
  ctx.lineWidth = 3;
  ctx.strokeRect(30, 30, 452, 196);
  // Wave pattern along the bottom.
  ctx.beginPath();
  for (let x = 30; x <= 482; x += 2) ctx.lineTo(x, 206 + Math.sin(x / 9) * 6);
  ctx.stroke();
  ctx.fillStyle = '#f3cf6a';
  ctx.beginPath(); ctx.arc(256, 118, 62, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#a3201a';
  ctx.font = `700 92px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, 256, 124);
  return finish(c);
}

// Wooden lattice for windows and the fortune cabinet.
export function latticeTexture({ cells = 6, bg = '#3a1d12', bar = '#c9a227' } = {}) {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = bar;
  ctx.lineWidth = 6;
  const s = 256 / cells;
  for (let i = 0; i <= cells; i++) {
    ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(256, i * s); ctx.stroke();
  }
  return finish(c);
}

// Soft round sprite for smoke and glows.
export function softDotTexture() {
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return finish(c, { color: false });
}

// Ground "blob" shadow under characters (cheap on phones).
export function blobShadowTexture() {
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.42)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.18)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return finish(c, { color: false });
}

// Sky dome gradient (top → horizon), drawn vertically.
export function skyTexture(top, mid, horizon) {
  const [c, ctx] = canvas(8, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(0.55, mid);
  g.addColorStop(1, horizon);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 256);
  return finish(c);
}

export function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (n & 255) + amount));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// ---------------------------------------------------------------------------
// Relief and surface detail. Each generator draws a height map (light =
// raised) and derives a normal map from it, so flat geometry reads as carved
// stone, mortar joints, or tile ribs under real lighting.

export function normalFromHeight(src, strength = 2.5) {
  const w = src.width;
  const h = src.height;
  const data = src.getContext('2d').getImageData(0, 0, w, h).data;
  const [c, ctx] = canvas(w, h);
  const out = ctx.createImageData(w, h);
  const at = (x, y) => data[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out.data[i] = (-dx / len * 0.5 + 0.5) * 255;
      out.data[i + 1] = (dy / len * 0.5 + 0.5) * 255;
      out.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

function pair(albedo, height, { repeat = null, strength = 2.5 } = {}) {
  return { map: finish(albedo, { repeat }), normalMap: finish(normalFromHeight(height, strength), { repeat, color: false }) };
}

function blurCanvas(src, px) {
  const [c, ctx] = canvas(src.width, src.height);
  ctx.filter = `blur(${px}px)`;
  ctx.drawImage(src, 0, 0);
  ctx.filter = 'none';
  return c;
}

// Large granite slabs in running bond, each slab slightly different.
export function slabTexture({ base = '#c9c2b6', seed = 3, cols = 2, rows = 4, grout = '#8f877b', repeat = [1, 1] } = {}) {
  const S = 512;
  const [a, actx] = canvas(S, S);
  const [hgt, hctx] = canvas(S, S);
  const rnd = prng(seed);
  hctx.fillStyle = '#000';
  hctx.fillRect(0, 0, S, S);
  const rh = S / rows;
  const cw = S / cols;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? cw / 2 : 0;
    for (let k = -1; k <= cols; k++) {
      const x = k * cw + off;
      actx.fillStyle = shade(base, (rnd() - 0.5) * 18);
      actx.fillRect(x, r * rh, cw, rh);
      // Slab face: raised with softly rounded edges.
      hctx.fillStyle = '#fff';
      hctx.fillRect(x + 4, r * rh + 4, cw - 8, rh - 8);
    }
  }
  speckle(actx, S, S, 9000, ['#000', '#fff', '#6f665c', '#d9d2c4'], rnd, 2);
  // Wear: soft lighter blotches.
  for (let i = 0; i < 26; i++) {
    const g = actx.createRadialGradient(rnd() * S, rnd() * S, 0, rnd() * S, rnd() * S, 40 + rnd() * 60);
    g.addColorStop(0, 'rgba(255,255,255,0.05)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    actx.fillStyle = g;
    actx.fillRect(0, 0, S, S);
  }
  actx.strokeStyle = grout;
  actx.lineWidth = 5;
  for (let r = 0; r <= rows; r++) {
    actx.beginPath(); actx.moveTo(0, r * rh); actx.lineTo(S, r * rh); actx.stroke();
    const off = r % 2 ? cw / 2 : 0;
    for (let k = 0; k <= cols; k++) {
      actx.beginPath(); actx.moveTo(k * cw + off, r * rh); actx.lineTo(k * cw + off, (r + 1) * rh); actx.stroke();
    }
  }
  return pair(a, blurCanvas(hgt, 2.5), { repeat, strength: 3 });
}

// Fired brick with recessed mortar joints.
export function brickWallTexture({ base = '#9a4632', mortar = '#c9b9a3', seed = 11, repeat = [1, 1] } = {}) {
  const S = 512;
  const [a, actx] = canvas(S, S);
  const [hgt, hctx] = canvas(S, S);
  const rnd = prng(seed);
  actx.fillStyle = mortar;
  actx.fillRect(0, 0, S, S);
  hctx.fillStyle = '#000';
  hctx.fillRect(0, 0, S, S);
  const rows = 16;
  const bh = S / rows;
  const bw = S / 4;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? bw / 2 : 0;
    for (let k = -1; k <= 4; k++) {
      const x = k * bw + off;
      actx.fillStyle = shade(base, (rnd() - 0.5) * 34);
      actx.fillRect(x + 3, r * bh + 3, bw - 6, bh - 6);
      hctx.fillStyle = `rgb(${200 + rnd() * 55},${200 + rnd() * 55},${200 + rnd() * 55})`;
      hctx.fillRect(x + 3, r * bh + 3, bw - 6, bh - 6);
    }
  }
  speckle(actx, S, S, 7000, ['#000', '#e7b9a0', '#5a2418'], rnd, 2);
  return pair(a, blurCanvas(hgt, 1.2), { repeat, strength: 4 });
}

// Speckled granite for lions, pillars and bases.
export function graniteTexture({ base = '#b8b2a7', seed = 21, repeat = [1, 1] } = {}) {
  const S = 256;
  const [a, actx] = canvas(S, S);
  const [hgt, hctx] = canvas(S, S);
  const rnd = prng(seed);
  actx.fillStyle = base;
  actx.fillRect(0, 0, S, S);
  hctx.fillStyle = '#808080';
  hctx.fillRect(0, 0, S, S);
  speckle(actx, S, S, 6000, ['#000', '#fff', '#5d564d', '#e6e0d6'], rnd, 1.5);
  for (let i = 0; i < 900; i++) {
    hctx.fillStyle = rnd() < 0.5 ? '#9a9a9a' : '#666';
    hctx.fillRect(rnd() * S, rnd() * S, 2, 2);
  }
  return pair(a, blurCanvas(hgt, 0.8), { repeat, strength: 1.5 });
}

// Carved stone wall panel (堵): moulded frame and a relief motif.
export function carvedPanelTexture(motif = 'cloud', { base = '#a9a398', w = 512, h = 384, seed = 5 } = {}) {
  const [a, actx] = canvas(w, h);
  const [hgt, hctx] = canvas(w, h);
  const rnd = prng(seed);
  hctx.fillStyle = '#9a9a9a';
  hctx.fillRect(0, 0, w, h);
  // Frame mouldings: raised outer band, sunken channel, raised inner band.
  const band = (inset, color, lw) => { hctx.strokeStyle = color; hctx.lineWidth = lw; hctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2); };
  band(10, '#fff', 16);
  band(26, '#333', 8);
  band(36, '#e0e0e0', 6);
  hctx.fillStyle = '#555';
  hctx.fillRect(44, 44, w - 88, h - 88);
  hctx.fillStyle = '#f0f0f0';
  hctx.strokeStyle = '#f0f0f0';
  hctx.lineCap = 'round';
  const cx = w / 2;
  const cy = h / 2;
  if (motif === 'cloud') {
    // Auspicious cloud scrolls (祥雲).
    const scroll = (x, y, r, dir) => {
      hctx.lineWidth = r * 0.42;
      hctx.beginPath();
      for (let t = 0; t < Math.PI * 3.2; t += 0.1) {
        const rr = r * (1 - t / (Math.PI * 3.6));
        hctx.lineTo(x + Math.cos(t * dir) * rr, y + Math.sin(t * dir) * rr * 0.8);
      }
      hctx.stroke();
    };
    for (let i = 0; i < 6; i++) scroll(80 + rnd() * (w - 160), 80 + rnd() * (h - 160), 26 + rnd() * 22, rnd() < 0.5 ? 1 : -1);
    hctx.lineWidth = 14;
    hctx.beginPath();
    hctx.moveTo(60, cy + 40);
    hctx.bezierCurveTo(w * 0.3, cy - 50, w * 0.6, cy + 90, w - 60, cy - 20);
    hctx.stroke();
  } else if (motif === 'lotus') {
    for (let k = 0; k < 9; k++) {
      const ang = Math.PI + (k / 8) * Math.PI;
      hctx.beginPath();
      hctx.ellipse(cx + Math.cos(ang) * 46, cy + 30 + Math.sin(ang) * 46, 20, 62, ang + Math.PI / 2, 0, Math.PI * 2);
      hctx.fill();
    }
    hctx.beginPath(); hctx.arc(cx, cy + 34, 26, 0, Math.PI * 2); hctx.fill();
    hctx.lineWidth = 10;
    for (const s of [-1, 1]) {
      hctx.beginPath();
      hctx.moveTo(cx + s * 40, cy + 70);
      hctx.quadraticCurveTo(cx + s * 140, cy + 100, cx + s * 170, cy - 20);
      hctx.stroke();
      hctx.beginPath(); hctx.ellipse(cx + s * 175, cy - 40, 44, 26, s * 0.4, 0, Math.PI * 2); hctx.fill();
    }
  } else if (motif === 'wave') {
    hctx.lineWidth = 12;
    for (let row = 0; row < 4; row++) {
      hctx.beginPath();
      for (let x = 50; x <= w - 50; x += 4) hctx.lineTo(x, 90 + row * 62 + Math.sin(x / 26 + row) * 16);
      hctx.stroke();
    }
  } else {
    // Vase with plum blossoms (平安).
    hctx.beginPath();
    hctx.moveTo(cx - 30, cy + 110);
    hctx.bezierCurveTo(cx - 95, cy + 40, cx - 60, cy - 30, cx - 22, cy - 50);
    hctx.lineTo(cx + 22, cy - 50);
    hctx.bezierCurveTo(cx + 60, cy - 30, cx + 95, cy + 40, cx + 30, cy + 110);
    hctx.fill();
    for (let i = 0; i < 9; i++) {
      const x = cx - 120 + rnd() * 240;
      const y = cy - 130 + rnd() * 70;
      for (let p = 0; p < 5; p++) { hctx.beginPath(); hctx.arc(x + Math.cos(p * 1.256) * 9, y + Math.sin(p * 1.256) * 9, 7, 0, Math.PI * 2); hctx.fill(); }
    }
  }
  const soft = blurCanvas(hgt, 3);
  // Albedo: stone with recesses darkened (cheap ambient occlusion).
  actx.fillStyle = base;
  actx.fillRect(0, 0, w, h);
  speckle(actx, w, h, 9000, ['#000', '#fff', '#6d665c'], rnd, 1.6);
  actx.globalCompositeOperation = 'multiply';
  actx.globalAlpha = 0.55;
  actx.drawImage(soft, 0, 0);
  actx.globalCompositeOperation = 'source-over';
  actx.globalAlpha = 1;
  return pair(a, soft, { strength: 5 });
}

// Painted beam band (彩繪): a central wrapped panel and repeating rosettes.
export function paintedBeamTexture({ seed = 2 } = {}) {
  const W = 1024;
  const H = 128;
  const [a, ctx] = canvas(W, H);
  const rnd = prng(seed);
  ctx.fillStyle = '#21485f';
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,255,255,0.12)');
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#d6b04a';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, W - 6, H - 6);
  // Central wrapped panel (包巾) with a soft landscape.
  const px = W * 0.3;
  const pw = W * 0.4;
  ctx.fillStyle = '#efe2c4';
  ctx.beginPath();
  ctx.moveTo(px, H / 2); ctx.lineTo(px + 40, 12); ctx.lineTo(px + pw - 40, 12); ctx.lineTo(px + pw, H / 2); ctx.lineTo(px + pw - 40, H - 12); ctx.lineTo(px + 40, H - 12);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#a83a24';
  ctx.lineWidth = 4;
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = ['#7fa3a0', '#93b58e', '#6f8fa8', '#a9c4a4'][i];
    ctx.beginPath();
    const bx = px + 70 + i * 70;
    ctx.moveTo(bx - 50, H - 22); ctx.quadraticCurveTo(bx, 26 + rnd() * 20, bx + 60, H - 22);
    ctx.fill();
  }
  ctx.fillStyle = '#c84b31';
  ctx.beginPath(); ctx.arc(px + pw - 90, 40, 12, 0, Math.PI * 2); ctx.fill();
  // Rosettes (旋子) on both sides.
  const rosette = (x) => {
    for (let ring = 3; ring >= 1; ring--) {
      ctx.fillStyle = ring % 2 ? '#3f8a69' : '#e9e2cf';
      ctx.beginPath();
      for (let k = 0; k < 16; k++) {
        const ang = (k / 16) * Math.PI * 2;
        const r = ring * 15 + (k % 2) * 5;
        ctx.lineTo(x + Math.cos(ang) * r, H / 2 + Math.sin(ang) * r);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#d6b04a';
    ctx.beginPath(); ctx.arc(x, H / 2, 9, 0, Math.PI * 2); ctx.fill();
  };
  rosette(W * 0.12);
  rosette(W * 0.88);
  ctx.strokeStyle = '#e9e2cf';
  ctx.lineWidth = 3;
  for (const x of [W * 0.22, W * 0.78]) {
    ctx.beginPath(); ctx.moveTo(x, 12); ctx.lineTo(x, H - 12); ctx.stroke();
  }
  return finish(a, { repeat: [1, 1] });
}

// Colourful cut-ceramic mosaic band (剪黏) for ridge sides.
export function mosaicBandTexture({ seed = 8 } = {}) {
  const W = 512;
  const H = 96;
  const [a, ctx] = canvas(W, H);
  const rnd = prng(seed);
  ctx.fillStyle = '#efe6d3';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#b8352b';
  ctx.fillRect(0, H - 14, W, 14);
  ctx.fillStyle = '#2f6b55';
  ctx.fillRect(0, 0, W, 8);
  const colors = ['#d9473b', '#e9b93a', '#2f7d5b', '#2d5d9f', '#f2f0e6', '#c86b9a'];
  for (let i = 0; i < 18; i++) {
    const x = (i + 0.5) * (W / 18);
    const c1 = colors[Math.floor(rnd() * colors.length)];
    for (let p = 0; p < 6; p++) {
      ctx.fillStyle = p % 2 ? c1 : '#e9b93a';
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(p) * 9, 44 + Math.sin(p) * 9, 7, 11, p, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#2f7d5b';
    ctx.fillRect(x - 12, 62, 24, 6);
  }
  return finish(a, { repeat: [1, 1] });
}

// Glazed roof tiles for distant/low-detail roofs: albedo plus a ribbed normal map.
export function glazedTileTexture({ base = '#b9532c', seed = 4, repeat = [1, 1] } = {}) {
  const S = 256;
  const [a, actx] = canvas(S, S);
  const [hgt, hctx] = canvas(S, S);
  const rnd = prng(seed);
  const ribs = 8;
  const w = S / ribs;
  for (let i = 0; i < ribs; i++) {
    const x = i * w;
    const tone = (rnd() - 0.5) * 20;
    const g = actx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, shade(base, tone - 40));
    g.addColorStop(0.3, shade(base, tone + 26));
    g.addColorStop(0.55, shade(base, tone));
    g.addColorStop(1, shade(base, tone - 40));
    actx.fillStyle = g;
    actx.fillRect(x, 0, w, S);
    const hg = hctx.createLinearGradient(x, 0, x + w, 0);
    hg.addColorStop(0, '#000');
    hg.addColorStop(0.5, '#fff');
    hg.addColorStop(1, '#000');
    hctx.fillStyle = hg;
    hctx.fillRect(x, 0, w, S);
  }
  for (let y = 0; y < S; y += 32) {
    actx.fillStyle = 'rgba(40,10,4,0.25)';
    actx.fillRect(0, y, S, 3);
    hctx.fillStyle = '#222';
    hctx.fillRect(0, y, S, 3);
  }
  speckle(actx, S, S, 1200, ['#000', '#ffd0a0'], rnd, 1.5);
  return pair(a, hgt, { repeat, strength: 3 });
}

// Bronze with a cast relief band and green patina.
export function bronzeTexture({ seed = 6 } = {}) {
  const W = 512;
  const H = 256;
  const [a, actx] = canvas(W, H);
  const [hgt, hctx] = canvas(W, H);
  const rnd = prng(seed);
  actx.fillStyle = '#4a3523';
  actx.fillRect(0, 0, W, H);
  hctx.fillStyle = '#777';
  hctx.fillRect(0, 0, W, H);
  // Relief band: thunder-scroll (雷紋) squares.
  hctx.strokeStyle = '#fff';
  hctx.lineWidth = 5;
  for (let x = 0; x < W; x += 48) {
    for (let k = 0; k < 3; k++) hctx.strokeRect(x + 6 + k * 7, 92 + k * 7, 36 - k * 14, 52 - k * 14);
  }
  hctx.fillStyle = '#fff';
  hctx.fillRect(0, 78, W, 6);
  hctx.fillRect(0, 168, W, 6);
  for (let i = 0; i < 70; i++) {
    const g = actx.createRadialGradient(rnd() * W, rnd() * H, 0, rnd() * W, rnd() * H, 8 + rnd() * 26);
    g.addColorStop(0, 'rgba(80,130,105,0.35)');
    g.addColorStop(1, 'rgba(80,130,105,0)');
    actx.fillStyle = g;
    actx.fillRect(0, 0, W, H);
  }
  speckle(actx, W, H, 3000, ['#000', '#c89a5a'], rnd, 1.5);
  const soft = blurCanvas(hgt, 1.5);
  actx.globalCompositeOperation = 'overlay';
  actx.globalAlpha = 0.5;
  actx.drawImage(soft, 0, 0);
  actx.globalCompositeOperation = 'source-over';
  actx.globalAlpha = 1;
  return pair(a, soft, { strength: 4 });
}

// Window lattice in the 龜甲 (hexagon) pattern, with depth.
export function hexLatticeTexture() {
  const S = 256;
  const [a, actx] = canvas(S, S);
  const [hgt, hctx] = canvas(S, S);
  actx.fillStyle = '#20100b';
  actx.fillRect(0, 0, S, S);
  hctx.fillStyle = '#000';
  hctx.fillRect(0, 0, S, S);
  const r = 22;
  for (let row = -1; row < 8; row++) {
    for (let col = -1; col < 8; col++) {
      const x = col * r * 1.5 * 1.15 + 10;
      const y = row * r * 1.73 + (col % 2 ? r * 0.87 : 0) + 10;
      for (const [ctx, color, lw] of [[actx, '#c8a24a', 5], [hctx, '#fff', 6]]) {
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.beginPath();
        for (let k = 0; k <= 6; k++) ctx.lineTo(x + Math.cos((k * Math.PI) / 3) * r, y + Math.sin((k * Math.PI) / 3) * r);
        ctx.stroke();
      }
    }
  }
  actx.strokeStyle = '#7a1f16';
  actx.lineWidth = 14;
  actx.strokeRect(7, 7, S - 14, S - 14);
  hctx.strokeStyle = '#fff';
  hctx.lineWidth = 14;
  hctx.strokeRect(7, 7, S - 14, S - 14);
  return pair(a, blurCanvas(hgt, 1), { strength: 4 });
}
