// 籤詩一覽: browse every fortune poem, like the numbered drawers of a
// temple's lot cabinet. Also exports the shared poem renderer.
import { FORTUNES } from './fortunes.js';

const LEVELS = [...new Set(FORTUNES.map((f) => f.level))];
const NOTE = '本站原創籤詩，僅供參考與娛樂；重要的決定，請多方考量、與信任的人商量。';

// Fill `el` with lot n (1-based): heading, vertical poem, meaning, note.
export function renderFortune(el, n) {
  const f = FORTUNES[(n - 1) % FORTUNES.length];
  el.innerHTML = '<div class="head"></div><div class="poem"></div><div class="meaning"></div><p class="fine"></p>';
  el.querySelector('.head').textContent = `第 ${n} 籤・${f.level}・${f.title}`;
  // Traditional layout: one column per line, read right to left. Built from
  // single characters so it renders the same with every font.
  const poem = el.querySelector('.poem');
  for (const line of f.lines) {
    const col = document.createElement('div');
    col.className = 'col';
    for (const ch of line) {
      const span = document.createElement('span');
      span.textContent = ch;
      col.appendChild(span);
    }
    poem.appendChild(col);
  }
  poem.setAttribute('role', 'img');
  poem.setAttribute('aria-label', f.lines.join('，'));
  el.querySelector('.meaning').textContent = `解曰：${f.meaning}`;
  el.querySelector('.fine').textContent = NOTE;
  return f;
}

export class LotsBook {
  constructor({ root, getDrawn }) {
    this.root = root;
    this.getDrawn = getDrawn;
    this.filter = '';
    this.current = 1;
    this.filters = root.querySelector('.lot-filters');
    this.grid = root.querySelector('.lot-grid');
    this.detail = root.querySelector('.fortune');
    this.prevBtn = root.querySelector('[data-step="-1"]');
    this.nextBtn = root.querySelector('[data-step="1"]');

    for (const level of ['', ...LEVELS]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip-btn';
      b.dataset.level = level;
      b.textContent = level ? `${level}（${FORTUNES.filter((f) => f.level === level).length}）` : `全部（${FORTUNES.length}）`;
      b.addEventListener('click', () => this.setFilter(level));
      this.filters.appendChild(b);
    }
    this.tiles = FORTUNES.map((f, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lot-tile';
      b.dataset.level = f.level;
      b.innerHTML = '<b></b><small></small>';
      b.querySelector('b').textContent = i + 1;
      b.querySelector('small').textContent = f.level;
      b.setAttribute('aria-label', `第 ${i + 1} 籤，${f.level}，${f.title}`);
      b.addEventListener('click', () => this.select(i + 1, true));
      this.grid.appendChild(b);
      return b;
    });
    this.prevBtn.addEventListener('click', () => this.step(-1));
    this.nextBtn.addEventListener('click', () => this.step(1));
    // Arrow keys flip through lots without walking the avatar.
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      e.stopPropagation();
      this.step(e.key === 'ArrowRight' ? 1 : -1);
    });
    this.setFilter('');
  }

  // Called each time the modal opens: jump to the lot drawn today, if any.
  open() {
    const drawn = this.getDrawn();
    this.tiles.forEach((t, i) => t.classList.toggle('drawn', i + 1 === drawn));
    if (drawn) {
      if (this.filter && FORTUNES[drawn - 1].level !== this.filter) this.setFilter('');
      this.select(drawn);
    }
  }

  visible() {
    const out = [];
    FORTUNES.forEach((f, i) => { if (!this.filter || f.level === this.filter) out.push(i + 1); });
    return out;
  }

  setFilter(level) {
    this.filter = level;
    for (const b of this.filters.children) b.setAttribute('aria-pressed', String(b.dataset.level === level));
    this.tiles.forEach((t) => { t.hidden = !!level && t.dataset.level !== level; });
    const list = this.visible();
    this.select(list.includes(this.current) ? this.current : list[0]);
  }

  select(n, scroll = false) {
    this.current = n;
    this.tiles.forEach((t, i) => t.setAttribute('aria-pressed', String(i + 1 === n)));
    renderFortune(this.detail, n);
    const drawn = this.getDrawn();
    this.detail.classList.toggle('drawn', n === drawn);
    const list = this.visible();
    const at = list.indexOf(n);
    this.prevBtn.disabled = at <= 0;
    this.nextBtn.disabled = at >= list.length - 1;
    if (scroll) this.detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  step(d) {
    const list = this.visible();
    const n = list[list.indexOf(this.current) + d];
    if (n) {
      this.select(n);
      this.tiles[n - 1].focus({ preventScroll: true });
    }
  }
}
