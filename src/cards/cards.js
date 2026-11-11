/*
 * Cards: the flashcard module of Term Compass.
 *
 * Cards are generated from your notes, never stored separately:
 *   - 「## 术语表」 tables      → front = 第一列, back = 其余列
 *   - 「## 自测题」 list items   → front = 题目, back = 回笔记自己核对（没有标准答案）
 *   - any line `问题 :: 答案`   → a custom card
 * Only the review schedule (simplified SM-2) lives in this plugin's data.json,
 * keyed by a hash of file name + card text. Editing a card's text makes it new.
 *
 * New cards come only from the exam decks and this week's lecture notes, because
 * memorising only pays where the assessment is closed book. A card already started
 * keeps coming back wherever it is from, and other decks stay available from their
 * own 复习 button. 自测题 have no answer in the note, so the
 * back shows the passage of the guide that best matches the question.
 *
 * Layout of this file: utils → card parser → scheduler → renderers → plugin.
 */

const VIEW_TYPE = 'term-compass-cards';
// Folders and the course root follow the dashboard unless set here.
const DEFAULT_SETTINGS = {
  sourceRoots: '',           // empty: the dashboard's course folder and English folder
  courseRoot: '',
  newPerDay: 10,
  reverseTerms: false,
  focusDecks: '',
};
const MASTERED_DAYS = 21;
const AGAIN_MINUTES = 10;
const RATINGS = [['again', '忘了'], ['hard', '模糊'], ['good', '记得'], ['easy', '很熟']];
const DAY_MS = 864e5;

/* ───────────────────────────── utils ───────────────────────────── */

const pad = (n) => String(n).padStart(2, '0');
const dkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

function h(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

function hash(str) {
  let a = 0x811c9dc5, b = 0x01000193;
  for (let i = 0; i < str.length; i++) { a = Math.imul(a ^ str.charCodeAt(i), 16777619); b = Math.imul(b ^ str.charCodeAt(i), 2246822519); }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36);
}

function stripMd(t) {
  return t.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]#]+)(#[^\]]*)?\]\]/g, '$1').replace(/\\\|/g, '|').trim();
}

/* ───────────────────────────── card parser ───────────────────────────── */

function courseOf(path, courseRoot) {
  if (path.startsWith(courseRoot + '/')) return path.slice(courseRoot.length + 1).split('/')[0];
  return (path.split('/')[0] || '其他').replace(/^\d+\s*/, '');
}

// Section names that hold cards, in the words students actually use.
const TERM_HEAD = /术语|概念|名词|glossary|key terms|terms|vocabulary|definitions/i;
const QUIZ_HEAD = /自测|复习题|思考题|练习题|self-?test|questions|quiz/i;

/** Parse one note into cards. Pure: (path, text, settings) → cards. */
function parseCards(path, text, settings) {
  const base = path.split('/').pop().replace(/\.md$/, '');
  const course = courseOf(path, settings.courseRoot);
  const cards = [];
  const push = (kind, front, back, heading) => {
    front = front.trim();
    if (!front) return;
    cards.push({ id: hash(`${base}|${kind}|${front}`), kind, front, back, path, base, course, heading });
  };
  const lines = text.split('\n');
  let sec = '', inCode = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) { inCode = !inCode; continue; }
    if (inCode) continue;
    const hm = line.match(/^#{2,3}\s+(.*)$/);
    if (hm) { sec = hm[1]; continue; }
    if (TERM_HEAD.test(sec) && line.startsWith('|') && !/^\|[\s:|-]+\|?\s*$/.test(line)) {
      const cells = splitRow(line).slice(1, -1).map((c) => stripMd(c));
      const isHeader = /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1] || '');
      if (cells.length < 2 || isHeader) continue;
      const back = cells.slice(1).filter(Boolean).join(' — ');
      push('term', cells[0], back, sec);
      if (settings.reverseTerms) push('term-rev', back, cells[0], sec);
      continue;
    }
    if (QUIZ_HEAD.test(sec)) {
      const qm = line.match(/^\s*(?:[-*]\s(?:\[[ xX]\]\s)?|\d+[.)、]\s*)(.+)$/);
      if (qm) { push('quiz', qm[1], null, sec); continue; }
    }
    const qa = line.match(/^(?!\s*[-*] \[)\s*(?:[-*]\s+)?(.+?)\s+::\s+(.+)$/);
    if (qa) push('qa', qa[1], qa[2], sec);
  }
  return cards;
}

