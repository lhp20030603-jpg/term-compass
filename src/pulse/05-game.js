/* ───────────────────────────── game layer ─────────────────────────────
 * Turns the same real data into motivation without fake points:
 * XP/levels (every level unlocks something), daily quests, streak shields,
 * tiered achievements and a monthly challenge.
 */

const QUEST_XP = 10;
const CHEST_XP = 20;
const MAX_SHIELDS = 3;
const TITLES = [[1, '初学者 Novice'], [5, '学徒 Apprentice'], [10, '研读者 Reader'], [15, '钻研者 Researcher'],
  [20, '学者 Scholar'], [25, '专家 Expert'], [30, '大师 Master'], [40, '宗师 Grandmaster']];

// One unlock per level: scene items (drawn in renderScene), avatar items, theme colours.
const UNLOCKS = [
  [2, 'avatar', 'book', '📕', '手里的书'], [3, 'scene', 'lamps', '🏮', '河岸路灯'], [4, 'theme', 'river', '🎨', '主题色 · 河畔绿'],
  [5, 'avatar', 'scarf', '🧣', '学院围巾'], [6, 'scene', 'boat2', '🛶', '第二条小船'], [7, 'scene', 'kite', '🪁', '风筝'],
  [8, 'theme', 'sunset', '🎨', '主题色 · 落日橙'], [9, 'avatar', 'glasses', '👓', '眼镜'], [10, 'scene', 'flags', '🚩', '楼顶旗帜'],
  [11, 'scene', 'bikes', '🚲', '河岸自行车'], [12, 'theme', 'sakura', '🎨', '主题色 · 樱花粉'], [13, 'avatar', 'tassel', '✨', '金色流苏'],
  [14, 'scene', 'swans', '🦢', '天鹅'], [15, 'scene', 'balloon', '🎈', '热气球'], [16, 'theme', 'dusk', '🎨', '主题色 · 暮光紫'],
  [17, 'scene', 'fireflies', '✨', '夜晚萤火'], [18, 'avatar', 'gown', '🎓', '红色学位袍'], [19, 'scene', 'meteor', '🌠', '流星'],
  [20, 'theme', 'gold', '🎨', '主题色 · 鎏金'], [21, 'scene', 'rainbow', '🌈', '雨后彩虹'], [22, 'scene', 'rowing', '🚣', '赛艇队'],
  [23, 'scene', 'skylanterns', '🏮', '孔明灯'], [24, 'avatar', 'laurel', '🌿', '桂冠'], [26, 'scene', 'fireworks', '🎆', '烟花'],
  [28, 'scene', 'aurora', '🌌', '极光'], [30, 'theme', 'aurora', '🎨', '主题色 · 极光'],
].sort((a, b) => a[0] - b[0]).map(([lv, type, key, icon, name]) => ({ lv, type, key, id: `${type}:${key}`, icon, name }));

const THEMES = { blue: ['海图墨蓝', '#1f3a5c'], river: ['河畔绿', '#3d9a6b'], sunset: ['落日橙', '#e07a3f'], sakura: ['樱花粉', '#d6668f'],
  dusk: ['暮光紫', '#8a5cc7'], gold: ['鎏金', '#c9952b'], aurora: ['极光', '#2fa3a8'] };

/**
 * Streak with shields: every full-moon day earns a shield (max 3); a missed day
 * spends one instead of breaking the streak. Today never breaks the streak.
 */
function shieldStreak(model) {
  const keys = Object.keys(model.days).sort();
  const out = { streak: 0, longest: 0, shields: 0, shielded: [] };
  if (!keys.length) return out;
  let run = 0;
  for (let d = parseKey(keys[0]); dkey(d) <= model.today; d = addDays(d, 1)) {
    const k = dkey(d);
    const day = model.days[k];
    if (day && !day.est && day.score > 0) {
      run++;
      if (model.moons.phase(k) === 1) out.shields = Math.min(MAX_SHIELDS, out.shields + 1);
    } else if (k === model.today) {
      // still time today
    } else if (out.shields > 0) { out.shields--; out.shielded.push(k); run++; }
    else run = 0;
    out.longest = Math.max(out.longest, run);
  }
  out.streak = run;
  return out;
}

