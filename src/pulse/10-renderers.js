function ring(parent, frac, size, color, label) {
  const r = size / 2 - 4, c = 2 * Math.PI * r;
  const svg = s('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}`, class: 'sp-ring' }, parent);
  s('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', class: 'sp-ring-track', 'stroke-width': 5 }, svg);
  s('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: color || 'var(--sp-accent)', 'stroke-width': 5, 'stroke-linecap': 'round',
    'stroke-dasharray': `${c * Math.max(0.001, frac)} ${c}`, transform: `rotate(-90 ${size / 2} ${size / 2})` }, svg);
  if (label != null) {
    const tx = s('text', { x: size / 2, y: size / 2 + 4, 'text-anchor': 'middle', class: 'sp-ring-label' }, svg);
    tx.textContent = label;
  }
  return svg;
}

function renderHeatmap(parent, model, view) {
  const metric = METRICS[view.metric];
  const activeDays = Object.keys(model.days).filter((k) => metric.get(model.days[k]) > 0).length;
  const weeks = view.heatWeeks || 26;
  const body = card(parent, '▦', '学习热力图', '每格一天 · 颜色强度按你近 90 天的分位数', `${activeDays} 天有记录`);
  const bar = h('div', 'sp-heat-bar', body);
  chips(bar, Object.entries(METRICS).map(([k, m]) => [k, m.label]), view.metric, (m) => view.set({ metric: m }), 'is-tabs');
  chips(bar, [[26, '半年'], [53, '一年']], weeks, (w) => view.set({ heatWeeks: w }), 'is-tabs');
  const end = model.now;
  const start = addDays(end, -((weeks - 1) * 7 + ((end.getDay() + 6) % 7)));
  const recent = rangeKeys(model, 90).map((k) => (model.days[k] ? metric.get(model.days[k]) : 0));
  const level = quantileLevels(recent);
  const readout = document.createElement('span');
  readout.textContent = '鼠标移到格子上看数值 · 描边浅格 = 历史估算 · 点击看当天明细';
  const C = weeks > 30 ? 11 : 15, G = 3, L = 22, T = 16;
  const svg = s('svg', { viewBox: `0 0 ${L + weeks * (C + G)} ${T + 7 * (C + G)}`, class: 'sp-heat' }, body);
  let lastMonth = -1, lastLabelW = -9;
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d);
      if (date > end) continue;
      const k = dkey(date);
      const day = model.days[k];
      const v = day ? metric.get(day) : 0;
      if (d === 0 && date.getMonth() !== lastMonth && (w - lastLabelW >= 3)) {
        lastMonth = date.getMonth(); lastLabelW = w;
        const t = s('text', { x: L + w * (C + G), y: 9, class: 'sp-axis' }, svg); t.textContent = `${lastMonth + 1}月`;
      }
      const rect = s('rect', { x: L + w * (C + G), y: T + d * (C + G), width: C, height: C, rx: 3,
        class: `sp-l${level(v)}${day && day.est ? ' is-est' : ''}${k === view.selectedDay ? ' is-sel' : ''}` }, svg);
      const tt = s('title', {}, rect); tt.textContent = `${k} 周${WEEKDAYS[date.getDay()]} · ${metric.label} ${metric.fmt(v)} ${metric.unit}${day && day.est ? '（估算）' : ''}`;
      rect.addEventListener('click', () => view.selectDay(k));
      rect.addEventListener('mouseenter', () => { readout.textContent = tt.textContent; });
    }
  }
  ['一', '三', '五'].forEach((t, i) => { const tx = s('text', { x: 0, y: T + (i * 2) * (C + G) + 9, class: 'sp-axis' }, svg); tx.textContent = t; });
  const foot = h('div', 'sp-legend-row', body);
  readout.className = 'sp-muted sp-heat-readout';
  foot.appendChild(readout);
  const lg = h('span', 'sp-legend', foot); h('span', 'sp-muted', lg, '少');
  for (let i = 0; i <= 4; i++) h('i', `sp-sw sp-l${i}`, lg);
  h('span', 'sp-muted', lg, '多');
}