/* ───────────────────────────── guide lookup ───────────────────────────── */

const NOT_AN_ANSWER = /术语|自测|超越|延伸|主线|思考/;
const MIN_SHARED_WORDS = 3;
const PASSAGE_CHARS = 700;

// Latin words plus every pair of adjacent CJK characters: enough to compare a question with a section.
function wordSet(text) {
  const out = new Set(text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) || []);
  for (const run of text.match(/[\u4e00-\u9fff]{2,}/g) || []) for (let i = 0; i + 1 < run.length; i++) out.add(run.slice(i, i + 2));
  return out;
}

function noteSections(text) {
  const out = [];
  let cur = null;
  for (const line of text.split('\n')) {
    const m = line.match(/^#{2,4}\s+(.*)$/);
    if (m) { cur = { heading: m[1], lines: [] }; out.push(cur); } else if (cur) cur.lines.push(line);
  }
  return out.filter((s) => !NOT_AN_ANSWER.test(s.heading)).map((s) => {
    const body = s.lines.join('\n').trim();
    return { heading: s.heading, body, words: wordSet(`${s.heading} ${body}`), title: wordSet(s.heading) };
  }).filter((s) => s.body);
}

function firstParagraphs(body) {
  const kept = [];
  let size = 0;
  const parts = body.split(/\n\s*\n/);
  for (const p of parts) {
    kept.push(p);
    size += p.length;
    if (size >= PASSAGE_CHARS) break;
  }
  const text = kept.join('\n\n');
  return { text: text.length > PASSAGE_CHARS * 1.6 ? text.slice(0, PASSAGE_CHARS * 1.6) : text, cut: kept.length < parts.length };
}

/**
 * The section of a note that best answers a question, or null when too few words
 * are shared to say. Rare words count more, and words in the section title double.
 */
function relatedSection(question, text) {
  const asked = [...wordSet(question)];
  const secs = noteSections(text);
  const spread = Object.fromEntries(asked.map((w) => [w, secs.filter((s) => s.words.has(w)).length]));
  let best = null, top = 0;
  for (const s of secs) {
    const shared = asked.filter((w) => s.words.has(w));
    const score = shared.reduce((a, w) => a + Math.log(1 + secs.length / spread[w]) * (s.title.has(w) ? 2 : 1), 0);
    if (shared.length >= MIN_SHARED_WORDS && score > top) { top = score; best = s; }
  }
  return best ? Object.assign({ heading: best.heading }, firstParagraphs(best.body)) : null;
}

/* ───────────────────────────── scheduler ───────────────────────────── */

/** Simplified SM-2. state = {due, interval (days), ease, reps, lapses}. */
function schedule(state, rating, now) {
  const s = Object.assign({ interval: 0, ease: 2.5, reps: 0, lapses: 0 }, state || {});
  if (rating === 'again') {
    s.lapses++; s.reps = 0; s.interval = 0; s.ease = Math.max(1.3, s.ease - 0.2);
    s.due = now + AGAIN_MINUTES * 60000;
    return s;
  }
  if (rating === 'hard') { s.interval = Math.max(1, Math.round(s.interval * 1.2)); s.ease = Math.max(1.3, s.ease - 0.15); }
  if (rating === 'good') s.interval = s.reps === 0 ? 1 : s.reps === 1 ? 3 : Math.round(s.interval * s.ease);
  if (rating === 'easy') { s.interval = s.reps === 0 ? 4 : Math.round(Math.max(s.interval, 1) * s.ease * 1.3); s.ease += 0.15; }
  s.reps++;
  s.due = startOfDay(now) + s.interval * DAY_MS + 4 * 3600000;
  return s;
}

function fmtInterval(state) {
  if (!state.interval) return `${AGAIN_MINUTES} 分钟`;
  if (state.interval < 30) return `${state.interval} 天`;
  return `${Math.round(state.interval / 30)} 个月`;
}

function deckStats(cards, states, now) {
  const st = { total: cards.length, due: 0, fresh: 0, mastered: 0 };
  for (const c of cards) {
    const s = states[c.id];
    if (!s) st.fresh++;
    else { if (s.due <= now) st.due++; if (s.interval >= MASTERED_DAYS) st.mastered++; }
  }
  return st;
}

/** Cards for the daily review: the exam decks, this week's notes, and anything already started. No exam decks set means everything. */
function scopeCards(cards, focusDecks, week, states) {
  const focus = new Set(String(focusDecks || '').split(/[,，\s]+/).filter(Boolean));
  return focus.size ? cards.filter((c) => focus.has(c.course) || week.has(c.base) || (states && states[c.id])) : cards;
}

// One from this week, one from the rest: the week's lecture must not crowd out the exam deck.
function alternate(a, b) {
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) { if (i < a.length) out.push(a[i]); if (i < b.length) out.push(b[i]); }
  return out;
}

