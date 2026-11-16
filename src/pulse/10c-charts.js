/* ───────────────────────────── tide · wind rose · depth chart ─────────────────────────────
 * Three views built on time, balance and depth instead of words written:
 *   tide   when in the day you study, and what this week was made of
 *   rose   how many days this week each of the four directions was lit
 *   depth  how deep each lecture has been taken: attended → read → practised → kept
 */

const TIDE_SPAN = 28, TIDE_MIN_DAYS = 3, TIDE_HIGH = 0.45;
const tideName = (h) => (h >= 5 && h < 11 ? '早潮' : h >= 11 && h < 17 ? '午潮' : '晚潮');

/** The usual study minutes per hour of day over recent tracked days, and where today sits in it. */
function tide(model, span) {
  const sum = new Array(24).fill(0);
  let n = 0;
  for (let i = 1; i <= (span || TIDE_SPAN); i++) {
    const d = model.days[dkey(addDays(model.now, -i))];
    if (!d || d.est || !d.hours || !d.hours.some((v) => v > 0)) continue;
    n++;
    d.hours.forEach((v, hr) => { sum[hr] += v; });
  }
  const avg = sum.map((v) => (n ? v / n : 0));
  const today = ((model.days[model.today] || {}).hours || new Array(24).fill(0)).slice();
  const peak = Math.max(...avg);
  const hour = model.now.getHours();
  const out = { avg, today, peak, days: n, hour, windows: [], state: null };
  if (n < TIDE_MIN_DAYS || !peak) return out;
  const high = avg.map((v) => v >= TIDE_HIGH * peak);
  if (high.every(Boolean)) out.windows = [{ from: 0, to: 24, len: 24, mass: sum.reduce((a, b) => a + b, 0) }];
  else {
    // Walk the clock once, starting from a low hour, so a window may cross midnight.
    const start = high.indexOf(false);
    let cur = null;
    for (let j = 1; j <= 24; j++) {
      const hr = (start + j) % 24;
      if (high[hr]) { cur = cur || { from: hr, len: 0, mass: 0 }; cur.len++; cur.mass += avg[hr]; }
      else if (cur) { cur.to = hr; out.windows.push(cur); cur = null; }
    }
  }
  out.windows = out.windows.sort((a, b) => b.mass - a.mass).slice(0, 2).sort((a, b) => a.from - b.from)
    .map((w) => Object.assign(w, { name: tideName((w.from + Math.floor(w.len / 2)) % 24) }));
  const inside = (w) => ((hour - w.from + 24) % 24) < w.len;
  const now = out.windows.find(inside);
  if (now) out.state = { kind: 'high', name: now.name, until: now.to % 24 };
  else if (out.windows.length) {
    const next = out.windows.slice().sort((a, b) => ((a.from - hour + 24) % 24) - ((b.from - hour + 24) % 24))[0];
    out.state = { kind: 'low', name: next.name, at: next.from, inHours: (next.from - hour + 24) % 24 };
  }
  return out;
}

/** Minutes and counts for this week and the one before, by kind of study. */
function weekMix(model) {
  const sumWeek = (mon) => {
    const w = { read: 0, focus: 0, lecture: 0, tasks: 0, reviews: 0, days: 0 };
    for (let i = 0; i < 7; i++) {
      const d = model.days[dkey(addDays(mon, i))];
      if (!d || d.est) continue;
      w.read += d.readMin || 0; w.focus += d.focus || 0; w.lecture += d.lecture || 0;
      w.tasks += d.tasks || 0; w.reviews += d.reviews || 0;
      if (d.score > 0) w.days++;
    }
    w.minutes = w.read + w.focus + w.lecture;
    return w;
  };
  const mon = monday(model.now);
  return { cur: sumWeek(mon), prev: sumWeek(addDays(mon, -7)) };
}

const MIX_KINDS = [['read', '读', 'is-read'], ['focus', '专注', 'is-focus'], ['lecture', '听课', 'is-lecture']];
const hh = (n) => `${pad(n % 24)}:00`;