const levelFloor = (L) => 25 * (L - 1) * L;        // total XP needed to reach level L
function levelOf(xp) { let L = 1; while (xp >= levelFloor(L + 1)) L++; return L; }
const titleOf = (L) => TITLES.filter(([lv]) => L >= lv).pop()[1];

// Tiered achievements: bronze / silver / gold. Typed words exclude pastes and estimates.
const TIER_NAMES = ['未解锁', '铜', '银', '金'];
const ACHIEVEMENTS = [
  ['streak', '🔥', '持之以恒', '最长连续学习 {n} 天', (s) => s.longest, [7, 30, 100]],
  ['moons', '🧭', '罗盘收藏家', '累计 {n} 个满罗盘', (s) => s.fullMoons, [10, 40, 120]],
  ['moonrun', '🌟', '完美一周', '连续 {n} 天满罗盘', (s) => s.moonRun, [3, 7, 21]],
  ['poms', '🍅', '番茄农场主', '累计 {n} 个番茄', (s) => s.poms, [50, 200, 600]],
  ['deep', '🤿', '深潜', '单日专注 {n} 分钟', (s) => s.maxFocus, [120, 200, 300]],
  ['cards', '🃏', '记忆宫殿', '累计复习 {n} 张闪卡', (s) => s.reviews, [300, 1500, 5000]],
  ['carddays', '🔁', '温故知新', '连续 {n} 天复习闪卡', (s) => s.reviewRun, [7, 21, 60]],
  ['typed', '✍️', '笔耕不辍', '累计手写 {n} 词', (s) => s.typed, [20000, 100000, 300000]],
  ['bigday', '📝', '高产的一天', '单日手写 {n} 词', (s) => s.maxTyped, [1000, 2500, 5000]],
  ['multi', '🧭', '多线并进', '一天内推进 {n} 门课', (s) => s.maxCourses, [2, 3, 4]],
  ['reading', '📰', '外刊读者', '精读 {n} 篇外文文章', (s) => s.reading, [10, 50, 150]],
  ['tasks', '✅', '执行力', '累计完成 {n} 个任务', (s) => s.tasks, [50, 250, 800]],
  ['dawn', '🌅', '晨读', '{n} 个不同的日子 8 点前开始学习', (s) => s.earlyDays, [5, 20, 60]],
  ['level', '🎓', '登堂入室', '达到 Lv {n}', (s) => s.level, [15, 25, 40]],
].map(([id, icon, name, desc, fn, tiers]) => ({ id, icon, name, desc, fn, tiers }));

// Monthly challenge: four goals that reset on the 1st.
const MONTHLY = [
  ['active', '📅', '出勤', '学习 {n} 天', (m) => m.active, (dim) => dim - 5],
  ['moons', '🧭', '满罗盘', '满罗盘 {n} 天', (m) => m.full, () => 12],
  ['focus', '🍅', '专注', '专注 {n} 小时', (m) => Math.floor(m.focus / 60), () => 30],
  ['cards', '🃏', '复习', '复习 {n} 张闪卡', (m) => m.reviews, () => 600],
].map(([id, icon, name, desc, fn, goal]) => ({ id, icon, name, desc, fn, goal }));

function monthStats(model, y, m) {
  const st = { active: 0, full: 0, focus: 0, reviews: 0 };
  for (let d = new Date(y, m, 1); d.getMonth() === m; d = addDays(d, 1)) {
    const k = dkey(d);
    const day = model.days[k];
    if (!day || k > model.today) continue;
    if (day.score > 0) st.active++;
    if (model.moons.phase(k) === 1) st.full++;
    st.focus += studyMin(day); st.reviews += day.reviews || 0;
  }
  const dim = new Date(y, m + 1, 0).getDate();
  return MONTHLY.map((c) => { const goal = c.goal(dim); const cur = c.fn(st); return Object.assign({}, c, { goal, cur: Math.min(cur, goal), done: cur >= goal }); });
}

