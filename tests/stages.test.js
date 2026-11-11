'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Pulse, TFile, obsidian } = require('./helpers.js');

const P = Pulse.__preview;
const SETTINGS = { courseRoot: '课程', courses: 'ECON101, ECON201', englishRoot: '英语', readingFolder: '英语/写作/每日阅读' };
const NOW = new Date(2026, 10, 12, 12);
const build = (over) => P.withGame(P.buildModel(Object.assign({ files: [], cache: {}, tracked: {}, settings: SETTINGS, now: NOW, pomo: { mode: 'idle' }, resolve: (l) => `课程/ECON101/导读/${l}.md`, texts: { schedule: '', courseHomes: {}, plans: [] } }, over)));
const day = (over) => Object.assign(P.emptyDay(), over);

const lecture = (date, guide) => `### 第 5 讲 · 生物多样性 Biodiversity · ${date}\n${guide ? '- [[导读 A]]\n' : ''}`;
const status = (date, guide, opts, now = NOW) => P.lectureStatus(P.parseStatusItems(lecture(date, guide)), now, () => true, opts)[0];

test('past, with a guide, but unread: 上过 not 完成', () => {
  const it = status('11-11', true);
  assert.equal(it.status, 'attended');
  assert.equal(it.done, false);
});

test('ten minutes in the guide completes it', () => {
  assert.equal(status('11-11', true, { readMin: () => 9.9 }).done, false);
  assert.equal(status('11-11', true, { readMin: () => 10 }).done, true);
});

test('reading ahead does not complete a lecture that has not happened', () => {
  const it = status('11-20', true, { readMin: () => 30 });
  assert.equal(it.done, false);
  assert.equal(it.status, 'future');
});

test('a recording on the day counts as attended before the date has passed', () => {
  const opts = { heard: new Set(['2026-11-12']) };
  assert.equal(status('11-12', true, opts).status, 'attended');
  assert.equal(status('11-12', true, Object.assign({ readMin: () => 15 }, opts)).done, true);
});

test('a recording with no guide is 上过, a past lecture with neither is 待补', () => {
  assert.equal(status('11-04', false, { heard: new Set(['2026-11-04']) }).status, 'attended');
  assert.equal(status('10-14', false).status, 'overdue');
});

test('a written 完成 still wins', () => {
  const items = P.lectureStatus(P.parseStatusItems('### 第 5 讲 · 生物多样性 · 11-11 完成\n- [[导读 A]]\n'), NOW, () => true);
  assert.equal(items[0].done, true);
  assert.equal(items[0].auto, false);
});

test('an attended lecture counts half in the progress ring', () => {
  const m = build({ texts: { schedule: '', plans: [], courseHomes: { ECON101: { path: 'h.md', text: lecture('11-11', true) } } } });
  const c = m.courses[0];
  assert.equal(c.progress, 0.5);
  assert.equal(c.sAttended, 1);
});

test('reading time comes from the guide path and completes the lecture', () => {
  const m = build({ reading: { '课程/ECON101/导读/导读 A.md': 600 }, texts: { schedule: '', plans: [], courseHomes: { ECON101: { path: 'h.md', text: lecture('11-11', true) } } } });
  assert.equal(m.courses[0].items[0].done, true);
});

test('an unread guide of an attended lecture is listed in the week and the now card', () => {
  const m = build({ texts: { schedule: '', plans: [], courseHomes: { ECON101: { path: 'h.md', text: lecture('11-11', true) } } } });
  assert.equal(m.week.toRead.length, 1);
  const row = P.nowList(m)[0];
  assert.equal(row.when, '待读');
  assert.equal(row.go.guide, '导读 A');
});

test('a lecture with only a recording is not called unread', () => {
  const m = build({ recordings: [{ date: '2026-11-11', minutes: 60, course: 'ECON101' }], texts: { schedule: '', plans: [], courseHomes: { ECON101: { path: 'h.md', text: lecture('11-11', false) } } } });
  assert.equal(m.week.toRead.length, 0);
  assert.deepEqual(P.nowList(m), []);
});

test('new XP pays for time and recall, not saving or pasting', () => {
  const tracked = { '2026-11-12': day({ focus: 50, words: 500, pasted: 90000, notes: 9, edits: 40, tasks: 2, readSec: 1200 }) };
  const m = build({ tracked, recordings: [{ date: '2026-11-12', minutes: 60, course: 'ECON101' }], recall: { '2026-11-12': { reviews: 10 } } });
  assert.equal(m.days['2026-11-12'].score, 50 + 30 + 10 + 10 + 10 + 4);
});