const TOMATO = ['...gg...', '..gGGg..', '.rrggrr.', 'rRrrrrrr', 'rRrrrrrr', 'rrrrrrrr', '.rrrrrr.', '..rrrr..'];
function tomato(parent, filled) {
  const pal = filled ? { g: '#3c9a4a', G: '#5cc46d', r: '#e5533d', R: '#ffa596' } : { g: '#c6ccd6', G: '#d9dee6', r: '#dfe3ea', R: '#eef0f4' };
  const svg = s('svg', { viewBox: '0 0 8 8', class: 'sp-tomato' + (filled ? '' : ' is-empty'), 'shape-rendering': 'crispEdges' }, parent);
  TOMATO.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) s('rect', { x, y, width: 1, height: 1, fill: pal[ch] }, svg); }));
}

function renderPomodoro(parent, model, view) {
  const today = model.days[model.today] || emptyDay();
  const goal = +model.settings.pomodoroGoal || 8;
  const body = card(parent, '◷', '今天的番茄', `专注 ${model.settings.focusMinutes} 分钟 · 休息 ${model.settings.breakMinutes} 分钟`, `${today.poms || 0} / ${goal}`);
  const row = h('div', 'sp-pomo', body);
  const toms = h('div', 'sp-tomatoes', row);
  for (let i = 0; i < Math.max(goal, today.poms || 0); i++) tomato(toms, i < (today.poms || 0));
  const box = h('div', 'sp-pomo-box', row);
  const p = model.pomo || { mode: 'idle' };
  const tag = p.paused ? '已暂停' : { idle: '准备', focus: '专注中', break: '短休' }[p.mode];
  h('div', 'sp-pill' + (p.mode === 'break' ? ' is-green' : p.mode === 'focus' ? ' is-orange' : ''), box, tag);
  const left = p.mode === 'idle' ? model.settings.focusMinutes * 60000 : pomoLeft(p, Date.now());
  const time = h('div', 'sp-pomo-time', box, fmtClock(left));
  time.dataset.spPomo = '1';
  h('div', 'sp-muted', box, { idle: '选一件事，开始 25 分钟', focus: '只做这一件事', break: '离开屏幕，站起来走走' }[p.mode]);
  const btns = h('div', 'sp-pomo-btns', row);
  if (p.mode === 'idle') h('button', 'sp-btn is-primary', btns, '开始专注').onclick = () => view.actions.pomoStart();
  if (p.mode !== 'idle') h('button', 'sp-btn is-primary', btns, p.paused ? '继续' : '暂停').onclick = () => view.actions.pomoToggle();
  if (p.mode === 'focus') h('button', 'sp-btn', btns, '放弃这个').onclick = () => view.actions.pomoStop();
  if (p.mode === 'break') h('button', 'sp-btn', btns, '跳过休息').onclick = () => view.actions.pomoStop();
  h('div', 'sp-muted sp-mt', body, `今天专注 ${studyMin(today)} 分钟（番茄 ${today.focus || 0} · 听课 ${today.lecture || 0} · 阅读 ${today.readMin || 0}）`);
}