function renderTide(parent, model, view) {
  const t = tide(model), mix = weekMix(model);
  const body = card(parent, '≈', '潮汐', '你一天里什么时候在学，这一周学了什么', `本周 ${fmt1(mix.cur.minutes / 60)} 小时`);
  const W = 640, H = 150, P = { l: 8, r: 8, t: 22, b: 20 };
  const top = Math.max(10, t.peak, ...t.today);
  const x = (hr) => P.l + (hr / 24) * (W - P.l - P.r);
  const y = (v) => H - P.b - (Math.min(v, top) / top) * (H - P.t - P.b);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'sp-tide' }, body);
  s('line', { x1: P.l, x2: W - P.r, y1: H - P.b, y2: H - P.b, class: 'sp-tide-base' }, svg);
  if (t.days >= TIDE_MIN_DAYS) {
    // Points sit at the middle of each hour; the curve closes on itself across midnight.
    const pts = [];
    for (let i = -1; i <= 24; i++) pts.push([x(i + 0.5), y(t.avg[(i + 24) % 24])]);
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const mx = (pts[i - 1][0] + pts[i][0]) / 2;
      d += ` C${mx.toFixed(1)},${pts[i - 1][1].toFixed(1)} ${mx.toFixed(1)},${pts[i][1].toFixed(1)} ${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)}`;
    }
    const clip = s('clipPath', { id: 'spTideClip' }, s('defs', {}, svg));
    s('rect', { x: P.l, y: 0, width: W - P.l - P.r, height: H }, clip);
    const g = s('g', { 'clip-path': 'url(#spTideClip)' }, svg);
    s('path', { d: `${d} L${pts[pts.length - 1][0]},${H - P.b} L${pts[0][0]},${H - P.b} Z`, class: 'sp-tide-area' }, g);
    s('path', { d, class: 'sp-tide-line' }, g);
    for (const w of t.windows) {
      const mid = (w.from + w.len / 2) % 24;
      const lab = s('text', { x: Math.min(W - 60, Math.max(60, x(mid))), y: 12, 'text-anchor': 'middle', class: 'sp-axis' }, svg);
      lab.textContent = `${w.name} ${pad(w.from)}–${pad(w.to % 24)} 点`;
    }
  }
  t.today.forEach((v, hr) => {
    if (!v) return;
    const bar = s('rect', { x: x(hr) + 5, y: y(v), width: x(1) - x(0) - 10, height: H - P.b - y(v), rx: 2, class: 'sp-tide-today' }, svg);
    s('title', {}, bar).textContent = `今天 ${hr} 点 · ${v} 分钟`;
  });
  const nx = x(t.hour + model.now.getMinutes() / 60);
  s('line', { x1: nx, x2: nx, y1: P.t - 4, y2: H - P.b, class: 'sp-tide-now' }, svg);
  [0, 6, 12, 18, 24].forEach((hr) => { const tx = s('text', { x: x(hr), y: H - 5, 'text-anchor': hr === 0 ? 'start' : hr === 24 ? 'end' : 'middle', class: 'sp-axis' }, svg); tx.textContent = String(hr); });

  const row = h('div', 'sp-tide-row', body);
  const say = h('div', 'sp-tide-say', row);
  if (!t.state) h('span', 'sp-muted', say, `再用 ${Math.max(1, TIDE_MIN_DAYS - t.days)} 天，就能画出你自己的潮汐。浅色柱是今天。`);
  else if (t.state.kind === 'high') {
    h('span', 'sp-strong', say, `现在是你的${t.state.name}`);
    h('span', 'sp-muted', say, `，通常能学到 ${hh(t.state.until)}`);
    if (model.pomo && model.pomo.mode === 'idle') h('button', 'sp-chip is-active', say, '开始专注').onclick = () => view.actions.pomoStart();
  } else h('span', 'sp-muted', say, t.state.inHours <= 1 ? `${t.state.name}快到了（${hh(t.state.at)}）` : `现在是低潮，下一次${t.state.name}在 ${hh(t.state.at)}`);
  h('span', 'sp-muted sp-small', say, `曲线是近 ${t.days} 天的平均，柱子是今天`);

  const mixBox = h('div', 'sp-mix', body);
  const max = Math.max(1, ...MIX_KINDS.flatMap(([k]) => [mix.cur[k], mix.prev[k]]));
  for (const [k, label, cls] of MIX_KINDS) {
    const r = h('div', 'sp-mix-row', mixBox);
    h('span', 'sp-muted', r, label);
    const track = h('div', 'sp-mix-track', r);
    h('div', 'sp-mix-bar ' + cls, track).style.width = `${(mix.cur[k] / max) * 100}%`;
    const tick = h('i', 'sp-mix-prev', track); tick.style.left = `${(mix.prev[k] / max) * 100}%`; tick.title = `上周 ${mix.prev[k]} 分钟`;
    h('span', 'sp-mono', r, `${mix.cur[k]} 分钟`);
  }
  h('div', 'sp-muted sp-small', mixBox, `本周学了 ${mix.cur.days} 天 · 勾掉 ${mix.cur.tasks} 个任务 · 复习 ${mix.cur.reviews} 张闪卡 · 竖线是上周`);
}

/* ── wind rose ── */