function computeGame(model) {
  const { days, today, courses } = model;
  const sh = shieldStreak(model);
  model.streak = sh.streak;
  model.longest = sh.longest;
  const codes = courses.map((c) => c.code);
  const dayXp = {};
  const s = { poms: 0, reviews: 0, tasks: 0, reading: 0, fullMoons: 0, longest: sh.longest, moonRun: 0, reviewRun: 0,
    maxFocus: 0, typed: 0, maxTyped: 0, maxCourses: 0, earlyDays: 0 };
  let xp = 0, todayXp = 0, mRun = 0, rRun = 0;
  const keys = Object.keys(days).sort();
  if (keys.length) {
    for (let d = parseKey(keys[0]); dkey(d) <= today; d = addDays(d, 1)) {
      const k = dkey(d);
      const day = days[k];
      const full = !!day && !day.est && model.moons.phase(k) === 1;
      mRun = full ? mRun + 1 : 0; s.moonRun = Math.max(s.moonRun, mRun);
      rRun = day && day.reviews > 0 ? rRun + 1 : (k === today ? rRun : 0); s.reviewRun = Math.max(s.reviewRun, rRun);
      if (!day) continue;
      const q = model.moons.habits(k).filter((x) => x.done).length;
      dayXp[k] = day.score + q * QUEST_XP + (q === HABITS.length ? CHEST_XP : 0);
      // Days guessed from file dates are shown, but earn no XP and no streak.
      if (!day.est) xp += dayXp[k];
      if (k === today) todayXp = dayXp[k];
      if (full) s.fullMoons++;
      s.poms += day.poms || 0; s.reviews += day.reviews || 0; s.tasks += day.tasks || 0; s.reading += day.reading || 0;
      s.maxFocus = Math.max(s.maxFocus, studyMin(day));
      if (!day.est) {
        s.typed += day.words || 0;
        s.maxTyped = Math.max(s.maxTyped, day.words || 0);
        s.maxCourses = Math.max(s.maxCourses, codes.filter((c) => typedIn(day, c) >= 30).length);
        if (day.hours && day.hours[5] + day.hours[6] + day.hours[7] > 0) s.earlyDays++;
      }
    }
  }
  const level = levelOf(xp);
  s.level = level;
  const quests = model.moons.habits(today);
  const unlocked = UNLOCKS.filter((u) => u.lv <= level);
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(model.now.getFullYear(), model.now.getMonth() - i, 1);
    months.push({ y: d.getFullYear(), m: d.getMonth(), list: monthStats(model, d.getFullYear(), d.getMonth()) });
  }
  return {
    xp, todayXp, dayXp, level, title: titleOf(level), floor: levelFloor(level), next: levelFloor(level + 1),
    shields: sh.shields, shielded: sh.shielded,
    unlocked, has: new Set(unlocked.map((u) => u.id)),
    nextUnlock: UNLOCKS.find((u) => u.lv > level && ['avatar', 'theme', 'scene'].includes(u.type)) || null,
    quests, chest: quests.every((q) => q.done),
    monthly: months[months.length - 1], months,
    achievements: ACHIEVEMENTS.map((a) => {
      const cur = a.fn(s);
      const tier = a.tiers.filter((n) => cur >= n).length;
      const goal = a.tiers[Math.min(tier, a.tiers.length - 1)];
      return Object.assign({}, a, { cur, tier, goal, maxed: tier === a.tiers.length });
    }),
    stats: s,
  };
}

/**
 * The 本周 list, built from the calendar instead of a hand-written section:
 * this week's lecture of every course with its reading checkboxes, deadlines
 * that fall in this term week, exam milestones, and earlier lectures still marked
 * 待补. The hand-written 「本周」 section of the schedule note is kept only while its
 * date range is current. Readings are listed but never counted: nobody finishes a
 * reading list, so a 0 / 27 tally only sends you hunting for what is unticked.
 */