function renderDay(parent, model, view) {
  const k = view.selectedDay || model.today;
  // A day with nothing recorded is only an estimate gap if it is before today.
  const d = model.days[k] || Object.assign(emptyDay(), { score: 0, est: k < model.today, none: true });
  const date = parseKey(k);
  const recent = rangeKeys(model, 90).map((x) => (model.days[x] ? model.days[x].score : 0)).filter((v) => v > 0).sort((a, b) => a - b);
  const pct = recent.length ? Math.round((recent.filter((v) => v <= d.score).length / recent.length) * 100) : 0;
  const body = card(parent, '☰', `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 明细`,
    d.none ? '这天还没有记录' : `${d.est ? '历史估算' : '真实记录'} · 强度第 ${pct}% 分位`, `${fmt1(d.score)} 分`);
  const top = h('div', 'sp-day-top', body);
  const left = h('div', '', top);
  h('div', 'sp-label', left, '贡献得分');
  const big = h('div', 'sp-big is-md', left); big.textContent = fmt1(d.score); h('span', 'sp-unit', big, ' 分');
  const parts = scoreParts(d, k);
  const stack = h('div', 'sp-stack', left);
  parts.forEach(([, v, c]) => { const seg = h('div', '', stack); seg.style.flex = v; seg.style.background = c; });
  const lg = h('div', 'sp-legend-inline', left);
  parts.forEach(([n, v, c]) => { const it = h('span', '', lg); h('i', 'sp-dot', it).style.background = c; it.appendChild(document.createTextNode(`${n} ${fmt1(v)}`)); });

  const right = h('div', '', top);
  const peak = d.hours.indexOf(Math.max(...d.hours));
  h('div', 'sp-label', right, d.est ? '当天节奏（实测后可见）' : `当天节奏 · 高峰 ${peak} 点 · ${d.hours.filter((x) => x > 0).length} 个小时有活动`);
  const svg = s('svg', { viewBox: '0 0 240 60', class: 'sp-hours' }, right);
  const mx = Math.max(1, ...d.hours);
  d.hours.forEach((v, i) => { if (v) s('rect', { x: i * 10 + 2, y: 46 - (v / mx) * 40, width: 6, height: (v / mx) * 40, rx: 1.5, fill: 'var(--sp-accent)' }, svg); });
  s('line', { x1: 0, x2: 240, y1: 46.5, y2: 46.5, class: 'sp-baseline' }, svg);
  [0, 6, 12, 18, 24].forEach((t) => { const tx = s('text', { x: Math.min(236, t * 10 + 2), y: 58, class: 'sp-axis' }, svg); tx.textContent = t; });

  const tiles = h('div', 'sp-tiles', body);
  [['✎', '手写新增', `+${fmtInt(d.words)}`, '词'], ['⎘', '粘贴和工具写入', `+${fmtInt(d.pasted || 0)}`, '词'], ['▣', '新建笔记', d.notes, '篇'], ['✐', '有效编辑会话', d.edits, '次'],
    ['☑', '完成任务', d.tasks, '项'], ['⌘', '编辑活跃时长', d.activeMin || 0, '分钟'], ['◷', '番茄专注', d.focus || 0, '分钟'], ['♪', '听课', d.lecture || 0, '分钟'], ['☷', '阅读', d.readMin || 0, '分钟'],
    ['✦', '英语阅读', d.reading || 0, '篇'], ['❏', '闪卡复习', d.reviews || 0, '张']].forEach(([ic, lbl, v, u]) => {
    const t = h('div', 'sp-mini', tiles); h('div', 'sp-mini-icon', t, ic);
    const tx = h('div', '', t); h('div', 'sp-muted', tx, lbl);
    const n = h('div', 'sp-mono sp-strong', tx, String(v)); h('span', 'sp-unit', n, ' ' + u);
  });

  if (d.sessions && d.sessions.length) {
    h('div', 'sp-label sp-mt', body, '当日专注');
    d.sessions.forEach((x) => { const r = h('div', 'sp-list-row', body); h('span', 'sp-mono', r, `${x.time}  ${x.min} 分钟`); h('span', 'sp-muted', r, '番茄'); });
  }
  const files = Object.entries(d.files || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (files.length) {
    h('div', 'sp-label sp-mt', body, '当日有贡献的笔记');
    const mx2 = Math.max(1, ...files.map((f) => f[1]));
    files.forEach(([p, w]) => {
      const r = h('div', 'sp-file-row', body);
      const a = h('a', 'sp-link', r, p.replace(/\.md$/, '')); a.onclick = () => view.actions.open(p);
      const fst = (d.fileStats || {})[p];
      h('span', 'sp-muted', r, `${(d.created || []).includes(p) ? '新建' : '编辑'} · +${fmtInt(w)}词${fst && fst.p ? `（粘贴 ${fmtInt(fst.p)}）` : ''}`);
      h('div', 'sp-file-bar', r).style.width = `${(w / mx2) * 100}%`;
    });
  }
}

const LECTURE_TEXT = { done: '已完成', doing: '进行中', attended: '已上', week: '本周', overdue: '待补', future: '还没到' };
const mdd = (d) => `${d.getMonth() + 1}-${pad(d.getDate())}`;

function renderCourses(parent, model, view) {
  const body = card(parent, '❖', '课程进度', '上过、并看过这讲链接的笔记或课件，自动完成；点小方块或展开讲次表可以手动打勾', `${model.courses.length} 门`);
  view.expanded = view.expanded || {};
  const grid = h('div', 'sp-course-grid', body);
  for (const c of model.courses) {
    const el = h('div', 'sp-course' + (view.expanded[c.code] ? ' is-expanded' : ''), grid);
    el.style.setProperty('--c', c.color);
    const top = h('div', 'sp-row', el);
    ring(top, c.progress, 54, c.color, `${Math.round(c.progress * 100)}%`);
    const t = h('div', 'sp-grow', top);
    const name = h('a', 'sp-course-name', t, c.code);
    if (c.home) name.onclick = () => view.actions.open(c.home.path);
    if (c.items.length) {
      const line = h('div', 'sp-muted', t, `完成 ${c.sDone} / ${c.items.length}`);
      if (c.sAttended) h('span', '', line, ` · 已上 ${c.sAttended}`);
      if (c.overdue) h('span', 'sp-overdue', line, ` · 待补 ${c.overdue}`);
    } else h('div', 'sp-muted', t, '课程主页还没有「第 N 讲」标题或带「状态」列的讲次表');
    h('div', 'sp-muted', t, `${c.notes} 篇笔记 · 讲次链接 ${c.guides} 篇`);
    if (c.items.length) {
      const sq = h('div', 'sp-lectures', el);
      for (const it of c.items) {
        const b = h('button', `sp-lec is-${it.status}${it.auto ? ' is-auto' : ''}`, sq, String(it.n));
        b.title = `${it.label}\n${it.estimated ? '约 ' : ''}${mdd(it.due)} · ${LECTURE_TEXT[it.status]}${it.auto ? '（自动：读过这讲的笔记）' : ''}${it.guides ? ` · 链接 ${it.guides} 篇笔记` : ''}\n点一下：${it.done ? '标为未完成' : '标为完成'}`;
        b.onclick = (e) => { e.stopPropagation(); view.actions.toggleLecture(c.code, it); };
      }
    }
    if (c.current || c.next) {
      const box = h('div', 'sp-steps', el);
      if (c.current) {
        const r = h('div', 'sp-step is-doing', box);
        h('span', 'sp-step-tag', r, c.current.done ? '✓ 本周' : '▶ 本周');
        h('span', 'sp-step-text', r, c.current.label);
      }
      if (c.next) { const r = h('div', 'sp-step', box); h('span', 'sp-step-tag', r, '○ 下一步'); h('span', 'sp-step-text', r, `${c.next.label}${c.next.estimated ? `（约 ${mdd(c.next.due)}）` : ''}`); }
    }
    const svg = s('svg', { viewBox: '0 0 140 26', class: 'sp-spark' }, el);
    const mx = Math.max(1, ...c.spark);
    c.spark.forEach((v, i) => s('rect', { x: i * 10, y: 24 - Math.max(v ? 3 : 1, (v / mx) * 22), width: 7, height: Math.max(v ? 3 : 1, (v / mx) * 22), rx: 1.5, fill: v ? c.color : 'var(--sp-empty)' }, svg));
    const foot = h('div', 'sp-course-foot', el);
    if (c.items.length) {
      const tg = h('a', 'sp-link sp-small', foot, view.expanded[c.code] ? '收起讲次表 ▴' : '讲次表 ▾');
      tg.onclick = (e) => { e.stopPropagation(); view.expanded[c.code] = !view.expanded[c.code]; view.refresh(); };
    }
    if (c.last) { const l = h('a', 'sp-link sp-small sp-ellipsis', foot, `最近：${c.last.path.split('/').pop().replace(/\.md$/, '')}`); l.onclick = () => view.actions.open(c.last.path); }
    if (view.expanded[c.code]) {
      const tbl = h('div', 'sp-lec-table', el);
      for (const it of c.items) {
        const row = h('label', `sp-lec-row is-${it.status}`, tbl);
        const cb = h('input', '', row); cb.type = 'checkbox'; cb.checked = it.done;
        cb.onchange = () => view.actions.toggleLecture(c.code, it);
        h('span', 'sp-lec-label', row, it.label.replace(/\s*·\s*\d{1,2}-\d{1,2}\s*$/, ''));
        h('span', 'sp-muted sp-small sp-mono', row, `${it.estimated ? '约' : ''}${mdd(it.due)}`);
        h('span', 'sp-lec-guide', row, it.guides ? `📖${it.guides}` : '');
        h('span', `sp-lec-chip is-${it.status}`, row, it.auto ? '自动完成' : LECTURE_TEXT[it.status]);
      }
    }
  }
}

function renderDeadlines(parent, model, view) {
  const limit = view.compact ? 4 : 8;
  const items = view.dlOpen ? model.deadlines : model.deadlines.slice(0, limit);
  const body = card(parent, '⚑', '倒计时', '来自学期总览的「关键日期」表', `${model.deadlines.length} 项`);
  if (!items.length) { h('div', 'sp-muted', body, '没有找到未来的日期。'); return; }
  const list = h('div', 'sp-deadlines', body);
  const today0 = new Date(model.now.getFullYear(), model.now.getMonth(), model.now.getDate());
  for (const d of items) {
    const days = Math.round((new Date(d.due.getFullYear(), d.due.getMonth(), d.due.getDate()) - today0) / 864e5);
    const row = h('div', 'sp-dl' + (days <= 3 ? ' is-hot' : days <= 14 ? ' is-warm' : ''), list);
    const n = h('div', 'sp-dl-days', row); h('div', 'sp-mono', n, days === 0 ? '今天' : String(days)); if (days) h('div', 'sp-small', n, d.fuzzy ? '天左右' : '天');
    const t = h('div', 'sp-grow', row);
    h('div', 'sp-dl-title' + (d.important ? ' sp-strong' : ''), t, d.title);
    h('div', 'sp-muted sp-small', t, `${d.raw}${d.course ? ' · ' + d.course : ''}`);
  }
  if (model.deadlines.length > limit) {
    const more = h('a', 'sp-link sp-small sp-mt sp-dl-more', body, view.dlOpen ? '收起' : `还有 ${model.deadlines.length - limit} 项 ▾`);
    more.onclick = () => { view.dlOpen = !view.dlOpen; view.refresh(); };
  }
  const open = h('a', 'sp-link sp-small sp-mt', body, '打开总调度表 →');
  open.onclick = () => view.actions.open(model.settings.scheduleFile);
}

function renderWeek(parent, model, view) {
  const w = model.week;
  const body = card(parent, '✓', '本周清单', `${w.label} · ${mdd(w.start)} → ${mdd(w.end)} · 每周一自动换`, w.total ? `${w.done} / ${w.total}` : '');
  if (w.total) { const bar = h('div', 'sp-bar is-thick', body); h('div', 'sp-bar-fill', bar).style.width = `${(w.done / w.total) * 100}%`; }
  if (w.deadlines.length) {
    const box = h('div', 'sp-wk-dl', body);
    for (const d of w.deadlines) { const r = h('div', 'sp-wk-dl-row', box); h('span', 'sp-mono', r, `⚑ ${mdd(d.due)}`); h('span', '', r, d.title); }
  }
  if (w.milestones.length) {
    h('div', 'sp-label sp-mt', body, '考核节点');
    for (const m of w.milestones) {
      const row = h('label', 'sp-task' + (m.done ? ' is-done' : ''), body);
      const cb = h('input', '', row); cb.type = 'checkbox'; cb.checked = m.done;
      cb.onchange = () => view.actions.toggleNoteTask(m);
      h('span', 'sp-grow', row, `${m.code} · ${m.text}`);
      h('span', 'sp-muted sp-small sp-nowrap' + (m.status === 'overdue' ? ' sp-hot' : ''), row, m.status === 'overdue' ? `逾期 ${-m.left} 天` : m.status === 'upcoming' ? `${mdd(m.start)} 开始` : `${mdd(m.end)} 前`);
    }
  }
  for (const g of w.groups) {
    const grp = h('div', 'sp-wk-group', body);
    grp.style.setProperty('--c', g.color);
    const head = h('div', 'sp-wk-head', grp);
    h('span', 'sp-wk-code', head, g.code);
    const lt = h('a', 'sp-wk-lec', head, g.lec.label);
    lt.onclick = () => view.actions.openCourse(g.code);
    if (g.lec.done) h('span', 'sp-lec-chip is-done', head, g.lec.auto ? '自动完成' : '已完成');
    if (!g.lec.tasks.length) { h('div', 'sp-muted sp-small sp-wk-empty', grp, '这一讲还没有阅读清单（在课程主页这一讲下面加 `- [ ]` 就会出现在这里）'); continue; }
    // Readings stay folded and uncounted; open them when you sit down to read. ⭐ first.
    view.wkOpen = view.wkOpen || {};
    const fold = h('a', 'sp-link sp-small', grp, view.wkOpen[g.code] ? '收起阅读' : `阅读 ${g.lec.tasks.length} 项 ▾`);
    fold.onclick = () => { view.wkOpen[g.code] = !view.wkOpen[g.code]; view.refresh(); };
    if (!view.wkOpen[g.code]) continue;
    const ordered = g.lec.tasks.slice().sort((x, y) => (x.done - y.done) || ((/^⭐/.test(y.text) ? 1 : 0) - (/^⭐/.test(x.text) ? 1 : 0)));
    for (const tk of ordered) {
      const row = h('label', 'sp-task' + (tk.done ? ' is-done' : ''), grp);
      const cb = h('input', '', row); cb.type = 'checkbox'; cb.checked = tk.done;
      cb.onchange = () => view.actions.toggleCourseTask(g.code, tk);
      h('span', '', row, tk.text);
    }
  }
  if (!w.groups.length) h('div', 'sp-muted', body, '这周没有排课（课程主页里没有落在本周的讲次）。');
  if (w.toRead.length) {
    const od = h('div', 'sp-wk-overdue', body);
    h('div', 'sp-label', od, `待读 ${w.toRead.length} 讲 · 这讲链接的笔记或课件看满 ${READ_MINUTES} 分钟自动完成`);
    for (const o of w.toRead) {
      const r = h('div', 'sp-wk-od-row', od); r.style.setProperty('--c', o.color);
      h('span', 'sp-wk-code', r, o.code);
      h('a', 'sp-grow sp-link', r, o.it.label).onclick = () => view.actions.open(o.it.guideLink);
      h('button', 'sp-chip', r, '标为完成').onclick = () => view.actions.toggleLecture(o.code, o.it);
    }
  }
  if (w.overdue.length) {
    const od = h('div', 'sp-wk-overdue', body);
    h('div', 'sp-label', od, `待补 ${w.overdue.length} 讲`);
    for (const o of w.overdue) {
      const r = h('div', 'sp-wk-od-row', od); r.style.setProperty('--c', o.color);
      h('span', 'sp-wk-code', r, o.code); h('span', 'sp-grow', r, o.it.label);
      h('button', 'sp-chip', r, '标为完成').onclick = () => view.actions.toggleLecture(o.code, o.it);
    }
  }
  const m = w.manual;
  if (m.tasks.length && !w.stale) {
    h('div', 'sp-label sp-mt', body, '我加的（总调度表）');
    for (const t of m.tasks) {
      const row = h('label', 'sp-task' + (t.done ? ' is-done' : ''), body);
      const cb = h('input', '', row); cb.type = 'checkbox'; cb.checked = t.done;
      cb.onchange = () => view.actions.toggleTask(t);
      h('span', '', row, t.text);
    }
  } else if (m.tasks.length && w.stale) {
    const a = h('a', 'sp-link sp-small sp-mt', body, `总调度表里的「本周」还是「${m.heading.replace(/^\d+\.\s*/, '').replace(/▶️/g, '').trim()}」，已隐藏 · 打开改一下 →`);
    a.onclick = () => view.actions.open(model.settings.scheduleFile);
  }
}


