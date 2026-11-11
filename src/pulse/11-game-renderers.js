/* ── game renderers ── */

function sprite(parent, rows, palette, cls) {
  const svg = s('svg', { viewBox: `0 0 ${rows[0].length} ${rows.length}`, class: cls, 'shape-rendering': 'crispEdges' }, parent);
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (palette[ch]) s('rect', { x, y, width: 1.02, height: 1.02, fill: palette[ch] }, svg); }));
  return svg;
}

const CHEST = [['..kkkk..', '.kyyyyk.', 'kyyyyyyk', 'kkkggkkk', 'kbbggbbk', 'kbbbbbbk', 'kkkkkkkk'],
  ['.kkkkkk.', 'k......k', 'kyyyyyyk', 'kkkggkkk', 'kbbggbbk', 'kbbbbbbk', 'kkkkkkkk']];

// Avatar: base scholar plus whichever avatar items the level has unlocked.
function avatar(parent, has) {
  const rows = ['...kk...', '.kkkkkk.', 'kkkkkkkk', '..ssss.t', '.sesses.', '.ssssss.', '..smms..', '.bbwwbb.', 'bbbwwbbb', 'b.bbbb.b', '..b..b..'];
  const pal = { k: '#2b2f4a', t: '#2b2f4a', s: '#f1c9a5', e: '#2b2f4a', m: '#d47a6a', b: '#5b6bd5', w: '#ffffff', r: '#b8323a', y: '#e3a43a', g: '#3a3f55', o: '#c0392b', l: '#4f9a4c' };
  const set = (row, str) => { rows[row] = str; };
  if (has('avatar:tassel')) pal.t = '#e3a43a';
  if (has('avatar:gown')) pal.b = '#a8323a';
  if (has('avatar:glasses')) set(4, '.geggeg.');
  if (has('avatar:scarf')) { set(7, '.bryyrb.'); set(8, 'bbbrybbb'); }
  if (has('avatar:book')) { set(8, rows[8].slice(0, 7) + 'o'); set(9, 'b.bbbboo'); }
  if (has('avatar:laurel')) set(1, 'lkkkkkkl');
  return sprite(parent, rows, pal, 'sp-avatar-svg');
}

function renderPlayer(parent, model, view) {
  const g = model.game;
  const has = (id) => g.has.has(id);
  const el = h('section', 'sp-player', parent);
  const av = h('div', 'sp-avatar', el);
  avatar(av, has);
  h('div', 'sp-lv', av, `Lv ${g.level}`);
  const mid = h('div', 'sp-grow', el);
  const top = h('div', 'sp-player-top', mid);
  h('span', 'sp-player-title', top, g.title);
  h('span', 'sp-muted', top, `总经验 ${fmtInt(g.xp)} XP`);
  const bar = h('div', 'sp-xp', mid);
  h('div', 'sp-xp-fill', bar).style.width = `${((g.xp - g.floor) / (g.next - g.floor)) * 100}%`;
  h('div', 'sp-xp-text', bar, `${fmtInt(g.xp - g.floor)} / ${fmtInt(g.next - g.floor)}`);
  const nu = g.nextUnlock;
  h('div', 'sp-muted', mid, `再拿 ${fmtInt(g.next - g.xp)} XP 升到 Lv ${g.level + 1}` + (nu ? ` · Lv ${nu.lv} 解锁 ${nu.icon} ${nu.name}` : ''));
  // Theme swatches: unlocked ones are clickable, locked ones show their level.
  const sw = h('div', 'sp-swatches', mid);
  h('span', 'sp-muted sp-small', sw, '主题色');
  const current = model.settings.theme || 'blue';
  for (const [key, [name, color]] of Object.entries(THEMES)) {
    const u = UNLOCKS.find((x) => x.id === `theme:${key}`);
    const open = key === 'blue' || has(`theme:${key}`);
    const b = h('button', 'sp-swatch' + (key === current ? ' is-active' : '') + (open ? '' : ' is-locked'), sw);
    b.style.setProperty('--c', color);
    b.title = open ? name : `${name} · Lv ${u.lv} 解锁`;
    if (!open) h('span', '', b, '🔒');
    if (open) b.onclick = () => view.actions.setTheme(key);
  }
  const chipsEl = h('div', 'sp-player-chips', el);
  const tiers = g.achievements.reduce((a, x) => a + x.tier, 0);
  [['🔥', `${model.streak} 天`, '连续学习'], ['🛡', `${g.shields}/${MAX_SHIELDS}`, '护盾'], ['✨', `+${fmtInt(g.todayXp)}`, '今日 XP'],
    ['🏅', `${tiers}/${g.achievements.length * 3}`, '成就']].forEach(([ic, v, l]) => {
    const c = h('div', 'sp-pchip', chipsEl); h('div', 'sp-pchip-v', c, `${ic} ${v}`); h('div', 'sp-muted', c, l);
  });
  chipsEl.querySelector('.sp-pchip:nth-child(2)').title = `每个满罗盘日得 1 块护盾（最多 ${MAX_SHIELDS}），哪天没学会自动用掉一块，连胜不断。${g.shielded.length ? `已经替你挡过 ${g.shielded.length} 次。` : ''}`;
}

