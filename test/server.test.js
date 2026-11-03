import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { startServer, sanitizeRoomId, sanitizeName } from '../server.js';

let server;
let base;

before(async () => {
  server = await startServer(0);
  base = `127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => {
  server.closeAllConnections?.();
  server.close(() => resolve());
}));

function client(room) {
  const ws = new WebSocket(`ws://${base}/ws?room=${room}`);
  const inbox = [];
  const waiters = [];
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    inbox.push(msg);
    for (const w of [...waiters]) {
      if (w.match(msg)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(msg);
      }
    }
  });
  const next = (match, ms = 5000) => {
    const found = inbox.find(match);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const w = { match, resolve };
      waiters.push(w);
      setTimeout(() => reject(new Error('timeout waiting for message')), ms);
    });
  };
  const opened = new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  return { ws, inbox, next, opened, send: (m) => ws.send(JSON.stringify(m)) };
}

test('room ids and names are sanitized', () => {
  assert.equal(sanitizeRoomId('Court-2'), 'court-2');
  assert.equal(sanitizeRoomId('../../etc'), 'etc');
  assert.equal(sanitizeRoomId(''), 'court-1');
  assert.equal(sanitizeRoomId('x'.repeat(50)).length, 24);
  assert.equal(sanitizeName('<b>阿明</b>‮'), 'b阿明/b');
  assert.equal(sanitizeName('一二三四五六七八九十一二三'), '一二三四五六七八九十一二');
});

test('static files, vendor files and health check', async () => {
  const index = await fetch(`http://${base}/`);
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(await index.text(), /雲端宮/);
  const three = await fetch(`http://${base}/vendor/three/build/three.core.min.js`);
  assert.equal(three.status, 200);
  assert.match(three.headers.get('content-type'), /javascript/);
  assert.equal((await fetch(`http://${base}/healthz`)).status, 200);
  assert.equal((await fetch(`http://${base}/js/sim/nope.js`)).status, 404);
  const traversal = await fetch(`http://${base}/%2e%2e/server.js`);
  assert.notEqual(traversal.status, 200);
  const rooms = await (await fetch(`http://${base}/api/rooms`)).json();
  assert.ok(Array.isArray(rooms.rooms));
});

test('two visitors share a room, see each other and get cushion assignments', async () => {
  const a = client('test-duo');
  const b = client('test-duo');
  await Promise.all([a.opened, b.opened]);
  a.send({ t: 'hello', name: '阿明', look: [1, 0, 0, 0, 0, 0, 0] });
  const wa = await a.next((m) => m.t === 'welcome');
  b.send({ t: 'hello', name: '小美' });
  const wb = await b.next((m) => m.t === 'welcome');
  assert.notEqual(wa.id, wb.id);
  assert.ok(wb.meta.some((m) => m[0] === wa.id && m[2] === '阿明'), 'B knows A');
  // A shows up in B's snapshots, and B's meta reaches A.
  await b.next((m) => m.t === 's' && m.a.some((x) => x[0] === wa.id));
  await a.next((m) => m.t === 'm' && m.add.some((x) => x[0] === wb.id && x[2] === '小美'));
  // Walk A (kinematically, in small steps) to the desk join point and ask for a cushion.
  for (let i = 0; i <= 20; i++) {
    a.send({ t: 'p', x: 22.6 + (25.3 - 22.6) * (i / 20), y: 38.6 - (38.6 - 36.2) * (i / 20), vx: 0, vy: 0, h: 0, a: 0 });
    await new Promise((r) => setTimeout(r, 40));
  }
  a.send({ t: 'join', s: 'desk' });
  const as = await a.next((m) => m.t === 'as' && m.station === 'desk' && (m.type === 'slot' || m.type === 'queue'));
  assert.ok(Number.isFinite(as.x) && Number.isFinite(as.y));
  if (as.type === 'slot') {
    for (let i = 0; i <= 10; i++) {
      a.send({ t: 'p', x: 25.3 + (as.x - 25.3) * (i / 10), y: 36.2 + (as.y - 36.2) * (i / 10), vx: 0, vy: 0, h: 0, a: 0 });
      await new Promise((r) => setTimeout(r, 40));
    }
    a.send({ t: 'arrive' });
    a.send({ t: 'act', a: 'incense', req: 7 });
    const res = await a.next((m) => m.t === 'res' && m.req === 7);
    assert.equal(res.ok, true);
    assert.equal(res.holding.incense, 5);
  }
  a.ws.close();
  b.ws.close();
});

test('garbage and oversized messages do not hurt the server', async () => {
  const c = client('test-garbage');
  await c.opened;
  c.ws.send('not json');
  c.ws.send(JSON.stringify(null));
  c.send({ t: 'join', s: 'nope' });
  c.send({ t: 'act', a: 'burn' });
  c.send({ t: 'hello', name: 'x' });
  const w = await c.next((m) => m.t === 'welcome');
  assert.ok(w.id > 0);
  c.send({ t: 'p', x: 'NaN', y: null, vx: 1e9, vy: -1e9, h: 'x', a: 999 });
  const closed = new Promise((resolve) => c.ws.once('close', (code) => resolve(code)));
  c.ws.send('x'.repeat(10000));
  assert.equal(await closed, 1009, 'oversized frames close the socket');
  assert.equal((await fetch(`http://${base}/healthz`)).status, 200, 'server still healthy');
});
