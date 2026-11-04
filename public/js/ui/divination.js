// 擲筊 and 求籤. Results come from the room (server or local simulation);
// the avatar plays the matching animation for everyone to see.
//   求籤: ask with moon blocks first → draw a stick → confirm the stick with 聖筊.
import { FORTUNES, JIAO_TEXT } from './fortunes.js';
import { renderFortune } from './lots-book.js';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class Divination {
  constructor({ controller, sound, hud }) {
    this.controller = controller;
    this.sound = sound;
    this.hud = hud;
    this.blocks = $('blocks');
    this.tube = $('lotTube');
    this.result = $('divResult');
    this.actions = $('divActions');
    this.fortune = $('fortune');
    this.hint = $('divHint');
    this.title = $('divTitle');
    this.qField = $('divQuestionField');
    this.lot = 0;
    this.busy = false;
  }

  open(mode) {
    this.mode = mode;
    this.lot = 0;
    this.fortune.hidden = true;
    this.result.innerHTML = '';
    this.tube.hidden = true;
    this.tube.classList.remove('out');
    this.blocks.hidden = false;
    this.setFaces(0);
    this.qField.hidden = false;
    if (mode === 'lots') {
      this.title.textContent = '求籤';
      this.hint.textContent = '先在心裡向神明說明想問的事，擲筊請示可不可以求籤。';
      this.buttons([['擲筊請示', () => this.ask()]]);
    } else {
      this.title.textContent = '擲筊問事';
      this.hint.textContent = '問一個「是或不是」的問題，然後擲筊。';
      this.buttons([['擲筊', () => this.simpleThrow()]]);
    }
    this.hud.openModal('divModal');
  }

  buttons(list) {
    this.actions.innerHTML = '';
    for (const [label, fn, ghost] of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = ghost ? 'ghost' : 'primary';
      b.textContent = label;
      b.addEventListener('click', async () => {
        if (this.busy) return;
        this.busy = true;
        this.actions.querySelectorAll('button').forEach((x) => { x.disabled = true; });
        try {
          await fn();
        } finally {
          this.busy = false;
        }
      });
      this.actions.appendChild(b);
    }
  }

  close() {
    this.hud.closeModal('divModal');
  }

  // Faces: 0 聖筊 (flat + round), 1 笑筊 (both flat), 2 陰筊 (both round).
  setFaces(kind) {
    const [l, r] = this.blocks.children;
    const flip = Math.random() < 0.5;
    const faces = kind === 0 ? (flip ? ['flat', 'round'] : ['round', 'flat']) : kind === 1 ? ['flat', 'flat'] : ['round', 'round'];
    l.className = `block left ${faces[0]}`;
    r.className = `block right ${faces[1]}`;
  }

  async throwOnce() {
    await this.untilFree();
    this.result.innerHTML = '';
    this.blocks.classList.remove('tossing');
    void this.blocks.offsetWidth;
    this.blocks.classList.add('tossing');
    const started = performance.now();
    const res = await this.controller.act('throw');
    await wait(Math.max(0, 900 - (performance.now() - started)));
    this.blocks.classList.remove('tossing');
    if (!res.ok) {
      this.result.textContent = '現在還不能擲筊，請稍候再試。';
      return -1;
    }
    this.setFaces(res.jiao);
    this.sound.clack();
    const j = JIAO_TEXT[res.jiao];
    this.result.innerHTML = `<b class="${j.tone}"></b><span></span>`;
    this.result.querySelector('b').textContent = j.name;
    this.result.querySelector('span').textContent = j.desc;
    this.hud.markDone('throw');
    return res.jiao;
  }

  async untilFree() {
    while (this.controller.status().busy) await wait(120);
  }

  async simpleThrow() {
    const r = await this.throwOnce();
    if (r < 0) return this.buttons([['再試一次', () => this.simpleThrow()]]);
    this.buttons([['再擲一次', () => this.simpleThrow(), true], ['完成', () => this.close()]]);
  }

  async ask() {
    const r = await this.throwOnce();
    if (r === 0) {
      this.hint.textContent = '神明應允，可以搖籤筒抽一支籤。';
      this.buttons([['搖籤筒', () => this.draw()]]);
    } else {
      this.hint.textContent = '可以再請示一次；若一直沒有聖筊，也可以改日再求。';
      this.buttons([['再請示一次', () => this.ask()], ['今天先到這裡', () => this.close(), true]]);
    }
  }

  async draw() {
    await this.untilFree();
    this.blocks.hidden = true;
    this.tube.hidden = false;
    this.tube.classList.remove('out');
    this.tube.classList.add('shaking');
    this.sound.rattle();
    const res = await this.controller.act('draw');
    await wait(1700);
    this.tube.classList.remove('shaking');
    if (!res.ok) {
      this.result.textContent = '現在還不能抽籤，請稍候再試。';
      return this.buttons([['再試一次', () => this.draw()]]);
    }
    this.tube.classList.add('out');
    this.lot = Math.max(1, Math.min(FORTUNES.length, Math.floor(Number(res.lot)) || 1));
    this.hud.markDone('draw');
    this.result.innerHTML = '<b></b><span>擲筊確認是不是這一支。</span>';
    this.result.querySelector('b').textContent = `第 ${this.lot} 籤`;
    this.hint.textContent = '抽出的籤要再請示神明，得到聖筊才算數。';
    this.buttons([['擲筊確認', () => this.confirm()]]);
  }

  async confirm() {
    this.tube.hidden = true;
    this.blocks.hidden = false;
    const r = await this.throwOnce();
    if (r === 0) {
      this.receive(this.lot);
    } else {
      this.hint.textContent = '不是這一支，請重新抽籤。';
      this.buttons([['重新抽籤', () => this.draw()]]);
    }
  }

  // The stick is confirmed: show its poem with the closing buttons.
  receive(n) {
    this.showFortune(n);
    this.buttons([['看全部籤詩', () => { this.close(); this.onBrowse?.(); }, true], ['收下籤詩', () => this.close()]]);
  }

  showFortune(n) {
    this.qField.hidden = true;
    this.fortune.hidden = false;
    const f = renderFortune(this.fortune, n);
    this.hint.textContent = '';
    this.result.innerHTML = '';
    this.lastFortune = { n, ...f };
  }
}