function renderQuests(parent, model, view) {
  const g = model.game;
  const done = g.quests.filter((q) => q.done).length;
  const body = card(parent, '⚑', '今日任务', `每完成一项 +${QUEST_XP} XP，四项全清开宝箱 +${CHEST_XP} XP`, `${done} / ${g.quests.length}`);
  for (const q of g.quests) {
    const row = h('div', 'sp-quest' + (q.done ? ' is-done' : ''), body);
    h('div', 'sp-quest-icon', row, q.done ? '✓' : q.icon);
    const mid = h('div', 'sp-grow', row);
    const top = h('div', 'sp-quest-top', mid);
    h('span', 'sp-strong', top, q.label);
    h('span', 'sp-muted', top, q.prog.text);
    const bar = h('div', 'sp-qbar', mid);
    h('div', 'sp-qbar-fill', bar).style.width = `${Math.min(1, q.prog.frac) * 100}%`;
    h('div', 'sp-muted sp-small', mid, q.hint);
    h('span', 'sp-xp-tag' + (q.done ? ' is-done' : ''), row, `+${QUEST_XP}`);
  }
  const chest = h('div', 'sp-chest' + (g.chest ? ' is-open' : ''), body);
  sprite(chest, CHEST[g.chest ? 1 : 0], { k: '#5a3a22', y: '#e3a43a', g: '#ffd75e', b: '#a8693a' }, 'sp-chest-svg');
  h('div', 'sp-grow', chest, g.chest ? `宝箱已打开 +${CHEST_XP} XP · 今天罗盘全满，护盾 +1` : `还差 ${g.quests.length - done} 项开宝箱`);
}

function renderMonthly(parent, model) {
  const g = model.game;
  const { y, m, list } = g.monthly;
  const left = new Date(y, m + 1, 0).getDate() - model.now.getDate();
  const done = list.filter((c) => c.done).length;
  const body = card(parent, '🗓', `${m + 1} 月挑战`, `每月 1 号重置 · 本月还剩 ${left} 天`, `${done} / ${list.length}`);
  for (const c of list) {
    const row = h('div', 'sp-quest' + (c.done ? ' is-done' : ''), body);
    h('div', 'sp-quest-icon', row, c.done ? '✓' : c.icon);
    const mid = h('div', 'sp-grow', row);
    const top = h('div', 'sp-quest-top', mid);
    h('span', 'sp-strong', top, c.desc.replace('{n}', fmtInt(c.goal)));
    h('span', 'sp-muted', top, `${fmtInt(c.cur)} / ${fmtInt(c.goal)}`);
    const bar = h('div', 'sp-qbar', mid);
    h('div', 'sp-qbar-fill', bar).style.width = `${(c.cur / c.goal) * 100}%`;
  }
  const hist = h('div', 'sp-month-badges', body);
  h('span', 'sp-muted sp-small', hist, '近 6 个月');
  for (const mo of g.months) {
    const n = mo.list.filter((c) => c.done).length;
    const b = h('div', 'sp-month-badge is-t' + n, hist);
    h('div', '', b, ['·', '🥉', '🥈', '🥇', '🏆'][n]);
    h('div', 'sp-muted sp-small', b, `${mo.m + 1}月`);
    b.title = `${mo.y} 年 ${mo.m + 1} 月：完成 ${n} / 4 项`;
  }
}

