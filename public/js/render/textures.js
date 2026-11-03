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
