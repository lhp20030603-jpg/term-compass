'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Pulse, TFile } = require('./helpers.js');

const P = Pulse.__preview;
const day = (d) => P.dkey(d);
const SETTINGS = { courseRoot: '课程', courses: 'ECON101, ECON201', englishRoot: '英语', readingFolder: '英语/写作/每日阅读' };
const buildModel = (over) => P.withGame(P.buildModel(Object.assign({ files: [], cache: {}, tracked: {}, settings: SETTINGS, now: new Date(2026, 10, 5, 12), pomo: { mode: 'idle' }, texts: { schedule: '', courseHomes: {} } }, over)));

test('year-less dates stay in the academic year after New Year', () => {
  assert.equal(day(P.inferDate(10, 28, null, new Date(2027, 0, 25))), '2026-10-28');
  assert.equal(day(P.inferDate(12, 7, null, new Date(2027, 0, 1))), '2026-12-07');
  assert.equal(day(P.inferDate(1, 15, null, new Date(2026, 10, 5))), '2027-01-15');
  assert.equal(day(P.inferDate(4, 20, null, new Date(2027, 2, 1))), '2027-04-20');
  assert.equal(day(P.inferDate(10, 8, 2026, new Date(2027, 5, 1))), '2026-10-08');
});

const HOME = '### 第 5 讲 · 生物多样性 Biodiversity · 11-11\n- [[DV 第6章 导读]]\n';

test('a lecture with a guide is not done before its date', () => {
  const items = P.lectureStatus(P.parseStatusItems(HOME), new Date(2026, 10, 9, 12), () => true);
  assert.equal(items[0].status, 'week');
  assert.equal(items[0].done, false);
});

test('a lecture completes itself once its date has passed and its guide was read', () => {
  const items = P.lectureStatus(P.parseStatusItems(HOME), new Date(2026, 10, 12, 12), () => true, { readMin: () => 12 });
  assert.equal(items[0].done, true);
  assert.equal(items[0].auto, true);
});

test('course progress survives New Year', () => {
  const home = '### 第 1 讲 · 导论 Intro · 10-14\n- [[导读 A]]\n';
  const read = { readMin: () => 12 };
  const before = P.lectureStatus(P.parseStatusItems(home), new Date(2026, 11, 31, 12), () => true, read);
  const after = P.lectureStatus(P.parseStatusItems(home), new Date(2027, 0, 1, 12), () => true, read);
  assert.equal(before[0].done, true);
  assert.equal(after[0].done, true);
});

const TABLE = `## 0. 关键日期

| 日期 | 事项 | 课程 |
|---|---|---|
| **10-30（建议 10-23 前）** | Mentoring 申请截止 | 院系 |
| 11-04 发题 → **11-11 交** | ECON201 Tutorial 2 作业 | ECON201 |
| **2027-01-15（周五）14:00–17:00** | **ECON201 第一场线下考试** | ECON201 |
| 2027 年 4 月中下旬 | **ECON201 第二场线下考试（50%）** | ECON201 |
| 下学期 | ECON101 第二次 48 小时作业（50%） | ECON101 |
`;

test('deadlines without an exact day are kept and marked approximate', () => {
  const list = P.parseDeadlines(TABLE, new Date(2026, 10, 5));
  const exam = list.find((d) => d.title.includes('第二场'));
  const essay = list.find((d) => d.title.includes('第二次'));
  assert.equal(day(exam.due), '2027-04-11');
  assert.equal(exam.fuzzy, true);
  assert.equal(essay, undefined);             // 「下学期」 names no month, so the row is skipped
  assert.equal(list.length, 4);
});

test('a date inside brackets is a note, not the deadline', () => {
  const list = P.parseDeadlines(TABLE, new Date(2026, 9, 1));
  assert.equal(day(list.find((d) => d.title.includes('Mentoring')).due), '2026-10-30');
});

test('exact deadlines are not marked approximate', () => {
  const list = P.parseDeadlines(TABLE, new Date(2026, 10, 5));
  assert.equal(!!list.find((d) => d.title.includes('第一场')).fuzzy, false);
});

const flips = (a, b) => P.taskFlips(P.taskIndex(a), P.taskIndex(b));

test('generated or pasted [x] lines are not ticks', () => {
  const generated = Array.from({ length: 14 }, (_, i) => `- [x] 已确认的事项 ${i}`).join('\n');
  assert.equal(flips('', generated), 0);
});

