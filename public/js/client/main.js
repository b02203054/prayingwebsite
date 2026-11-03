// 雲端宮 client bootstrap.
import { TempleScene } from '../render/scene.js';
import { PALETTE } from '../render/people.js';
import { Hud, STEPS } from '../ui/hud.js';
import { Divination } from '../ui/divination.js';
import { JIAO_TEXT } from '../ui/fortunes.js';
import { Sound } from '../ui/sound.js';
import { Input } from './input.js';
import { OnlineSession, OfflineSession } from './session.js';
import { AvatarController } from './avatar.js';
import { sharedNav } from '../sim/room.js';
import { randomLook, encodeLook, sanitizeLook, EMOTES } from '../sim/ritual.js';
import { createRng } from '../sim/rng.js';
import { STATIONS, stationAtPoint } from '../sim/world.js';

const $ = (id) => document.getElementById(id);

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`cloudtemple:${key}`);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(`cloudtemple:${key}`, JSON.stringify(value)); } catch { /* private mode */ }
  },
};

export function sanitizeRoomId(raw) {
  const id = String(raw ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24);
  return id || 'court-1';
}

const params = new URLSearchParams(location.search);
const roomId = sanitizeRoomId(params.get('room'));
const touch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (touch) document.body.classList.add('touch');
const qualityPref = params.get('quality') || store.get('quality', 'auto');
const quality = qualityPref === 'auto' ? (touch || Math.min(window.innerWidth, window.innerHeight) < 600 ? 'low' : 'high') : qualityPref;
const forceOffline = params.get('offline') === '1' || location.protocol === 'file:';

const canvas = $('scene');
const scene = new TempleScene(canvas, $('overlay'), { quality });
const sound = new Sound();
let session = null;
let controller = null;
let divination = null;
let entered = false;
let autoGuide = store.get('autoGuide', true);
let look = sanitizeLook(store.get('look', null)) ?? randomLook(createRng((Date.now() ^ (Math.random() * 1e9)) >>> 0), 1);
const visited = { lamp: false };

// ------------------------------------------------------------------- HUD

const hud = new Hud({
  onGo: () => {
    if (!controller) return;
    const next = controller.nextStation();
    if (next) controller.goToStation(next);
    else controller.respawn();
  },
  onGoTo: (id) => {
    if (!controller) return;
    controller.goToStation(id);
    if (window.innerWidth < 900) $('routeToggle').click();
  },
  onSkip: () => controller?.skip(),
  onStop: () => controller?.stop(),
  onFinish: () => controller?.finishStation(),
  onAction: (id) => {
    if (id === 'throw') divination.open('throw');
    else if (id === 'draw') divination.open('lots');
    else perform(id);
  },
  onEmote: (i) => session?.emote(i),
  onMapTap: (x, y) => {
    if (!controller) return;
    const st = stationAtPoint(x, y) || STATIONS.find((s) => Math.hypot(s.focus.x - x, s.focus.y - y) < 2.2);
    if (st) controller.goToStation(st.id);
    else scene.showTarget(...Object.values(controller.goToPoint(x, y)));
  },
});
hud.setRoom(roomId);
hud.setEmotes(EMOTES);
hud.setConn('', 0);

function reasonText(r) {
  return {
    noIncense: '需要先到服務台請香', noPaper: '需要先在服務台請金紙', noAmulet: '需要先在服務台求平安符',
    busy: '動作進行中，稍等一下', notAtSlot: '請先走到拜墊上', timeout: '連線有點慢，請再試一次', notReady: '請稍候',
  }[r] || '現在還不能這樣做';
}

