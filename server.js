// 雲端宮 server: static files + WebSocket rooms ("廟埕").
// Each room runs the shared crowd simulation at 30 Hz and broadcasts compact
// snapshots at 15 Hz. Visitors' own avatars are simulated in their browsers
// (no input lag) and reported here; the room steers the simulated crowd around them.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { extname, join, normalize, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room, DT } from './public/js/sim/room.js';
import { sanitizeLook } from './public/js/sim/ritual.js';
import { ADDON_FILES, rewriteAddon } from './lib/vendor.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(ROOT, 'public');
const THREE_BUILD = join(ROOT, 'node_modules', 'three', 'build');
const THREE_ADDONS = join(ROOT, 'node_modules', 'three', 'examples', 'jsm');
const PORT = Number(process.env.PORT) || 3000;
const MAX_ROOMS = 30;
const MAX_CLIENTS_PER_ROOM = 30;
const ROOM_IDLE_MS = 120_000;
const NPC_TARGET = Number(process.env.NPC_TARGET ?? 18);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob:",
    "connect-src 'self' ws: wss:",
    "font-src 'self' https://fonts.gstatic.com",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export function sanitizeRoomId(raw) {
  const id = String(raw ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24);
  return id || 'court-1';
}

export function sanitizeName(raw) {
  return String(raw ?? '')
    // Control characters, zero-width and bidi overrides.
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g, '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 12);
}

// ----------------------------------------------------------------- static

const fileCache = new Map();

async function loadFile(path, transform = null) {
  const info = await stat(path);
  if (!info.isFile()) return null;
  const cached = fileCache.get(path);
  if (cached && cached.mtime === info.mtimeMs) return cached;
  let body = await readFile(path);
  if (transform) body = Buffer.from(transform(body.toString('utf8')), 'utf8');
  const type = MIME[extname(path)] || 'application/octet-stream';
  const compressible = /^(text|application\/(json|manifest)|image\/svg)/.test(type);
  const entry = {
    mtime: info.mtimeMs,
    body,
    gz: compressible && body.length > 1024 ? gzipSync(body, { level: 9 }) : null,
    type,
    etag: `"${createHash('sha1').update(body).digest('base64url').slice(0, 20)}"`,
  };
  fileCache.set(path, entry);
  return entry;
}