function buildQueue(cards, states, now, newLeft, week) {
  const due = cards.filter((c) => states[c.id] && states[c.id].due <= now).sort((a, b) => states[a.id].due - states[b.id].due);
  const fresh = cards.filter((c) => !states[c.id]);
  const thisWeek = (c) => !!week && week.has(c.base);
  return due.concat(alternate(fresh.filter(thisWeek), fresh.filter((c) => !thisWeek(c))).slice(0, Math.max(0, newLeft)));
}


/* ───────────────────────────── renderers ───────────────────────────── */

const KIND_LABEL = { term: '术语', 'term-rev': '术语（反向）', quiz: '自测题', qa: '问答' };

function renderHome(root, s, view) {
  const now = Date.now();
  const all = deckStats(s.scope, s.states, now);
  const today = s.log[dkey(new Date())] || { reviews: 0, fresh: 0 };
  const newLeft = Math.max(0, s.settings.newPerDay - (today.fresh || 0));
  let streak = 0;
  for (let d = new Date(today.reviews ? Date.now() : Date.now() - DAY_MS); (s.log[dkey(d)] || {}).reviews; d = new Date(d - DAY_MS)) streak++;

  const head = h('div', 'rc-head', root);
  h('div', 'rc-title', head, '闪卡');
  h('div', 'rc-muted', head, s.scope.length < s.cards.length
    ? `新卡只来自 ${s.settings.focusDecks} 和本周这讲，学过的卡照常到期，其他课在下面单独复习`
    : '卡片来自笔记里的「术语表」和「自测题」，以及任何 `问题 :: 答案` 行');
  const stats = h('div', 'rc-stats', root);
  [['今天到期', all.due], ['今天可学新卡', Math.min(newLeft, all.fresh)], ['今天已复习', today.reviews || 0], ['连续复习', `${streak} 天`]].forEach(([l, v]) => {
    const t = h('div', 'rc-stat', stats); h('div', 'rc-muted', t, l); h('div', 'rc-num', t, String(v));
  });
  const go = h('button', 'rc-btn is-primary rc-go', root, all.due + Math.min(newLeft, all.fresh) ? `开始今天的复习（${all.due + Math.min(newLeft, all.fresh)} 张）` : '今天的卡都复习完了');
  go.disabled = !(all.due + Math.min(newLeft, all.fresh));
  go.onclick = () => view.start(null);

  const decks = {};
  for (const c of s.cards) (decks[c.course] = decks[c.course] || []).push(c);
  const list = h('div', 'rc-decks', root);
  for (const name of Object.keys(decks).sort()) {
    const ds = deckStats(decks[name], s.states, now);
    const row = h('div', 'rc-deck', list);
    const t = h('div', 'rc-grow', row);
    h('div', 'rc-deck-name', t, name);
    h('div', 'rc-muted', t, `${ds.total} 张 · 到期 ${ds.due} · 新卡 ${ds.fresh} · 已掌握 ${ds.mastered}`);
    const bar = h('div', 'rc-bar', t);
    h('div', 'rc-bar-fill is-mastered', bar).style.width = `${(ds.mastered / Math.max(1, ds.total)) * 100}%`;
    h('div', 'rc-bar-fill', bar).style.width = `${((ds.total - ds.fresh - ds.mastered) / Math.max(1, ds.total)) * 100}%`;
    const b = h('button', 'rc-btn', row, '复习');
    b.disabled = !(ds.due + Math.min(newLeft, ds.fresh));
    b.onclick = () => view.start(name);
  }
  if (!s.cards.length) h('div', 'rc-empty', list, '还没有找到卡片。在课程笔记里加一个「## 术语表」表格或「## 自测题」清单就会自动出现。');

  h('div', 'rc-label', root, '近 30 天复习量');
  const chart = h('div', 'rc-chart', root);
  const vals = [];
  for (let i = 29; i >= 0; i--) vals.push((s.log[dkey(new Date(Date.now() - i * DAY_MS))] || {}).reviews || 0);
  const mx = Math.max(10, ...vals);
  vals.forEach((v, i) => { const b = h('i', '', chart); b.style.height = `${Math.max(v ? 8 : 3, (v / mx) * 100)}%`; if (!v) b.classList.add('is-zero'); b.title = `${dkey(new Date(Date.now() - (29 - i) * DAY_MS))} · ${v} 张`; });
  h('div', 'rc-muted rc-legend', root, '绿色 = 已掌握（间隔 ≥ 21 天）· 蓝色 = 学习中 · 灰色 = 新卡');
}