async function perform(id) {
  const res = await controller.act(id);
  if (!res.ok) {
    hud.toast(reasonText(res.reason), 'warn');
    return;
  }
  hud.markDone(id);
  switch (id) {
    case 'incense': hud.toast('已請香五炷，附一份數位金紙', 'good'); break;
    case 'amulet': hud.toast('求得平安符，可以到天公爐「過爐」', 'good'); break;
    case 'donate': hud.toast('感謝你的心意 🙏（象徵性，不收任何費用）', 'good'); break;
    case 'pray':
      sound.bell();
      for (let k = 0; k < 3; k++) sound.woodfish(0.85 + k * 1.25);
      break;
    case 'kneel':
      for (let k = 0; k < 3; k++) sound.woodfish(1.1 + k * 1.4);
      break;
    case 'insert': hud.toast(res.holding.incense > 0 ? `已插香，手上還有 ${res.holding.incense} 炷` : '已插香，香都插完了', ''); break;
    case 'amuletPass': hud.toast('平安符已過爐，帶在身上保平安', 'good'); break;
    case 'burn': hud.toast('金紙已化，答謝神明', 'good'); break;
    default:
  }
}

// --------------------------------------------------------------- events

let lastGateToast = '';
// `s` is passed explicitly: events can arrive while the session is still starting.
function onEvent(s, id, type, value) {
  const self = id === s.selfId;
  const meta = s.meta.get(id);
  const player = meta && meta.kind === 1;
  switch (type) {
    case 'jiao':
      if (!self && player) scene.bubble(id, JIAO_TEXT[value]?.name ?? '', value === 0 ? 'good' : value === 2 ? 'low' : '');
      else if (!self && Math.random() < 0.5) scene.bubble(id, JIAO_TEXT[value]?.name ?? '', value === 0 ? 'good' : '');
      break;
    case 'lot':
      if (!self) scene.bubble(id, `第 ${value} 籤`);
      break;
    case 'lamp':
      if (self) {
        visited.lamp = true;
        sound.chime();
        scene.bubble('self', '🪔');
        hud.toast('已點亮一盞光明燈，同廟埕的人都看得到', 'good');
      } else if (player) scene.bubble(id, '點燈 🪔');
      break;
    case 'burn':
      if (self) sound.whoosh();
      else if (player) scene.bubble(id, '化金紙');
      break;
    case 'insert':
      if (self) sound.woodfish();
      else if (player) scene.bubble(id, '插香');
      break;
    case 'amulet':
      if (!self && player) scene.bubble(id, '平安符過爐');
      break;
    case 'emote':
      scene.bubble(self ? 'self' : id, EMOTES[value] ?? '🙏');
      break;
    case 'gate':
      if (self && value !== lastGateToast) {
        lastGateToast = value;
        const msg = {
          'dragon:in': ['由龍門入廟 ✓（多數說法：龍進虎出）', 'good'],
          'tiger:out': ['由虎門出廟 ✓', 'good'],
          'tiger:in': ['小提醒：多數說法是從右側的龍門進廟', 'warn'],
          'dragon:out': ['小提醒：多數說法是從左側的虎門離開', 'warn'],
        }[value];
        if (msg) hud.toast(...msg);
      }
      break;
    default:
  }
}

let crowdedToastAt = 0;
let statusDirty = true;
function onChange(ev) {
  switch (ev.type) {
    case 'status':
      statusDirty = true;
      break;
    case 'atSlot':
      sound.woodfish();
      statusDirty = true;
      break;
    case 'stationDone':
      hud.toast(`完成：${STEPS[ev.station]?.title ?? ''}`, 'good');
      statusDirty = true;
      if (autoGuide) {
        setTimeout(() => {
          if (controller.mode === 'idle' && !controller.plan) {
            const next = controller.nextStation();
            if (next) controller.goToStation(next);
          }
        }, 800);
      }
      break;
    case 'released':
      hud.toast(ev.reason === 'afk' ? '在拜墊上停留太久，先讓給其他香客；想繼續再按「前往」。' : '已離開隊伍');
      statusDirty = true;
      break;
    case 'crowded':
      if (performance.now() - crowdedToastAt > 8000) {
        crowdedToastAt = performance.now();
        hud.toast('前方人比較多，正在繞行…');
      }
      break;
    case 'complete':
      showDone();
      break;
    default:
  }
}

