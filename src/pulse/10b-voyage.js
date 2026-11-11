/* ───────────────────────────── semester voyage ─────────────────────────────
 * The whole term on one line: a column per Monday week, a row per course with
 * its lectures, and flags for deadlines, exams and plan milestones.
 */

const EXAM = /考试|exam|test|测验|期中|期末|midterm|final/i;

function voyage(model) {
  const t = termFor(model.now);
  const first = monday(t.start);
  const weeks = Math.max(1, Math.min(40, Math.round((monday(t.end) - first) / 6048e5) + 1));
  const weekOf = (d) => Math.round((monday(d) - first) / 6048e5);
  const nowIdx = weekOf(model.now);
  const cols = Array.from({ length: weeks }, (_, i) => ({ i, n: i + 1, start: addDays(first, i * 7), now: i === nowIdx, past: i < nowIdx }));
  const inTerm = (w) => w >= 0 && w < weeks;
  const rows = model.courses.map((c) => ({ code: c.code, color: c.color,
    marks: c.items.map((it) => ({ w: weekOf(it.due), n: it.n, status: it.status, label: it.label, it })).filter((m) => inTerm(m.w)) }));
  const flags = [];
  let after = 0;
  const flag = (due, kind, title, code) => { const w = weekOf(due); if (inTerm(w)) flags.push({ w, kind, title, code, due }); else if (w >= weeks) after++; };
  for (const d of model.allDeadlines || []) flag(d.due, EXAM.test(d.title) ? 'exam' : 'deadline', d.title, d.course);
  for (const m of model.milestones || []) if (!m.done) flag(m.end, 'milestone', m.text, m.code);
  return { weeks, cols, rows, flags, after, nowIdx, label: termLabel(model.now), guessed: t.guessed };
}

/** What happens in week i, for the strip under the timeline. */
function voyageWeek(v, i) {
  const col = v.cols[i];
  const items = [];
  for (const r of v.rows) for (const m of r.marks) if (m.w === i) items.push({ code: r.code, text: m.label, kind: 'lecture', status: m.status });
  for (const f of v.flags) if (f.w === i) items.push({ code: f.code, text: f.title, kind: f.kind, due: f.due });
  return { col, items };
}

/** Which compass directions are lit: north 课程, east 英语, south 专注, west 收尾. */
const compassParts = (done) => ({ lit: done.slice(0, 4), full: done.length >= 4 && done.slice(0, 4).every(Boolean) });

// A small compass rose: four wedges, lit when that habit is done; a gold ring when all four are.
function compassRose(parent, done, size) {
  const { lit, full } = compassParts(done);
  const c = size / 2, r = size / 2 - 1.5, w = r * 0.34;
  const svg = s('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}`, class: 'sp-cmp' + (full ? ' is-full' : '') }, parent);
  s('circle', { cx: c, cy: c, r, class: 'sp-cmp-ring' }, svg);
  [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy], i) => {
    const tip = [c + dx * (r - 1), c + dy * (r - 1)], a = [c - dy * w, c + dx * w], b = [c + dy * w, c - dx * w];
    s('polygon', { points: `${tip.join(',')} ${a.join(',')} ${b.join(',')}`, class: lit[i] ? 'sp-cmp-on' : 'sp-cmp-off' }, svg);
  });
  s('circle', { cx: c, cy: c, r: Math.max(1.2, size * 0.06), class: 'sp-cmp-hub' }, svg);
  return svg;
}

const VOYAGE_ICON = { deadline: '⚑', exam: '◆', milestone: '▸' };
const VOYAGE_KIND = { deadline: '截止', exam: '考试', milestone: '考核节点', lecture: '讲次' };

function renderVoyage(parent, model, view) {
  const v = voyage(model);
  const body = card(parent, '⛵', '学期航线', `${v.label}${v.guessed ? ' · 学期日期是估的，可以在设置里改' : ''}`, `共 ${v.weeks} 周`);
  if (!v.rows.length && !v.flags.length) { h('div', 'sp-muted', body, '认出课程以后，这里会按周画出整学期的讲次和截止日期。'); return; }
  const pick = view.voyageWeek == null || view.voyageWeek >= v.weeks ? Math.max(0, Math.min(v.weeks - 1, v.nowIdx)) : view.voyageWeek;
  const grid = h('div', 'sp-voy', body);
  grid.style.setProperty('--weeks', v.weeks);
  const cell = (cls, i) => h('div', `sp-voy-cell${cls ? ' ' + cls : ''}${i === v.nowIdx ? ' is-now' : ''}${i === pick ? ' is-pick' : ''}`, grid);
  h('div', 'sp-voy-lab', grid, '周');
  v.cols.forEach((c) => {
    const b = h('button', `sp-voy-wk${c.now ? ' is-now' : ''}${c.past ? ' is-past' : ''}${c.i === pick ? ' is-pick' : ''}`, grid, String(c.n));
    b.setAttribute('aria-label', `第 ${c.n} 周 · ${mdd(c.start)} 起`);
    b.onclick = () => view.set({ voyageWeek: c.i });
  });
  h('div', 'sp-voy-lab', grid, '截止');
  v.cols.forEach((c) => {
    const box = cell('is-flags', c.i);
    for (const f of v.flags.filter((x) => x.w === c.i)) h('span', `sp-voy-flag is-${f.kind}`, box, VOYAGE_ICON[f.kind]);
  });
  for (const r of v.rows) {
    const lab = h('a', 'sp-voy-lab sp-voy-course', grid, r.code);
    lab.style.setProperty('--c', r.color);
    lab.onclick = () => view.actions.openCourse(r.code);
    v.cols.forEach((c) => {
      const box = cell('', c.i);
      box.style.setProperty('--c', r.color);
      for (const m of r.marks.filter((x) => x.w === c.i)) h('span', `sp-voy-dot is-${m.status}`, box).setAttribute('aria-label', m.label);
    });
  }
  const wk = voyageWeek(v, pick);
  const strip = h('div', 'sp-voy-week', body);
  h('div', 'sp-strong', strip, `第 ${wk.col.n} 周 · ${mdd(wk.col.start)} – ${mdd(addDays(wk.col.start, 6))}${pick === v.nowIdx ? ' · 本周' : ''}`);
  if (!wk.items.length) h('div', 'sp-muted sp-small', strip, '这周没有讲次和截止日期');
  for (const x of wk.items) {
    const row = h('div', 'sp-voy-item', strip);
    h('span', `sp-voy-kind is-${x.kind}`, row, x.kind === 'lecture' ? LECTURE_TEXT[x.status] : VOYAGE_KIND[x.kind]);
    if (x.code) h('span', 'sp-voy-code', row, x.code);
    h('span', 'sp-grow', row, x.due ? `${mdd(x.due)} · ${x.text}` : x.text);
  }
  if (v.after) h('div', 'sp-muted sp-small sp-mt', body, `学期结束后还有 ${v.after} 个日期，见倒计时`);
}
