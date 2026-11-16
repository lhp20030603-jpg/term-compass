'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Pulse } = require('./helpers.js');

const P = Pulse.__preview;
const SETTINGS = { courseRoot: '课程', courses: 'ECON101, ECON201', englishRoot: '英语', readingFolder: '', termStart: '2026-09-28', termEnd: '2026-12-11', yearStartMonth: 9 };
const NOW = new Date(2026, 10, 12, 21, 30);   // Thursday; the week began on Monday 11-09
const day = (over) => Object.assign(P.emptyDay(), over);
const hours = (map) => { const a = new Array(24).fill(0); for (const k in map) a[k] = map[k]; return a; };
const build = (over) => P.withGame(P.buildModel(Object.assign({ files: [], cache: {}, tracked: {}, settings: SETTINGS, now: NOW, pomo: { mode: 'idle' },
  resolve: (l) => `课程/ECON101/${l}.md`, texts: { schedule: '', courseHomes: {}, plans: [] } }, over)));

// ── the four directions over a week

test('there are four directions: listen, read, practise, wrap up', () => {
  assert.deepEqual(P.HABITS.map((x) => x.key), ['listen', 'read', 'practice', 'close']);
});

test('a lecture written with a date lights 听 on that day, without a recording', () => {
  const home = '### 第 7 讲 · 外部性 · 11-10\n\n### 第 8 讲 · 公共物品 · 11-17\n';
  const m = build({ texts: { schedule: '', plans: [], courseHomes: { ECON101: { path: 'h.md', text: home } } } });
  assert.equal(m.moons.habits('2026-11-10')[0].done, true);
  assert.equal(m.moons.habits('2026-11-11')[0].done, false);
  assert.equal(m.days['2026-11-17'], undefined, 'a lecture still to come lights nothing');
});

test('the rose counts the days each direction was lit this week, up to today', () => {
  const tracked = {
    '2026-11-09': day({ readSec: 1500, tasks: 1 }),
    '2026-11-10': day({ readSec: 1300 }),
    '2026-11-11': day({ focus: 25, tasks: 2 }),
    '2026-11-13': day({ tasks: 5 }),   // tomorrow: not counted yet
  };
  const wk = build({ tracked }).rose.week('2026-11-12');
  assert.deepEqual(wk.counts, [0, 2, 1, 2]);
  assert.equal(wk.days.length, 4);
  assert.equal(wk.full, false);
});

test('a week with all four directions lit earns one shield, on the day it fills up', () => {
  const tracked = {
    '2026-11-09': day({ readSec: 1500 }),
    '2026-11-10': day({ focus: 25 }),
    '2026-11-11': day({ tasks: 1 }),
  };
  const three = build({ tracked });
  assert.equal(three.game.shields, 0);
  const four = build({ tracked, recordings: [{ date: '2026-11-11', minutes: 50, course: 'ECON101' }] });
  assert.equal(four.rose.week('2026-11-12').full, true);
  assert.equal(four.game.shields, 1);
});

test('three directions in one day open the chest', () => {
  const two = build({ tracked: { '2026-11-12': day({ readSec: 1200, tasks: 1 }) } });
  assert.equal(two.game.chest, false);
  const three = build({ tracked: { '2026-11-12': day({ readSec: 1200, tasks: 1, focus: 25 }) } });
  assert.equal(three.game.chest, true);
});

// ── tide

test('the tide needs a few days before it names your high water', () => {
  const t = P.tide(build({ tracked: { '2026-11-11': day({ hours: hours({ 11: 30 }) }) } }));
  assert.equal(t.days, 1);
  assert.equal(t.state, null);
});

test('the tide finds two windows, one crossing midnight, and knows where now is', () => {
  const tracked = {};
  for (const d of ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11'])
    tracked[d] = day({ hours: hours({ 11: 50, 12: 40, 13: 30, 21: 30, 22: 30, 23: 30, 0: 25, 16: 5 }) });
  const t = P.tide(build({ tracked }));
  assert.equal(t.days, 4);
  assert.deepEqual(t.windows.map((w) => [w.from, w.to % 24, w.name]), [[11, 14, '午潮'], [21, 1, '晚潮']]);
  assert.deepEqual(t.state, { kind: 'high', name: '晚潮', until: 1 });
  const afternoon = P.tide(build({ tracked, now: new Date(2026, 10, 12, 16, 0) }));
  assert.deepEqual(afternoon.state, { kind: 'low', name: '晚潮', at: 21, inHours: 5 });
});

test('the week mix adds up minutes by kind and keeps last week for comparison', () => {
  const tracked = {
    '2026-11-03': day({ readSec: 600, focus: 50 }),
    '2026-11-10': day({ readSec: 1800, tasks: 2 }),
    '2026-11-11': day({ focus: 25 }),
  };
  const mix = P.weekMix(build({ tracked, recordings: [{ date: '2026-11-11', minutes: 60, course: 'ECON101' }], recall: { '2026-11-10': { reviews: 12 } } }));
  assert.deepEqual([mix.cur.read, mix.cur.focus, mix.cur.lecture, mix.cur.tasks, mix.cur.reviews], [30, 25, 60, 2, 12]);
  assert.equal(mix.cur.minutes, 115);
  assert.deepEqual([mix.prev.read, mix.prev.focus], [10, 50]);
});

// ── depth chart

const HOME = ['### 第 1 讲 · 导论 · 10-13\n- [[n1]]', '### 第 2 讲 · 供需 · 10-20\n- [[n2]]', '### 第 3 讲 · 弹性 · 10-27\n- [[n3]]',
  '### 第 4 讲 · 外部性 · 11-03\n- [[n4]]', '### 第 5 讲 · 公共物品 · 11-24\n- [[n5]]'].join('\n\n') + '\n';
const SCHEDULE = '## 关键日期\n\n| 日期 | 事项 | 课程 |\n|---|---|---|\n| 11-20 | 小论文截止 | ECON101 |\n| 12-10 | 期末考试 | ECON101 |\n';
const depthModel = () => build({
  files: [1, 2, 3, 4, 5].map((n) => ({ path: `课程/ECON101/n${n}.md`, ctime: 0, mtime: 0 })),
  reading: { '课程/ECON101/n2.md': 900, '课程/ECON101/n3.md': 900, '课程/ECON101/n4.md': 900 },
  texts: { schedule: SCHEDULE, plans: [], courseHomes: { ECON101: { path: '课程/ECON101/课程主页.md', text: HOME } } },
});

test('each lecture gets a depth: not yet, attended, read, practised, kept', () => {
  const cards = { '课程/ECON101/n3.md': { total: 5, started: 2, mature: 0 }, '课程/ECON101/n4.md': { total: 5, started: 5, mature: 4 }, '课程/ECON101/n5.md': { total: 3, started: 3, mature: 3 } };
  const row = P.depthChart(depthModel(), cards).find((r) => r.code === 'ECON101');
  assert.deepEqual(row.cells.map((c) => c.level), [1, 2, 3, 4, 0]);
  assert.equal(row.taught, 4);
  assert.equal(row.shallow, 1);
  assert.equal(row.cells[1].link, '课程/ECON101/n2.md');
});

test('the depth chart counts down to the exam, not to an essay deadline', () => {
  const row = P.depthChart(depthModel(), {}).find((r) => r.code === 'ECON101');
  assert.equal(row.exam.title, '期末考试');
  assert.equal(row.exam.left, 28);
});

test('a course with no lectures written is left out of the depth chart', () => {
  assert.equal(P.depthChart(depthModel(), {}).some((r) => r.code === 'ECON201'), false);
});