function showDone() {
  const done = [...controller.done].filter((id) => STEPS[id]);
  $('doneText').textContent = `你走完了 ${done.length} 站，由虎門出廟。願你平安順心。${divination?.lastFortune ? `今天求到第 ${divination.lastFortune.n} 籤「${divination.lastFortune.title}」。` : ''}${visited.lamp ? '你點的光明燈還亮著。' : ''}`;
  $('doneList').innerHTML = '';
  for (const id of done) {
    const li = document.createElement('li');
    li.textContent = STEPS[id].name;
    $('doneList').appendChild(li);
  }
  hud.openModal('doneModal');
}

function bindSession(s) {
  s.onEvent = (id, type, value) => onEvent(s, id, type, value);
  s.onShared = (st) => hud.setConn(s.mode, st.online);
  let first = true;
  s.onStatus = (status) => {
    if (status === 'online') {
      hud.setConn('online', s.shared.online);
      if (!first && controller) {
        controller.stop();
        hud.toast('已重新連線');
      }
      first = false;
    } else if (status === 'offline') hud.setConn('offline', 1);
    else if (status === 'reconnecting') hud.setConn('reconnecting', 0);
    else if (status === 'error') hud.toast('這個廟埕目前人數已滿，可以換一個廟埕', 'warn');
  };
}

// ---------------------------------------------------------------- intro

function drawLook() {
  const c = $('lookPreview');
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 72, 72);
  ctx.fillStyle = PALETTE.top[look.top];
  ctx.beginPath(); ctx.ellipse(36, 66, 22, 18, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = PALETTE.skin[look.skin];
  ctx.beginPath(); ctx.arc(36, 32, 17, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PALETTE.hair[look.age === 2 ? 5 : look.hair];
  ctx.beginPath(); ctx.arc(36, 29, 18, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
  ctx.fillStyle = '#241a15';
  for (const dx of [-6, 6]) { ctx.beginPath(); ctx.arc(36 + dx, 34, 2, 0, Math.PI * 2); ctx.fill(); }
}

const nameInput = $('nameInput');
nameInput.value = store.get('name', '') || `香客${Math.floor(1000 + Math.random() * 9000)}`;
drawLook();
$('lookBtn').addEventListener('click', () => {
  look = randomLook(createRng((Date.now() * 7919) >>> 0), 1);
  drawLook();
});

async function enter() {
  const btn = $('enterBtn');
  btn.disabled = true;
  btn.textContent = '準備中…';
  const name = nameInput.value.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12) || '香客';
  store.set('name', name);
  store.set('look', encodeLook(look));
  sound.unlock();
  const soundOn = store.get('sound', true);
  sound.setEnabled(soundOn);
  hud.setToggle('soundBtn', soundOn);
  $('loading').hidden = false;
  if (!forceOffline) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const s = new OnlineSession({ roomId, name, look, url: `${proto}://${location.host}/ws?room=${encodeURIComponent(roomId)}` });
    bindSession(s);
    $('loadingBar').style.width = '40%';
    try {
      await s.start(7000);
      session = s;
    } catch {
      s.close();
    }
  }
  if (!session) {
    const s = new OfflineSession({ roomId, name, look });
    bindSession(s);
    await s.start((p) => { $('loadingBar').style.width = `${Math.round(p * 100)}%`; });
    session = s;
    if (!forceOffline) hud.toast('暫時連不上伺服器：改為單人模式，香客由你的瀏覽器模擬', 'warn');
  }
  controller = new AvatarController({ nav: sharedNav(), session, look, onChange });
  divination = new Divination({ controller, sound, hud });
  scene.setSelfLook(look);
  scene.rig.setMode('follow');
  scene.rig.yaw = 0;
  scene.rig.snap = true;
  hud.closeModal('introModal');
  entered = true;
  statusDirty = true;
  hud.toast('跟著右上的參拜路線走；也可以直接點地面或神桌 🙏', 'good');
}
$('enterBtn').addEventListener('click', enter);
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') enter(); });

// --------------------------------------------------------------- controls