function roseSvg(parent, counts, prev, size) {
  const c = size / 2, R = size / 2 - 26, w = 13;
  const svg = s('svg', { viewBox: `0 0 ${size} ${size}`, class: 'sp-rose' }, parent);
  for (let i = 1; i <= 7; i++) s('circle', { cx: c, cy: c, r: (R * i) / 7, class: 'sp-rose-ring' + (i === 7 ? ' is-outer' : '') }, svg);
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const tip = (i, n) => [c + DIRS[i][0] * (R * n) / 7, c + DIRS[i][1] * (R * n) / 7];
  if (prev && prev.some((n) => n > 0)) s('polygon', { points: prev.map((n, i) => tip(i, Math.max(n, 0.35)).map((v) => v.toFixed(1)).join(',')).join(' '), class: 'sp-rose-prev' }, svg);
  counts.forEach((n, i) => {
    const [dx, dy] = DIRS[i], t = tip(i, Math.max(n, 0.35));
    const a = [c - dy * w + dx * w, c + dx * w + dy * w], b = [c + dy * w + dx * w, c - dx * w + dy * w];
    s('polygon', { points: `${c},${c} ${a.join(',')} ${t.map((v) => v.toFixed(1)).join(',')} ${b.join(',')}`, class: `sp-rose-petal is-${HABITS[i].key}` + (n ? '' : ' is-empty') }, svg);
    const lab = s('text', { x: c + dx * (R + 14), y: c + dy * (R + 14) + 4, 'text-anchor': 'middle', class: 'sp-rose-label' }, svg);
    lab.textContent = HABITS[i].label;
  });
  s('circle', { cx: c, cy: c, r: 3, class: 'sp-cmp-hub' }, svg);
  return svg;
}

function renderRose(parent, model, view) {
  const off = view.roseOffset || 0;
  const mon = addDays(monday(model.now), off * 7);
  const wk = model.rose.week(dkey(mon)), prev = model.rose.week(dkey(addDays(mon, -7)), dkey(addDays(mon, -1)));
  const lit = wk.counts.filter((n) => n > 0).length;
  const body = card(parent, '🧭', '风玫瑰', '一周的平衡：花瓣越长，这周这个方向做的天数越多', `${off ? '那周' : '本周'} ${lit} / 4 个方向`);
  const nav = h('div', 'sp-moon-nav', body);
  const prevB = h('button', 'sp-chip', nav, '‹');
  const end = addDays(mon, 6);
  h('div', 'sp-moon-title', nav, `${termLabel(mon)} · ${mdd(mon)} – ${mdd(end)}`);
  const nextB = h('button', 'sp-chip', nav, '›');
  prevB.onclick = () => view.set({ roseOffset: off - 1 });
  nextB.disabled = off >= 0;
  nextB.onclick = () => { if (off < 0) view.set({ roseOffset: off + 1 }); };

  const grid = h('div', 'sp-rose-grid', body);
  roseSvg(h('div', 'sp-rose-box', grid), wk.counts, prev.counts, 220);
  const list = h('div', 'sp-rose-list', grid);
  HABITS.forEach((hb, i) => {
    const r = h('div', 'sp-rose-item', list);
    h('span', `sp-rose-dot is-${hb.key}`, r);
    const mid = h('div', 'sp-grow', r);
    const topRow = h('div', 'sp-quest-top', mid);
    h('span', 'sp-strong', topRow, `${hb.dir} · ${hb.label}`);
    h('span', 'sp-muted', topRow, `${wk.counts[i]} 天`);
    const dots = h('div', 'sp-rose-days', mid);
    for (let dno = 0; dno < 7; dno++) {
      const day = wk.days[dno];
      const dot = h('i', 'sp-rose-day' + (day ? (day.done[i] ? ` is-on is-${hb.key}` : '') : ' is-future') + (day && day.key === model.today ? ' is-today' : ''), dots);
      dot.title = `周${WEEKDAYS[(dno + 1) % 7]}`;
    }
    h('div', 'sp-muted sp-small', mid, hb.hint);
  });
  const missing = HABITS.filter((_, i) => !wk.counts[i]).map((hb) => hb.label);
  const foot = h('div', 'sp-rose-foot' + (wk.full ? ' is-full' : ''), body);
  foot.textContent = wk.full ? '四个方向这周都亮过了：护盾 +1' : off ? `这周没亮过：${missing.join('、')}` : `这周还没亮：${missing.join('、')}。四个方向都亮过，得 1 块护盾`;
  if (prev.counts.some((n) => n > 0)) h('div', 'sp-muted sp-small', body, '虚线是前一周');
}

/* ── depth chart ── */