function renderAchievements(parent, model) {
  const list = model.game.achievements;
  const tiers = list.reduce((a, x) => a + x.tier, 0);
  const body = card(parent, '🏅', '成就', '每个成就有铜 / 银 / 金三档 · 手写字数不含粘贴和历史估算', `${tiers} / ${list.length * 3}`);
  const grid = h('div', 'sp-ach-grid', body);
  for (const a of list.slice().sort((x, y) => (y.tier - x.tier) || (y.cur / y.goal - x.cur / x.goal))) {
    const el = h('div', `sp-ach is-t${a.tier}`, grid);
    const head = h('div', 'sp-ach-head', el);
    h('span', 'sp-ach-icon', head, a.icon);
    h('span', 'sp-ach-medal', head, a.tier ? ['', '🥉', '🥈', '🥇'][a.tier] : '');
    h('div', 'sp-ach-name', el, a.name);
    h('div', 'sp-muted sp-small', el, a.maxed ? `已满级：${a.desc.replace('{n}', fmtInt(a.tiers[2]))}` : `${a.tier ? '下一档' : '目标'}：${a.desc.replace('{n}', fmtInt(a.goal))}`);
    if (!a.maxed) {
      const b = h('div', 'sp-qbar', el); h('div', 'sp-qbar-fill', b).style.width = `${Math.min(1, a.cur / a.goal) * 100}%`;
      h('div', 'sp-muted sp-small', el, `${fmtInt(a.cur)} / ${fmtInt(a.goal)}`);
    }
  }
}

// The default ink colour comes from the stylesheet, which knows light from dark. Unlocked themes set their own.
function applyTheme(root, model) {
  const key = model.settings.theme;
  const props = ['--sp-accent', '--sp-accent-soft', '--sp-l1', '--sp-l2', '--sp-l3', '--sp-l4'];
  if (!THEMES[key] || key === 'blue' || !model.game.has.has(`theme:${key}`)) { props.forEach((p) => root.style.removeProperty(p)); return; }
  const th = THEMES[key];
  root.style.setProperty('--sp-accent', th[1]);
  root.style.setProperty('--sp-accent-soft', `color-mix(in srgb, ${th[1]} 13%, transparent)`);
  [1, 2, 3, 4].forEach((i) => root.style.setProperty(`--sp-l${i}`, `color-mix(in srgb, ${th[1]} ${[28, 50, 75, 100][i - 1]}%, transparent)`));
}

function renderNow(parent, model, view) {
  const body = card(parent, '➜', '现在做什么', '按日期和考核自动排，勾掉就换下一件');
  if (!model.courses.length) {
    h('div', 'sp-muted', body, `「${model.settings.courseRoot}」里还没有认出课程。用设置向导选课程文件夹，或者先生成一门示例课看看效果。`);
    const row = h('div', 'sp-now-routine', body);
    h('button', 'sp-chip', row, '打开设置向导').onclick = () => view.actions.setup();
    h('button', 'sp-chip', row, '识别检查').onclick = () => view.actions.check();
    return;
  }
  const rows = nowList(model);
  if (!rows.length) h('div', 'sp-muted', body, '这几天没有到期的事。可以往前推一推论文，或者做一轮闪卡。');
  for (const r of rows) {
    const row = h('div', `sp-now-row is-${r.tone}`, body);
    if (r.go.task) {
      const cb = h('input', '', row); cb.type = 'checkbox';
      cb.onchange = () => view.actions.toggleNoteTask(r.go.task);
    }
    h('span', 'sp-now-when', row, r.when);
    if (r.code) h('span', 'sp-now-code', row, r.code);
    const t = h('a', 'sp-now-text', row, r.text);
    t.onclick = () => (r.go.course ? view.actions.openCourse(r.go.course) : view.actions.open(r.go.guide || (r.go.task ? r.go.task.path : model.settings.scheduleFile)));
  }
  const line = h('div', 'sp-now-routine', body);
  const { cards, tasks } = model.routine || {};
  const left = cards ? cards.due + cards.fresh : 0;
  if (left) h('button', 'sp-chip', line, `🃏 闪卡 ${left} 张`).onclick = () => view.actions.command('review');
  if (tasks) h('button', 'sp-chip', line, `✓ 今天 ${tasks} 项任务`).onclick = () => view.actions.command('open-tasks');
  if (!model.pomo || model.pomo.mode === 'idle') h('button', 'sp-chip', line, '🍅 开始专注').onclick = () => view.actions.pomoStart();
}

const foldKey = (title) => title.replace(/^\d{4}年.*$/, '当日详情').replace(/^\d+ 月挑战$/, '月挑战');

// Any card folds from its header; the choice is remembered. 现在做什么 always stays open.
function foldCards(root, model, view) {
  const folded = model.settings.folded || [];
  root.querySelectorAll('.sp-card').forEach((c) => {
    const key = foldKey(c.querySelector('.sp-card-title').textContent);
    if (key === '现在做什么') return;
    c.classList.add('is-foldable');
    c.classList.toggle('is-folded', folded.includes(key));
    c.querySelector('.sp-card-head').onclick = (e) => {
      if (!e.target.closest('a, button, input, label')) view.actions.setFolded(key, c.classList.toggle('is-folded'));
    };
  });
}