test('ticking a box counts once', () => {
  assert.equal(flips('- [ ] 读 Coase\n', '- [x] 读 Coase\n'), 1);
});

test('Tempo moving a finished task to 已完成 counts once', () => {
  const before = '## 今天\n- [ ] 写作业 #ECON201 📅 2026-11-04\n\n## 已完成\n';
  const after = '## 今天\n\n## 已完成\n- [x] 写作业 #ECON201 📅 2026-11-04 ✅ 2026-11-05\n';
  assert.equal(flips(before, after), 1);
});

test('moving a task between lists is not a tick', () => {
  assert.equal(flips('## 今天\n- [ ] a\n## 接下来\n', '## 今天\n## 接下来\n- [ ] a\n'), 0);
});

test('unticking takes the tick back', () => {
  assert.equal(flips('- [x] a ✅ 2026-11-05\n', '- [ ] a\n'), -1);
});

test('two identical lines tick separately', () => {
  assert.equal(flips('- [ ] a\n- [ ] a\n', '- [x] a\n- [ ] a\n'), 1);
  assert.equal(flips('- [x] a\n- [ ] a\n', '- [x] a\n- [x] a\n'), 1);
});

function fakePlugin(reads) {
  const p = Object.create(Pulse.prototype);
  p.app = { vault: { configDir: '.obsidian', cachedRead: async () => reads.shift() }, plugins: { plugins: {} } };
  p.data = { days: {}, pomo: { mode: 'idle' } }; p.cache = {}; p.lastEdit = {}; p.lastMinute = ''; p.ready = true; p.settings = SETTINGS;
  p.keyed = {}; p.pastedAt = {}; p.lastKey = 0; p.quiet = new Set();
  p.persistSoon = () => {}; p.scheduleRefresh = () => {};
  return p;
}
const file = (path) => Object.assign(new TFile(), { path, extension: 'md' });

test('an AI-written note full of [x] adds no tasks', async () => {
  const body = Array.from({ length: 14 }, (_, i) => `- [x] 事项 ${i}`).join('\n');
  const p = fakePlugin([body]);
  const f = file('论文/x.md');
  await p.onCreate(f); await p.onModify(f);
  assert.equal(p.data.days[P.dkey(new Date())].tasks, 0);
});

test('a real tick in a tracked note adds one task and an untick removes it', async () => {
  const p = fakePlugin(['- [ ] a\n', '- [x] a\n', '- [ ] a\n']);
  const f = file('00 Home/x.md');
  await p.onCreate(f);
  await p.onModify(f); await p.onModify(f);
  assert.equal(p.data.days[P.dkey(new Date())].tasks, 1);
  await p.onModify(f);
  assert.equal(p.data.days[P.dkey(new Date())].tasks, 0);
});

test('a day after tracking began is never estimated from file dates', () => {
  const now = new Date(2026, 10, 5, 12);
  const touched = { path: '课程/ECON101/x.md', ctime: new Date(2026, 9, 1).getTime(), mtime: now.getTime() };
  const m = buildModel({ files: [touched], cache: { [touched.path]: { w: 500 } }, tracked: { '2026-10-25': Object.assign(P.emptyDay(), { edits: 1 }) }, now });
  assert.equal(m.days['2026-11-05'], undefined);
  assert.equal(m.game.quests.find((q) => q.key === 'course').done, false);
});

test('days before tracking began are still estimated', () => {
  const made = { path: '课程/ECON101/x.md', ctime: new Date(2026, 9, 1, 12).getTime(), mtime: new Date(2026, 9, 1, 12).getTime() };
  const m = buildModel({ files: [made], cache: { [made.path]: { w: 500 } }, tracked: { '2026-10-25': Object.assign(P.emptyDay(), { edits: 1 }) } });
  assert.equal(m.days['2026-10-01'].est, true);
});

test('only typed words count towards pushing several courses in one day', () => {
  const tracked = { '2026-11-02': Object.assign(P.emptyDay(), {
    edits: 1, areas: { ECON101: 500, ECON201: 500 },
    fileStats: { a: { t: 40, p: 0, area: 'ECON101' }, b: { t: 0, p: 2000, area: 'ECON201' } },
  }) };
  assert.equal(buildModel({ tracked }).game.stats.maxCourses, 1);
});