const input = new Input({
  canvas,
  joystick: $('joystick'),
  knob: $('knob'),
  onTap: (x, y) => {
    if (!entered) return;
    const hit = scene.pick(x, y, canvas.getBoundingClientRect());
    if (!hit) return;
    if (hit.stationId) {
      controller.goToStation(hit.stationId);
      hud.toast(`前往：${STEPS[hit.stationId].title}`);
    } else if (hit.point) {
      const p = controller.goToPoint(hit.point.x, hit.point.y);
      scene.showTarget(p.x, p.y);
    }
  },
  onDrag: (dx, dy) => scene.rig.rotate(dx, dy, performance.now() / 1000),
  onZoom: (f) => scene.rig.zoom(f),
  onKey: (k) => {
    if (!entered || hud.anyModalOpen()) return;
    if (k === 'n') $('goBtn').click();
    else if (k === 'v') $('viewBtn').click();
    else if (k === 'm') $('mapBtn').click();
    else if (k === 'enter' || k === ' ') {
      const b = [...document.querySelectorAll('#actionButtons .act:not(:disabled):not(.done)')][0];
      if (b) b.click();
    }
  },
});

$('viewBtn').addEventListener('click', () => {
  const overview = scene.rig.mode !== 'overview';
  scene.rig.setMode(overview ? 'overview' : 'follow');
  hud.setToggle('viewBtn', overview);
});
const minimap = $('minimap');
minimap.hidden = !store.get('map', !touch);
hud.setToggle('mapBtn', !minimap.hidden);
$('mapBtn').addEventListener('click', () => {
  minimap.hidden = !minimap.hidden;
  store.set('map', !minimap.hidden);
  hud.setToggle('mapBtn', !minimap.hidden);
});
$('soundBtn').addEventListener('click', () => {
  const on = !sound.enabled;
  sound.setEnabled(on);
  store.set('sound', on);
  hud.setToggle('soundBtn', on);
});
$('aboutBtn').addEventListener('click', () => hud.openModal('aboutModal'));
$('roomBtn').addEventListener('click', openRooms);

const moodSelect = $('moodSelect');
moodSelect.value = store.get('mood', 'auto');
scene.setMood(moodSelect.value);
moodSelect.addEventListener('change', () => { scene.setMood(moodSelect.value); store.set('mood', moodSelect.value); });
const guideCheck = $('guideCheck');
guideCheck.checked = autoGuide;
guideCheck.addEventListener('change', () => { autoGuide = guideCheck.checked; store.set('autoGuide', autoGuide); });
const qualitySelect = $('qualitySelect');
qualitySelect.value = qualityPref;
qualitySelect.addEventListener('change', () => {
  store.set('quality', qualitySelect.value);
  hud.toast('畫質設定會在重新整理後生效');
});

$('noteSubmit').addEventListener('click', () => {
  // The note stays in these inputs only; it is never sent anywhere.
  hud.closeModal('noteModal');
  if (controller?.canAct('pray')) perform('pray');
  else hud.toast('心意已記在心裡 🙏');
});

$('againBtn').addEventListener('click', () => {
  hud.closeModal('doneModal');
  controller.respawn();
  visited.lamp = false;
});
$('stayBtn').addEventListener('click', () => hud.closeModal('doneModal'));