test('听课 and 读导读 count towards the 专注 habit', () => {
  const tracked = { '2026-11-12': day({ focus: 10, readSec: 600 }) };
  const focus = (m) => m.game.quests.find((q) => q.key === 'focus');
  assert.equal(focus(build({ tracked })).done, false);
  const m = build({ tracked, recordings: [{ date: '2026-11-12', minutes: 30, course: 'ECON101' }] });
  assert.equal(focus(m).done, true);
  assert.match(focus(m).prog.text, /50 \/ 50/);
});

test('a recording outside the courses is not a lecture', () => {
  const m = build({ tracked: { '2026-11-12': day({}) }, recordings: [{ date: '2026-11-12', minutes: 30, course: '其他' }] });
  assert.equal(m.days['2026-11-12'].lecture, 0);
});

test('a lecture day appears even with nothing else tracked', () => {
  const m = build({ tracked: { '2026-11-01': day({}) }, recordings: [{ date: '2026-11-10', minutes: 90, course: 'ECON101' }] });
  assert.equal(m.days['2026-11-10'].lecture, 90);
});

test('the 课程 habit counts only your own typing', () => {
  const tracked = { '2026-11-12': day({ areas: { ECON101: 5000 }, fileStats: { a: { t: 20, p: 20000, area: 'ECON101' } } }) };
  assert.equal(build({ tracked }).game.quests.find((q) => q.key === 'course').done, false);
});

const words = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
function fakePlugin(reads) {
  const p = Object.create(Pulse.prototype);
  p.app = { vault: { configDir: '.obsidian', cachedRead: async () => reads.shift() }, plugins: { plugins: {} }, workspace: { getActiveViewOfType: () => p.activeView } };
  p.data = { days: {}, pomo: { mode: 'idle' }, reading: {} }; p.cache = {}; p.lastEdit = {}; p.lastMinute = ''; p.ready = true; p.settings = SETTINGS;
  p.keyed = {}; p.pastedAt = {}; p.lastKey = 0; p.lastInput = 0; p.quiet = new Set();
  p.persistSoon = () => {}; p.scheduleRefresh = () => {};
  return p;
}
const file = (path) => Object.assign(new TFile(), { path, extension: 'md' });
const today = (p) => p.data.days[P.dkey(new Date())];

test('words from a tool land in the pasted bucket however few they are', async () => {
  const p = fakePlugin([words(10)]);
  const f = file('课程/ECON101/x.md');
  p.keyed[f.path] = Date.now();              // the editor reloaded the note, but nobody pressed a key
  await p.onModify(f);
  assert.equal(today(p).words, 0);
  assert.equal(today(p).pasted, 10);
});

test('real typing counts as typed', async () => {
  const p = fakePlugin([words(10)]);
  const f = file('课程/ECON101/x.md');
  p.keyed[f.path] = Date.now(); p.lastKey = Date.now();
  await p.onModify(f);
  assert.equal(today(p).words, 10);
});

test('a paste counts as pasted even when small', async () => {
  const p = fakePlugin([words(10)]);
  const f = file('课程/ECON101/x.md');
  p.keyed[f.path] = Date.now(); p.lastKey = Date.now(); p.pastedAt[f.path] = Date.now();
  await p.onModify(f);
  assert.equal(today(p).pasted, 10);
});

global.document = { hasFocus: () => true, querySelectorAll: () => [] };
const reading = (path) => Object.assign(new obsidian.MarkdownView(), { file: file(path) });
const GUIDE = '课程/ECON101/导读/DV 第6章.md';

test('reading a guide adds time to the day and the note', () => {
  const p = fakePlugin([]);
  p.activeView = reading(GUIDE); p.lastInput = Date.now();
  p.readingTick(); p.readingTick();
  assert.equal(today(p).readSec, 30);
  assert.equal(p.data.reading[GUIDE], 30);
});

test('walking away stops the clock', () => {
  const p = fakePlugin([]);
  p.activeView = reading(GUIDE); p.lastInput = Date.now() - 130000;
  p.readingTick();
  assert.equal(p.data.reading[GUIDE], undefined);
});

test('only guides count', () => {
  const p = fakePlugin([]);
  p.activeView = reading('00 Home/Home.md'); p.lastInput = Date.now();
  p.readingTick();
  assert.deepEqual(p.data.reading, {});
});

test('a running pomodoro or recording is not counted twice', () => {
  const p = fakePlugin([]);
  p.activeView = reading(GUIDE); p.lastInput = Date.now();
  p.data.pomo = { mode: 'focus' };
  p.readingTick();
  p.data.pomo = { mode: 'idle' };
  p.host = { mods: { voice: { rec: {} } } };
  p.readingTick();
  assert.deepEqual(p.data.reading, {});
});