const DEPTH_NAMES = ['还没上', '上过', '读过', '练过', '记牢'];
const DEPTH_MATURE_DAYS = 21, DEPTH_KEPT = 0.8;
const EXAM_WORD = /考|exam|test|quiz/i;

/** One row per course, one cell per lecture, sorted by the nearest exam. cardDepth: {path: {total, started, mature}}. */
function depthChart(model, cardDepth) {
  const today = day0(model.now);
  const rows = model.courses.filter((c) => c.items.length).map((c) => {
    const cells = c.items.map((it) => {
      const cards = (it.paths || []).reduce((a, p) => {
        const d = (cardDepth || {})[p];
        return d ? { total: a.total + d.total, started: a.started + d.started, mature: a.mature + d.mature } : a;
      }, { total: 0, started: 0, mature: 0 });
      const attended = it.done || it.past || ['attended', 'doing'].includes(it.status);
      let level = !attended ? 0 : it.done || it.autoDone ? 2 : 1;
      if (attended && cards.started > 0) level = 3;
      if (attended && cards.total > 0 && cards.mature / cards.total >= DEPTH_KEPT) level = 4;
      return { n: it.n, label: it.label, level, cards, link: (it.paths || [])[0] || null };
    });
    const exam = (model.allDeadlines || []).filter((d) => d.due >= today && EXAM_WORD.test(d.title) && d.course && (d.course === c.code || c.code.includes(d.course) || d.course.includes(c.code)))[0];
    const taught = cells.filter((x) => x.level > 0);
    return { code: c.code, color: c.color, homePath: c.homePath, cells, taught: taught.length, shallow: taught.filter((x) => x.level < 2).length,
      exam: exam ? { title: exam.title, left: Math.round((day0(exam.due) - today) / 864e5), fuzzy: exam.fuzzy } : null };
  });
  return rows.sort((a, b) => (a.exam ? a.exam.left : 1e9) - (b.exam ? b.exam.left : 1e9));
}

function renderDepth(parent, model, view) {
  const rows = depthChart(model, model.cardDepth);
  const taught = rows.reduce((a, r) => a + r.taught, 0), read = rows.reduce((a, r) => a + r.taught - r.shallow, 0);
  const body = card(parent, '⚓', '测深图', '每讲一格，颜色越浓学得越深；点一格打开这讲的笔记', taught ? `${read} / ${taught} 讲读过` : null);
  if (!rows.length) { h('div', 'sp-muted', body, '认出课程和讲次以后，这里会画出每一讲学到了多深。'); return; }
  const first = rows.find((r) => r.exam);
  if (first) h('div', 'sp-depth-lead', body, first.shallow
    ? `离「${first.code}」${first.exam.title}还有${first.exam.fuzzy ? '大约 ' : ' '}${first.exam.left} 天：上过的 ${first.taught} 讲里有 ${first.shallow} 讲还没读过`
    : `离「${first.code}」${first.exam.title}还有${first.exam.fuzzy ? '大约 ' : ' '}${first.exam.left} 天：上过的 ${first.taught} 讲都读过了`);
  const grid = h('div', 'sp-depth', body);
  for (const r of rows) {
    const name = h('a', 'sp-depth-name', grid, r.code); name.style.setProperty('--c', r.color);
    name.onclick = () => view.actions.openCourse(r.code);
    const cells = h('div', 'sp-depth-cells', grid);
    for (const c of r.cells) {
      const b = h('button', `sp-depth-cell is-l${c.level}`, cells, String(c.n));
      b.title = `${c.label}\n${DEPTH_NAMES[c.level]}` + (c.cards.total ? ` · 闪卡 ${c.cards.started}/${c.cards.total} 张学过，${c.cards.mature} 张记牢` : c.level >= 1 ? ' · 这讲的笔记里还没有闪卡' : '');
      b.onclick = () => (c.link ? view.actions.open(c.link) : view.actions.openCourse(r.code));
    }
    h('span', 'sp-depth-exam sp-muted', grid, r.exam ? `${r.exam.fuzzy ? '约 ' : ''}${r.exam.left} 天后考` : '');
  }
  const lg = h('div', 'sp-legend-row sp-mt', body);
  const ll = h('span', 'sp-legend', lg);
  DEPTH_NAMES.forEach((n, i) => { h('i', `sp-depth-sw is-l${i}`, ll); h('span', 'sp-muted', ll, n); });
  h('span', 'sp-muted sp-small', lg, `读过 = 链接的笔记看满 ${READ_MINUTES} 分钟 · 练过 = 复习过这讲的闪卡 · 记牢 = 八成闪卡间隔满 ${DEPTH_MATURE_DAYS} 天`);
}