function resolveStatic(urlPath) {
  let p;
  try {
    p = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (p.includes('\0')) return null;
  if (p.startsWith('/vendor/three/build/')) {
    const file = normalize(join(THREE_BUILD, p.slice('/vendor/three/build/'.length)));
    return file.startsWith(THREE_BUILD + sep) ? { file, vendor: true } : null;
  }
  if (p.startsWith('/vendor/three/addons/')) {
    const rel = p.slice('/vendor/three/addons/'.length);
    if (!ADDON_FILES.includes(rel)) return null;
    return { file: join(THREE_ADDONS, rel), vendor: true, transform: rewriteAddon };
  }
  if (p.endsWith('/')) p += 'index.html';
  const file = normalize(join(PUBLIC, p));
  return file.startsWith(PUBLIC + sep) ? { file, vendor: false } : null;
}

async function serveStatic(req, res, url) {
  const target = resolveStatic(url.pathname);
  if (!target) return send(res, 400, 'Bad request');
  let entry;
  try {
    entry = await loadFile(target.file, target.transform);
  } catch {
    entry = null;
  }
  if (!entry) return send(res, 404, 'Not found');
  const headers = {
    ...SECURITY_HEADERS,
    'Content-Type': entry.type,
    ETag: entry.etag,
    'Cache-Control': target.vendor ? 'public, max-age=604800' : 'no-cache',
    Vary: 'Accept-Encoding',
  };
  if (req.headers['if-none-match'] === entry.etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  const useGz = entry.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  if (useGz) headers['Content-Encoding'] = 'gzip';
  const body = useGz ? entry.gz : entry.body;
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

function send(res, status, text, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(text);
}

// ------------------------------------------------------------------ rooms

const rooms = new Map();

function getRoom(id) {
  let entry = rooms.get(id);
  if (entry) return entry;
  if (rooms.size >= MAX_ROOMS) return null;
  const room = new Room({ id, npcTarget: NPC_TARGET, warmup: 75 });
  entry = { id, room, clients: new Set(), emptySince: Date.now() };
  room.onPlayerAssign = (playerId, payload) => {
    for (const c of entry.clients) if (c.playerId === playerId) sendJson(c.ws, { t: 'as', ...payload });
  };
  rooms.set(id, entry);
  return entry;
}

function sendJson(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(entry, text) {
  for (const c of entry.clients) if (c.ws.readyState === c.ws.OPEN && c.ws.bufferedAmount < 256 * 1024) c.ws.send(text);
}

let tick = 0;
let lastTime = performance.now();
let acc = 0;

function loop() {
  const now = performance.now();
  acc += (now - lastTime) / 1000;
  lastTime = now;
  if (acc > DT * 6) acc = DT * 6;
  while (acc >= DT) {
    acc -= DT;
    tick++;
    for (const entry of rooms.values()) {
      if (entry.clients.size === 0) continue;
      entry.room.step(DT);
    }
    if (tick % 2 === 0) for (const entry of rooms.values()) publish(entry);
  }
  // Drop rooms nobody has visited for a while.
  if (tick % 300 === 0) {
    const t = Date.now();
    for (const [id, entry] of rooms) if (entry.clients.size === 0 && t - entry.emptySince > ROOM_IDLE_MS) rooms.delete(id);
  }
}

function publish(entry) {
  if (entry.clients.size === 0) return;
  const room = entry.room;
  const meta = room.drainMeta();
  if (meta.add.length || meta.del.length) broadcast(entry, JSON.stringify({ t: 'm', ...meta }));
  const events = room.drainEvents();
  if (events.length) broadcast(entry, JSON.stringify({ t: 'e', list: events.map((e) => [e.id, e.type, e.value]) }));
  broadcast(entry, JSON.stringify({ t: 's', time: +room.time.toFixed(3), a: room.snapshot() }));
  if (tick % 30 === 0) broadcast(entry, JSON.stringify({ t: 'st', ...room.sharedState() }));
}

// --------------------------------------------------------------- sockets

function handleConnection(ws, roomId) {
  const entry = getRoom(roomId);
  if (!entry) {
    sendJson(ws, { t: 'err', code: 'tooManyRooms' });
    return ws.close(1013, 'busy');
  }
  if (entry.clients.size >= MAX_CLIENTS_PER_ROOM) {
    sendJson(ws, { t: 'err', code: 'roomFull' });
    return ws.close(1013, 'full');
  }
  const client = { ws, playerId: 0, tokens: 60, lastRefill: Date.now(), alive: true };
  entry.clients.add(client);

  ws.on('pong', () => { client.alive = true; });
  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    // Token bucket: 30 messages per second sustained, bursts of 60.
    const now = Date.now();
    client.tokens = Math.min(60, client.tokens + ((now - client.lastRefill) / 1000) * 30);
    client.lastRefill = now;
    if (client.tokens < 1) return;
    client.tokens -= 1;
    let msg;
    try {
      msg = JSON.parse(data.toString('utf8'));
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    onMessage(entry, client, msg);
  });
  ws.on('close', () => {
    if (client.playerId) entry.room.removeAgent(client.playerId);
    entry.clients.delete(client);
    if (entry.clients.size === 0) entry.emptySince = Date.now();
  });
  ws.on('error', () => {});
}

function onMessage(entry, client, msg) {
  const room = entry.room;
  const id = client.playerId;
  switch (msg.t) {
    case 'hello': {
      if (id) return;
      const look = sanitizeLook(msg.look);
      const agent = room.addPlayer({ name: sanitizeName(msg.name), look: look ?? undefined });
      if (!agent) return sendJson(client.ws, { t: 'err', code: 'roomFull' });
      client.playerId = agent.id;
      // A reconnecting visitor resumes where they were instead of at the entrance.
      if (Number.isFinite(msg.x) && Number.isFinite(msg.y)) room.teleportPlayer(agent.id, msg.x, msg.y);
      // Everyone else learns about the newcomer from the next regular meta broadcast.
      sendJson(client.ws, {
        t: 'welcome', id: agent.id, room: entry.id, time: room.time, dt: DT,
        you: { x: agent.x, y: agent.y, h: agent.heading },
        meta: room.allMeta(), snap: room.snapshot(), state: room.sharedState(),
      });
      return;
    }
    case 'p': {
      if (!id) return;
      const fix = room.updatePlayer(id, msg);
      if (fix) sendJson(client.ws, { t: 'fix', x: fix.x, y: fix.y });
      return;
    }
    case 'join':
      if (id && typeof msg.s === 'string') {
        const res = room.playerJoin(id, msg.s);
        if (res.type !== 'slot' && res.type !== 'queue') sendJson(client.ws, { t: 'as', station: msg.s, type: res.type, index: -1, jx: res.jx, jy: res.jy });
      }
      return;
    case 'leave':
      if (id) room.playerLeave(id);
      return;
    case 'arrive':
      if (id) room.playerArrive(id);
      return;
    case 'act':
      if (id && typeof msg.a === 'string') {
        const out = room.playerAct(id, msg.a);
        sendJson(client.ws, { t: 'res', req: Number(msg.req) || 0, ...out });
      }
      return;
    case 'finish':
      if (id) room.playerFinish(id);
      return;
    case 'emote':
      if (id) room.playerEmote(id, msg.e);
      return;
    case 'respawn':
      if (id) {
        room.playerLeave(id);
        const p = room.teleportPlayer(id, 22.6, 38.6);
        if (p) sendJson(client.ws, { t: 'fix', x: p.x, y: p.y });
      }
      return;
    default:
  }
}

// ----------------------------------------------------------------- server

export function startServer(port = PORT) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/healthz') return send(res, 200, 'ok');
    if (url.pathname === '/api/rooms') {
      const list = [...rooms.values()].map((e) => ({ id: e.id, online: e.room.playerCount() })).filter((r) => r.online > 0);
      return send(res, 200, JSON.stringify({ rooms: list }), 'application/json; charset=utf-8');
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    serveStatic(req, res, url).catch(() => send(res, 500, 'Server error'));
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/ws') return socket.destroy();
    const roomId = sanitizeRoomId(url.searchParams.get('room'));
    wss.handleUpgrade(req, socket, head, (ws) => handleConnection(ws, roomId));
  });

  const ticker = setInterval(loop, 1000 / 60);
  const heartbeat = setInterval(() => {
    for (const entry of rooms.values()) {
      for (const c of entry.clients) {
        if (!c.alive) { c.ws.terminate(); continue; }
        c.alive = false;
        c.ws.ping();
      }
    }
  }, 20_000);
  server.on('close', () => {
    clearInterval(ticker);
    clearInterval(heartbeat);
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  startServer().then((server) => {
    const { port } = server.address();
    console.log(`雲端宮 listening on http://localhost:${port}`);
    const stop = () => server.close(() => process.exit(0));
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
  });
}