function renderDashboard(root, model, view) {
  root.textContent = '';
  root.classList.add('sp-root');
  applyTheme(root, model);
  const hero = h('div', 'sp-hero', root);
  const deco = sceneDeco(model);
  renderScene(hero, model.now, false, null, deco);
  const bar = h('div', 'sp-hero-bar', hero);
  const nav = h('div', 'sp-chips is-glass', bar);
  const anchors = {};
  [['week', '本周'], ['courses', '课程'], ['quests', '今日任务'], ['today', '专注'], ['overview', '总览'], ['moons', '罗盘'], ['ach', '成就']].forEach(([id, label]) => {
    const b = h('button', 'sp-chip', nav, label); b.onclick = () => anchors[id] && anchors[id].scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  const right = h('div', 'sp-chips is-glass', bar);
  h('button', 'sp-chip', right, '任务').onclick = () => view.actions.command('open-tasks');
  h('button', 'sp-chip', right, '闪卡').onclick = () => view.actions.command('open-cards');
  h('button', 'sp-chip', right, '🎙 录音').onclick = () => view.actions.command('toggle');
  h('button', 'sp-chip', right, '随手记').onclick = () => view.actions.command('open-memo');
  h('button', 'sp-chip', right, '识别检查').onclick = () => view.actions.check();
  h('button', 'sp-chip', right, '刷新').onclick = () => view.refresh(true);
  const greet = model.now.getHours() < 12 ? '早上好' : model.now.getHours() < 18 ? '下午好' : '晚上好';
  h('div', 'sp-hero-title', hero, `${greet} · ${termLabel(model.now)}`);

  renderNow(root, model, view);
  renderVoyage(root, model, view);
  renderPlayer(root, model, view);
  anchors.week = h('div', 'sp-anchor', root);
  const two = h('div', 'sp-two', root);
  renderDeadlines(h('div', '', two), model, view);
  renderWeek(h('div', '', two), model, view);
  anchors.courses = h('div', 'sp-anchor', root);
  renderCourses(root, model, view);
  anchors.quests = h('div', 'sp-anchor', root);
  const game = h('div', 'sp-two', root);
  renderQuests(h('div', '', game), model, view);
  renderMonthly(h('div', '', game), model);
  anchors.today = h('div', 'sp-anchor', root);
  renderPomodoro(root, model, view);
  renderHeatmap(root, model, view);
  anchors.overview = h('div', 'sp-anchor', root);
  const ranges = h('div', 'sp-range', root);
  chips(ranges, [[7, '近 7 天'], [30, '近 30 天'], [90, '近 90 天'], ['year', '今年'], [365, '近一年']], view.range, (r) => view.set({ range: r }));
  renderOverview(root, model, view);
  renderDay(root, model, view);
  anchors.moons = h('div', 'sp-anchor', root);
  renderMoons(root, model, view);
  anchors.ach = h('div', 'sp-anchor', root);
  renderAchievements(root, model);
  anchors.strata = h('div', 'sp-anchor', root);
  renderStrata(root, model);

  const foot = h('div', 'sp-footer', root);
  renderScene(foot, model.now, true, null, deco);
  const txt = h('div', 'sp-footer-text', foot);
  h('span', '', txt, 'Term Compass 0.1');
  h('span', model.backup && model.backup.error ? 'sp-foot-warn' : '', txt, backupLine(model.backup));
  h('span', '', txt, `河畔记得你最近 ${Object.keys(model.days).filter((k) => model.days[k].score > 0 && k >= dkey(addDays(model.now, -59))).length} 天的努力 · 小鸭子在陪你学习`);
  foldCards(root, model, view);
}

const SECTIONS = {
  dashboard: renderDashboard,
  scene: (el, m) => renderScene(el, m.now, false, null, sceneDeco(m)),
  overview: renderOverview, heatmap: renderHeatmap, today: renderDay, pomodoro: renderPomodoro,
  player: renderPlayer, quests: renderQuests, monthly: renderMonthly, achievements: renderAchievements,
  voyage: renderVoyage, courses: renderCourses, deadlines: renderDeadlines, week: renderWeek, moons: renderMoons, english: renderMoons, strata: renderStrata, now: renderNow,
};