function renderReview(root, s, view) {
  const card = view.queue[view.pos];
  const top = h('div', 'rc-review-top', root);
  h('a', 'rc-link', top, '← 返回').onclick = () => view.home();
  h('span', 'rc-muted', top, `${view.pos + 1} / ${view.queue.length}`);
  const prog = h('div', 'rc-bar is-thin', root); h('div', 'rc-bar-fill', prog).style.width = `${(view.pos / view.queue.length) * 100}%`;

  const box = h('div', 'rc-card', root);
  const meta = h('div', 'rc-card-meta', box);
  h('span', 'rc-pill', meta, card.course);
  h('span', 'rc-pill is-kind', meta, KIND_LABEL[card.kind]);
  if (!s.states[card.id]) h('span', 'rc-pill is-new', meta, '新');
  h('span', 'rc-muted rc-src', meta, card.base);
  view.renderMd(card.front, h('div', 'rc-front', box), card.path);

  if (!view.showBack) {
    h('button', 'rc-btn is-primary rc-show', root, '显示答案（空格）').onclick = () => view.flip();
    return;
  }
  h('div', 'rc-divider', box);
  if (card.back) view.renderMd(card.back, h('div', 'rc-back', box), card.path);
  else if (view.related) {
    h('div', 'rc-muted rc-related-label', box, `笔记里最相关的一段（自动匹配，可能不准）· ${view.related.heading}`);
    view.renderMd(view.related.text, h('div', 'rc-back rc-related', box), card.path);
    if (view.related.cut) h('div', 'rc-muted', box, '后面还有，打开笔记看全文');
  } else h('div', 'rc-back rc-muted', box, '自测题没有标准答案：先在脑子里或纸上答一遍，再回笔记核对，然后按你答得怎么样打分。');
  const open = h('a', 'rc-link', box, '打开笔记 →');
  open.onclick = () => view.actions.open(card.path);

  const btns = h('div', 'rc-rate', root);
  const now = Date.now();
  RATINGS.forEach(([r, label], i) => {
    const b = h('button', `rc-btn rc-rate-${r}`, btns);
    h('div', '', b, `${label}`);
    h('div', 'rc-muted', b, `${fmtInterval(schedule(s.states[card.id], r, now))} · ${i + 1}`);
    b.onclick = () => view.rate(r);
  });
}

function renderDone(root, s, view) {
  const box = h('div', 'rc-done', root);
  h('div', 'rc-done-icon', box, '✓');
  h('div', 'rc-title', box, '这一轮复习完了');
  const today = s.log[dkey(new Date())] || {};
  h('div', 'rc-muted', box, `今天一共复习 ${today.reviews || 0} 张，其中「忘了」${today.again || 0} 次。忘了的卡 ${AGAIN_MINUTES} 分钟后会再出现。`);
  h('button', 'rc-btn is-primary', box, '回到首页').onclick = () => view.home();
}