function weeklyPlan(courses, deadlines, manual, now, milestones) {
  const start = monday(now), end = addDays(start, 6);
  const groups = courses.map((c) => ({ code: c.code, color: c.color, lec: c.items.find((x) => x.inWeek) })).filter((g) => g.lec);
  const overdue = courses.flatMap((c) => c.items.filter((x) => x.status === 'overdue').map((it) => ({ code: c.code, color: c.color, it })));
  const dls = deadlines.filter((d) => day0(d.due) >= day0(start) && day0(d.due) <= day0(end));
  const range = [...String(manual.heading).matchAll(/(\d{1,2})-(\d{1,2})/g)].pop();
  const manualEnd = range ? inferDate(+range[1], +range[2], null, now) : null;
  const stale = !!manualEnd && day0(manualEnd) < day0(now);
  const toRead = courses.flatMap((c) => c.items.filter((x) => x.status === 'attended' && x.guides).map((it) => ({ code: c.code, color: c.color, it })));
  const ms = (milestones || []).filter((m) => m.status === 'overdue' || (day0(m.start) <= day0(end) && day0(m.end) >= day0(start)));
  const all = ms.concat(stale ? [] : manual.tasks);
  return { start, end, label: termLabel(now), groups, overdue, toRead, deadlines: dls, manual, stale, milestones: ms,
    done: all.filter((x) => x.done).length, total: all.length };
}

/**
 * The first thing to read on the dashboard: at most three dated things, most
 * pressing first. 0 happens today · 1 late · 2 within days · 3 a milestone this week
 * · 4 a lecture you sat through whose guide is still unread.
 */
function nowList(model) {
  const today = day0(model.now);
  const gap = (d) => Math.round((day0(d) - today) / 864e5);
  const rows = [];
  const add = (rank, when, tone, code, text, go) => rows.push({ rank, when, tone, code, text, go });
  for (const c of model.courses) {
    for (const it of c.items) if (!it.done && !it.estimated && gap(it.due) === 0) add(0, '今天', 'hot', c.code, it.label, { course: c.code });
  }
  if (!model.week.stale) {
    for (const t of model.week.manual.tasks) {
      const m = t.text.match(/(?:^|[^\d])(\d{1,2})-(\d{1,2})(?!\d)/);
      if (t.done || !m || rows.some((r) => r.code && t.text.includes(r.code))) continue;
      const n = gap(inferDate(+m[1], +m[2], null, model.now));
      if (n === 0) add(0, '今天', 'hot', '', t.text, { schedule: true });
      if (n === 1) add(2, '明天', 'warm', '', t.text, { schedule: true });
    }
  }
  for (const d of model.deadlines) {
    const n = gap(d.due);
    if (!d.fuzzy && n <= 3) add(n ? 2 : 0, n ? `还有 ${n} 天` : '今天', n ? 'warm' : 'hot', '', d.title, { schedule: true });
  }
  const late = new Set();
  for (const m of model.milestones) {
    if (m.status === 'overdue' && !late.has(m.code)) { late.add(m.code); add(1, `逾期 ${-m.left} 天`, 'hot', m.code, m.text, { task: m }); }
    else if ((m.status === 'active' || m.status === 'upcoming') && m.left <= 7) add(3, `${mdd(m.end)} 前`, 'warm', m.code, m.text, { task: m });
  }
  for (const { code, it } of model.week.toRead) add(4, '待读', 'warm', code, it.label, { guide: it.guideLink });
  return rows.sort((a, b) => a.rank - b.rank).slice(0, 3);
}

function rangeKeys(model, range) {
  const n = range === 'year' ? Math.floor((model.now - new Date(model.now.getFullYear(), 0, 1)) / 864e5) + 1 : range;
  const keys = [];
  for (let j = n - 1; j >= 0; j--) keys.push(dkey(addDays(model.now, -j)));
  return keys;
}

function quantileLevels(values) {
  const nz = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (!nz.length) return () => 0;
  const q = (p) => nz[Math.min(nz.length - 1, Math.floor(p * nz.length))];
  const t = [q(0.25), q(0.5), q(0.75)];
  return (v) => (v <= 0 ? 0 : v <= t[0] ? 1 : v <= t[1] ? 2 : v <= t[2] ? 3 : 4);
}

const METRICS = {
  score: { label: '贡献分', get: (d) => d.score, unit: '分', fmt: fmt1 },
  words: { label: '新增字数', get: (d) => d.words, unit: '词', fmt: fmtInt },
  notes: { label: '新建笔记', get: (d) => d.notes, unit: '篇', fmt: fmtInt },
  tasks: { label: '完成任务', get: (d) => d.tasks, unit: '项', fmt: fmtInt },
  focus: { label: '专注时间', get: studyMin, unit: '分钟', fmt: fmtInt },
  reading: { label: '英语阅读', get: (d) => d.reading, unit: '篇', fmt: fmtInt },
};
