// DOM user interface: route guide, context actions, status chip, toasts,
// modals and the minimap.
import { ROUTE, STATION_BY_ID, STATIONS, SOLIDS, CIRCLES, WORLD } from '../sim/world.js';

export const STEPS = {
  desk: { name: '請香', title: '服務台・請香', sub: '請香（每爐一炷，共五炷）與數位金紙，也可以求平安符。不拿香、直接合掌參拜也可以。', optional: true },
  tiangong: { name: '拜天公', title: '天公爐・拜天公', sub: '多數廟宇的第一站：先向天公（玉皇上帝）稟告，再進殿拜主神。', optional: false },
  main: { name: '主神', title: '正殿・天上聖母', sub: '本宮主神（虛構廟宇）。民間常見祈求：平安、出入順利、家運。', optional: false },
  dragon: { name: '龍邊', title: '龍邊・文昌帝君', sub: '拜完主神，先拜龍邊（面向神明時的右手邊）。常見祈求：學業、考試。', optional: false },
  rear: { name: '後殿', title: '後殿・觀世音菩薩', sub: '由東側門進後殿，往西走。常見祈求：身心安頓、放下煩惱。', optional: false },
  lamps: { name: '光明燈', title: '後殿・點光明燈', sub: '為自己或家人點一盞燈。不記名，同廟埕的人都看得到它亮起。', optional: true },
  tiger: { name: '虎邊', title: '虎邊・月下老人', sub: '由西側門回到正殿，拜虎邊（面向神明時的左手邊）。常見祈求：姻緣、人際。', optional: false },
  lots: { name: '求籤', title: '求籤處・擲筊求籤', sub: '擲筊問一件事，或求一支籤。籤詩為本站原創，僅供參考。', optional: true },
  furnace: { name: '金爐', title: '金爐・化金紙', sub: '把數位金紙化掉答謝神明。現實中許多廟宇已推行減香、減爐。', optional: true },
  exit: { name: '出廟', title: '虎門出廟', sub: '依多數說法由虎門（面向廟時的左側）離開，參拜圓滿。', optional: false },
};

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(handlers) {
    this.h = handlers;
    this.el = {};
    for (const id of ['guide', 'progress', 'stepKicker', 'stepTitle', 'stepSub', 'goBtn', 'skipBtn', 'routeToggle', 'routeList', 'statusChip', 'statusText', 'stopBtn',
      'actionBar', 'actionKicker', 'actionTitle', 'holding', 'actionButtons', 'noteBtn', 'finishBtn', 'toasts', 'roomName', 'onlineCount', 'connDot',
      'minimap', 'emoteBtn', 'emoteMenu', 'soundBtn', 'viewBtn', 'mapBtn']) this.el[id] = $(id);
    this.doneHere = new Set();
    this.lastKey = '';
    this.el.goBtn.addEventListener('click', () => this.h.onGo());
    this.el.skipBtn.addEventListener('click', () => this.h.onSkip());
    this.el.stopBtn.addEventListener('click', () => this.h.onStop());
    this.el.finishBtn.addEventListener('click', () => this.h.onFinish());
    this.el.noteBtn.addEventListener('click', () => this.openModal('noteModal'));
    this.el.routeToggle.addEventListener('click', () => {
      const open = this.el.routeList.hidden;
      this.el.routeList.hidden = !open;
      this.el.guide.classList.toggle('expanded', open);
      this.el.routeToggle.setAttribute('aria-expanded', String(open));
      this.el.routeToggle.textContent = open ? '收合路線' : '看完整路線';
    });
    this.el.emoteBtn.addEventListener('click', () => { this.el.emoteMenu.hidden = !this.el.emoteMenu.hidden; });
    this.el.minimap.addEventListener('click', (e) => {
      const r = this.el.minimap.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * WORLD.w;
      const y = ((e.clientY - r.top) / r.height) * WORLD.h;
      this.h.onMapTap(x, y);
    });
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.closeModal(b.closest('.modal').id)));
    document.querySelectorAll('.modal').forEach((m) => m.addEventListener('click', (e) => {
      if (e.target === m && m.id !== 'introModal') this.closeModal(m.id);
    }));
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') document.querySelectorAll('.modal:not([hidden])').forEach((m) => { if (m.id !== 'introModal') this.closeModal(m.id); });
    });
  }

  setEmotes(list) {
    this.el.emoteMenu.innerHTML = '';
    list.forEach((e, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = e;
      b.setAttribute('aria-label', `表情 ${e}`);
      b.addEventListener('click', () => { this.el.emoteMenu.hidden = true; this.h.onEmote(i); });
      this.el.emoteMenu.appendChild(b);
    });
  }

  openModal(id) {
    $(id).hidden = false;
    const focusable = $(id).querySelector('input, button:not(.close), select');
    if (focusable) setTimeout(() => focusable.focus(), 30);
    this.h.onModal?.(id, true);
  }

  closeModal(id) {
    $(id).hidden = true;
    this.h.onModal?.(id, false);
  }

  anyModalOpen() {
    return [...document.querySelectorAll('.modal')].some((m) => !m.hidden);
  }

  setRoom(id) {
    const m = /^court-(\d+)$/.exec(id);
    this.el.roomName.textContent = m ? `第 ${m[1]} 廟埕` : `廟埕 ${id}`;
  }

  setConn(mode, online) {
    this.el.connDot.className = `dot ${mode === 'online' ? 'online' : mode === 'offline' ? 'offline' : ''}`;
    if (mode === 'online') this.el.onlineCount.textContent = `· 線上 ${online} 人`;
    else if (mode === 'offline') this.el.onlineCount.textContent = '· 單人模式';
    else this.el.onlineCount.textContent = '· 重新連線中';
  }

  toast(text, tone = '') {
    const t = document.createElement('div');
    t.className = `toast ${tone}`;
    t.textContent = text;
    this.el.toasts.appendChild(t);
    while (this.el.toasts.children.length > 3) this.el.toasts.firstChild.remove();
    setTimeout(() => t.remove(), 3600);
  }

  // Update everything that depends on the avatar's progress.
  update(status) {
    const current = status.station;
    const next = status.next;
    const key = [current, status.phase, status.ahead, next, status.busy, status.mode, status.holding.incense, status.holding.paper, status.holding.amulet, [...status.done].join()].join('|');
    if (key === this.lastKey) return;
    this.lastKey = key;
    // Progress dots and route list.
    this.el.progress.innerHTML = ROUTE.map((id) => `<i class="${status.done.has(id) ? 'done' : id === (current || next) ? 'now' : ''}"></i>`).join('');
    this.renderRoute(status);
    // Guide card.
    const showId = current || next;
    if (showId) {
      const s = STEPS[showId];
      const here = current && status.phase === 'atSlot';
      this.el.stepKicker.textContent = here ? '你在這裡' : current ? (status.phase === 'queue' ? '排隊中' : '正在前往') : '下一站';
      this.el.stepTitle.textContent = s.title;
      this.el.stepSub.textContent = s.sub;
      this.el.goBtn.textContent = here ? '參拜中' : current ? '前往中…' : '前往';
      this.el.goBtn.disabled = !!current;
      this.el.skipBtn.hidden = !s.optional && showId !== 'desk';
      this.el.skipBtn.textContent = '跳過這站';
    } else {
      this.el.stepKicker.textContent = '參拜圓滿';
      this.el.stepTitle.textContent = '可以自由逛逛';
      this.el.stepSub.textContent = '想再走一次，可以到說明裡選擇從入口開始。';
      this.el.goBtn.textContent = '從入口再走一次';
      this.el.goBtn.disabled = false;
      this.el.skipBtn.hidden = true;
    }
    // Status chip while walking or queueing.
    let chip = '';
    if (current && status.phase === 'travel') chip = `走向${STEPS[current].name}…`;
    else if (current && status.phase === 'queue') chip = status.ahead > 0 ? `排隊中・前面還有 ${status.ahead} 位` : '排隊中・下一位就是你';
    else if (current && status.phase === 'wait') chip = '這裡人有點多，稍等一下…';
    else if (current && (status.phase === 'toApproach' || status.phase === 'toSlot')) chip = '走向拜墊…';
    else if (status.mode === 'auto' && !current) chip = '走過去中…';
    this.el.statusChip.hidden = !chip;
    this.el.statusText.textContent = chip;
    // Action bar at a cushion.
    const at = status.phase === 'atSlot' && status.actions;
    this.el.actionBar.hidden = !at;
    document.body.classList.toggle('at-slot', !!at);
    if (at) this.renderActions(status);
    else this.doneHere.clear();
  }

  renderRoute(status) {
    const current = status.station;
    this.el.routeList.innerHTML = '';
    ROUTE.forEach((id, i) => {
      const s = STEPS[id];
      const li = document.createElement('li');
      li.className = status.done.has(id) ? 'done' : id === (current || status.next) ? 'now' : '';
      li.innerHTML = `<span class="num">${status.done.has(id) ? '✓' : i + 1}</span><div><div class="name"></div><div class="desc"></div></div>`;
      li.querySelector('.name').textContent = s.title + (s.optional ? '（可選）' : '');
      li.querySelector('.desc').textContent = s.sub;
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = '前往';
      b.addEventListener('click', () => this.h.onGoTo(id));
      li.appendChild(b);
      this.el.routeList.appendChild(li);
    });
  }

  renderActions(status) {
    const st = STATION_BY_ID[status.station];
    this.el.actionTitle.textContent = STEPS[status.station].title;
    this.el.actionKicker.textContent = st.kind === 'altar' || st.kind === 'burner' ? '你跪在拜墊上' : '輪到你了';
    const h = status.holding;
    const sticks = Math.max(0, Math.floor(Number(h.incense)) || 0);
    this.el.holding.textContent = `${sticks > 0 ? `手持清香 ${sticks} 炷` : '未持香（合掌即可）'}\n${h.paper ? '金紙一份' : ''}${h.amulet ? '・平安符' : ''}`;
    this.el.actionButtons.innerHTML = '';
    for (const a of status.actions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `act${this.doneHere.has(a.id) ? ' done' : ''}${status.busy && this.busyAction === a.id ? ' busy' : ''}`;
      const missing = (a.needs === 'incense' && h.incense <= 0) || (a.needs === 'paper' && !h.paper) || (a.needs === 'amulet' && !h.amulet);
      b.disabled = status.busy || missing;
      b.innerHTML = '<b></b><small></small>';
      b.querySelector('b').textContent = a.label;
      b.querySelector('small').textContent = missing ? (a.needs === 'incense' ? '需要先到服務台請香' : a.needs === 'paper' ? '需要先在服務台請金紙' : '需要先求平安符') : a.hint;
      b.addEventListener('click', () => {
        this.busyAction = a.id;
        this.h.onAction(a.id);
      });
      this.el.actionButtons.appendChild(b);
    }
    this.el.noteBtn.hidden = !(st.kind === 'altar' || st.kind === 'burner');
    this.el.finishBtn.classList.toggle('ready', this.doneHere.size > 0 && !status.busy);
    this.el.finishBtn.disabled = status.busy;
    this.el.finishBtn.textContent = status.next === 'exit' || !status.next ? '完成' : '完成，往下一站';
  }

  markDone(actionId) {
    this.doneHere.add(actionId);
    this.lastKey = '';
  }

  setToggle(btn, on) {
    this.el[btn].classList.toggle('active', on);
  }

  // Minimap: walls, stations, everyone as dots, you as an arrow.
  drawMap(others, self, nextId) {
    const c = this.el.minimap;
    if (c.hidden) return;
    const ctx = c.getContext('2d');
    const sx = c.width / WORLD.w;
    const sy = c.height / WORLD.h;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#f6eedf';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#e9dcc4';
    ctx.fillRect(4 * sx, 0.6 * sy, 24 * sx, 26.8 * sy);
    ctx.fillStyle = '#8f5a44';
    for (const o of SOLIDS) ctx.fillRect(o.x0 * sx, o.y0 * sy, Math.max(1, (o.x1 - o.x0) * sx), Math.max(1, (o.y1 - o.y0) * sy));
    for (const o of CIRCLES) { ctx.beginPath(); ctx.arc(o.x * sx, o.y * sy, Math.max(1.5, o.r * sx), 0, Math.PI * 2); ctx.fill(); }
    const t = performance.now() / 1000;
    for (const st of STATIONS) {
      const p = st.slots[Math.floor(st.slots.length / 2)];
      if (st.id === nextId) {
        ctx.strokeStyle = '#b3302a';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x * sx, p.y * sy, 6 + Math.sin(t * 4) * 1.5, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = '#c9a227';
      ctx.beginPath(); ctx.arc(p.x * sx, p.y * sy, 2.6, 0, Math.PI * 2); ctx.fill();
    }
    for (const o of others) {
      ctx.fillStyle = o.kind === 1 ? '#2d6cdf' : 'rgba(60,45,35,0.55)';
      ctx.beginPath(); ctx.arc(o.x * sx, o.y * sy, o.kind === 1 ? 2.4 : 1.7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.save();
    ctx.translate(self.x * sx, self.y * sy);
    ctx.rotate(self.heading);
    ctx.fillStyle = '#b3302a';
    ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, 4); ctx.lineTo(-2, 0); ctx.lineTo(-4, -4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