/* ───────────────────────────── plugin ───────────────────────────── */

class CardsView extends obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.mode = 'home'; this.queue = []; this.pos = 0; this.showBack = false; this.deck = null;
    this.actions = plugin.actions;
  }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return '闪卡'; }
  getIcon() { return 'layers'; }
  async onOpen() {
    this.registerDomEvent(window, 'keydown', (e) => this.onKey(e));
    await this.render();
  }
  onKey(e) {
    if (this.mode !== 'review' || this.app.workspace.getActiveViewOfType(CardsView) !== this) return;
    if (e.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (!this.showBack && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); this.flip(); return; }
    const i = ['1', '2', '3', '4'].indexOf(e.key);
    if (this.showBack && i >= 0) { e.preventDefault(); this.rate(RATINGS[i][0]); }
  }
  renderMd(md, el, path) { obsidian.MarkdownRenderer.render(this.app, md, el, path, this); }
  async start(deck) {
    const s = await this.plugin.state();
    const cards = deck ? s.cards.filter((c) => c.course === deck) : s.scope;
    const today = s.log[dkey(new Date())] || {};
    this.queue = buildQueue(cards, s.states, Date.now(), s.settings.newPerDay - (today.fresh || 0), s.week);
    this.pos = 0; this.showBack = false; this.deck = deck;
    this.mode = this.queue.length ? 'review' : 'done';
    this.render(s);
  }
  async flip() {
    this.related = await this.plugin.relatedFor(this.queue[this.pos]);
    this.showBack = true;
    this.render();
  }
  async rate(r) {
    const card = this.queue[this.pos];
    await this.plugin.record(card, r);
    if (r === 'again') this.queue.splice(Math.min(this.queue.length, this.pos + 4), 0, card);
    this.pos++; this.showBack = false;
    if (this.pos >= this.queue.length) this.mode = 'done';
    this.render();
  }
  home() { this.mode = 'home'; this.render(); }
  async render(state) {
    const s = state || await this.plugin.state();
    const root = this.contentEl;
    root.textContent = '';
    root.classList.add('rc-root');
    ({ home: renderHome, review: renderReview, done: renderDone })[this.mode](root, s, this);
  }
}

class CardsSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new obsidian.Setting(containerEl).setName('闪卡').setHeading();
    const save = async () => { await this.plugin.persist(); this.plugin.invalidate(); };
    new obsidian.Setting(containerEl).setName('卡片来源文件夹').setDesc('逗号分隔')
      .addText((t) => t.setValue(this.plugin.settings.sourceRoots).onChange(async (v) => { this.plugin.settings.sourceRoots = v; await save(); }));
    new obsidian.Setting(containerEl).setName('重点卡组').setDesc('课程代码，逗号分隔。新卡只来自这些课和本周这讲，学过的卡照常到期；留空就是全部')
      .addText((t) => t.setValue(this.plugin.settings.focusDecks).onChange(async (v) => { this.plugin.settings.focusDecks = v; await save(); }));
    new obsidian.Setting(containerEl).setName('每天新卡上限')
      .addText((t) => t.setValue(String(this.plugin.settings.newPerDay)).onChange(async (v) => { this.plugin.settings.newPerDay = Number(v) || 20; await save(); }));
    new obsidian.Setting(containerEl).setName('术语卡双向').setDesc('额外生成「看中文含义 → 想英文术语」的反向卡')
      .addToggle((t) => t.setValue(this.plugin.settings.reverseTerms).onChange(async (v) => { this.plugin.settings.reverseTerms = v; await save(); }));
  }
}