async function openRooms() {
  const list = $('roomList');
  list.innerHTML = '';
  const rooms = [{ id: roomId, online: session?.shared?.online ?? 0 }];
  if (session?.mode === 'online') {
    try {
      const r = await fetch('/api/rooms');
      const data = await r.json();
      for (const room of data.rooms) if (room.id !== roomId) rooms.push(room);
    } catch { /* list is optional */ }
  }
  for (const r of rooms) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = r.id === roomId ? 'current' : '';
    const m = /^court-(\d+)$/.exec(r.id);
    b.innerHTML = '<span></span><span class="muted"></span>';
    b.firstChild.textContent = m ? `第 ${m[1]} 廟埕` : r.id;
    b.lastChild.textContent = r.id === roomId ? `你在這裡・${r.online} 人` : `${r.online} 人`;
    b.addEventListener('click', () => { if (r.id !== roomId) location.search = `?room=${encodeURIComponent(r.id)}`; });
    list.appendChild(b);
  }
  hud.openModal('roomModal');
}
$('roomGo').addEventListener('click', () => {
  const id = sanitizeRoomId($('roomInput').value);
  location.search = `?room=${encodeURIComponent(id)}`;
});
$('copyLink').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}?room=${encodeURIComponent(roomId)}`;
  try {
    await navigator.clipboard.writeText(url);
    hud.toast('已複製邀請連結', 'good');
  } catch {
    $('roomInput').value = url;
    $('roomInput').select();
    hud.toast('請手動複製連結');
  }
});

// ------------------------------------------------------------------ loop

function resize() {
  scene.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();
scene.rig.setMode('overview');

let last = performance.now();
let hudT = 0;
let mapT = 0;
let perfT = 0;
let perfFrames = 0;
let perfSlow = 0;
let lowered = 0;
const idleSelf = { x: 16, y: 36, heading: -Math.PI / 2, speed: 0, anim: 0, incense: false };
const timing = { logic: 0, render: 0 };

function frame(ts) {
  // Long frames (slow phones, background tabs) are split into small steps so
  // walking speed stays true to real time instead of turning into slow motion.
  const dt = Math.min(0.25, Math.max(0, (ts - last) / 1000));
  last = ts;
  const now = ts / 1000;
  if (!entered) {
    scene.rig.overview.yaw = Math.sin(now * 0.05) * 0.5;
    scene.update(dt, now, null, idleSelf, false);
    scene.render();
    requestAnimationFrame(frame);
    return;
  }
  session.update(dt);
  const others = session.others();
  const mv = hud.anyModalOpen() ? { x: 0, y: 0 } : input.moveVector();
  const f = scene.rig.forward();
  controller.setInput(-f.y * mv.x + f.x * mv.y, f.x * mv.x + f.y * mv.y);
  for (let rem = dt; rem > 1e-4; rem -= 1 / 30) controller.update(Math.min(1 / 30, rem), others, now);
  scene.syncAgents(others, now, dt);
  const me = controller.state();
  scene.updateSelf(me, now, dt);
  scene.update(dt, now, session.shared, me, controller.autoAlign && controller.mode === 'auto');
  const tLogic = performance.now();
  scene.render();
  timing.logic = timing.logic * 0.9 + (tLogic - ts) * 0.1;
  timing.render = timing.render * 0.9 + (performance.now() - tLogic) * 0.1;
  hudT -= dt;
  if (hudT <= 0 || statusDirty) {
    hudT = 0.1;
    statusDirty = false;
    hud.update(controller.status());
  }
  mapT -= dt;
  if (mapT <= 0) {
    mapT = 0.12;
    hud.drawMap(others, me, controller.plan ? controller.plan.station : controller.nextStation());
  }
  // Adaptive quality: if frames stay slow, lower resolution / drop shadows.
  perfT += dt;
  perfFrames++;
  if (perfT >= 2) {
    const fps = perfFrames / perfT;
    perfSlow = fps < 38 ? perfSlow + 1 : 0;
    if (perfSlow >= 2 && lowered < 3 && qualityPref === 'auto') {
      scene.lowerQuality();
      lowered++;
      perfSlow = 0;
    }
    perfT = 0;
    perfFrames = 0;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Read-only probe for automated checks (?debug=1).
if (params.get('debug') === '1') {
  let frames = 0;
  let fps = 0;
  let mark = performance.now();
  const tick = () => {
    frames++;
    const t = performance.now();
    if (t - mark > 1000) { fps = (frames * 1000) / (t - mark); frames = 0; mark = t; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__cloudTemple = {
    get fps() { return Math.round(fps * 10) / 10; },
    get avatar() { return controller ? { x: controller.x, y: controller.y, mode: controller.mode, plan: controller.plan && { station: controller.plan.station, phase: controller.plan.phase }, done: [...controller.done] } : null; },
    get mode() { return session?.mode; },
    get others() { return session ? session.others().length : 0; },
    showFortune(n) { divination.showFortune(n); hud.openModal('divModal'); },
    get timing() { return { logicMs: +timing.logic.toFixed(2), renderMs: +timing.render.toFixed(2), calls: scene.renderer.info.render.calls, tris: scene.renderer.info.render.triangles }; },
  };
}