class CardsModule extends SubModule {
  async onload() {
    const saved = (await this.loadData()) || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved.settings || {});
    this.data = { states: saved.states || {}, log: saved.log || {} };
    this.actions = { open: (p) => this.app.workspace.openLinkText(p, '', false) };
    this.registerView(VIEW_TYPE, (leaf) => new CardsView(leaf, this));
    this.addRibbonIcon('layers', '闪卡', () => this.open());
    this.addCommand({ id: 'open-cards', name: '打开闪卡', callback: () => this.open() });
    this.addCommand({ id: 'review', name: '开始今天的闪卡复习', callback: async () => { const v = await this.open(); if (v) v.start(null); } });
    this.addSettingTab(new CardsSettingTab(this.app, this));
    for (const ev of ['create', 'modify', 'delete', 'rename']) this.registerEvent(this.app.vault.on(ev, () => this.invalidate()));
  }

  async persist() { await this.saveData({ settings: this.settings, states: this.data.states, log: this.data.log }); }

  // Any note change drops the card cache; an open home screen redraws so new cards show up right away.
  // A review in progress is left alone and picks up the new cards next round.
  invalidate() {
    this._cards = null;
    clearTimeout(this._t);
    this._t = setTimeout(() => {
      for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) if (leaf.view instanceof CardsView && leaf.view.mode === 'home') leaf.view.render();
    }, 1500);
  }

  async open() {
    const ws = this.app.workspace;
    let leaf = ws.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) { leaf = ws.getLeaf('tab'); await leaf.setViewState({ type: VIEW_TYPE, active: true }); }
    ws.revealLeaf(leaf);
    return leaf.view instanceof CardsView ? leaf.view : null;
  }

  async cards() {
    if (this._cards) return this._cards;
    const roots = this.roots();
    const out = [], seen = new Set();
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!roots.some((r) => f.path.startsWith(r + '/'))) continue;
      for (const c of parseCards(f.path, await this.app.vault.cachedRead(f), Object.assign({}, this.settings, { courseRoot: this.courseRoot() }))) {
        if (!seen.has(c.id)) { seen.add(c.id); out.push(c); }
      }
    }
    this._cards = out;
    return out;
  }

  // Notes linked under this week's lectures, as named by the dashboard.
  weekNotes() {
    const pulse = this.peer('pulse');
    return new Set(pulse && pulse.weekNotes ? pulse.weekNotes() : []);
  }

  // Where cards come from: this module's setting, or the dashboard's course and English folders.
  roots() {
    const own = String(this.settings.sourceRoots || '').split(/[,，]/).map((x) => x.trim()).filter(Boolean);
    if (own.length) return own;
    const ps = (this.peer('pulse') || {}).settings || {};
    return [ps.courseRoot, ps.englishRoot].filter(Boolean);
  }

  courseRoot() { return this.settings.courseRoot || ((this.peer('pulse') || {}).settings || {}).courseRoot || ''; }

  async state() {
    const cards = await this.cards(), week = this.weekNotes();
    return { cards, week, scope: scopeCards(cards, this.settings.focusDecks, week, this.data.states), states: this.data.states, log: this.data.log, settings: this.settings };
  }

  // For the 现在做什么 card on the dashboard.
  async summary() {
    const s = await this.state();
    const st = deckStats(s.scope, s.states, Date.now());
    const seen = (s.log[dkey(new Date())] || {}).fresh || 0;
    return { due: st.due, fresh: Math.min(st.fresh, Math.max(0, s.settings.newPerDay - seen)) };
  }

  async relatedFor(card) {
    if (card.back) return null;
    const f = this.app.vault.getAbstractFileByPath(card.path);
    return f instanceof obsidian.TFile ? relatedSection(card.front, await this.app.vault.cachedRead(f)) : null;
  }

  async record(card, rating) {
    const now = Date.now();
    const k = dkey(new Date());
    const day = this.data.log[k] || (this.data.log[k] = { reviews: 0, fresh: 0, again: 0 });
    if (!this.data.states[card.id]) day.fresh++;
    day.reviews++;
    if (rating === 'again') day.again++;
    this.data.states[card.id] = schedule(this.data.states[card.id], rating, now);
    await this.persist();
    this.app.workspace.trigger('term-compass:cards-change');
  }
}

CardsModule.__preview = { parseCards, schedule, fmtInterval, deckStats, buildQueue, scopeCards, relatedSection, renderHome, renderReview, renderDone, DEFAULT_SETTINGS };
return CardsModule;
