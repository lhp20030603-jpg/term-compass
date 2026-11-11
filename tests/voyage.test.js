'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Pulse } = require('./helpers.js');

const P = Pulse.__preview;
const NOW = new Date(2026, 10, 11, 10);
const ROOT = '课程', COURSE = '示例课 DEMO101';
const files = P.sampleSemester(NOW, ROOT);
const paths = Object.keys(files);
const SETTINGS = { courseRoot: ROOT, courses: COURSE, englishRoot: '英语', readingFolder: '', scheduleFile: `${ROOT}/学期总览.md`, termStart: '2026-09-28', termEnd: '2026-12-11', yearStartMonth: 9 };
const model = (over) => P.withGame(P.buildModel(Object.assign({ files: [], cache: {}, tracked: {}, now: NOW, pomo: { mode: 'idle' }, settings: SETTINGS,
  resolve: (l) => paths.find((p) => p.endsWith(`/${l}.md`)) || null,
  texts: { schedule: files[`${ROOT}/学期总览.md`], courseHomes: { [COURSE]: { path: `${ROOT}/${COURSE}/课程主页.md`, text: files[`${ROOT}/${COURSE}/课程主页.md`] } },
    plans: [{ code: COURSE, path: `${ROOT}/${COURSE}/作业与考试.md`, text: files[`${ROOT}/${COURSE}/作业与考试.md`] }] } }, over)));

test('the voyage has one column per term week, numbered from 1, with today marked', () => {
  const v = P.voyage(model());
  assert.equal(v.weeks, 11);                 // 09-28 … 12-11, Monday weeks
  assert.equal(v.cols[0].n, 1);
  assert.equal(v.nowIdx, 6);                 // 11-11 is in week 7
  assert.equal(v.cols.filter((c) => c.now).length, 1);
  assert.equal(v.cols[5].past, true);
});

test('each course row places its lectures in their week with their status', () => {
  const row = P.voyage(model()).rows[0];
  assert.equal(row.code, COURSE);
  const placed = row.marks.map((m) => `${m.w}:${m.n}:${m.status}`);
  assert.deepEqual(placed, ['4:1:attended', '5:2:attended', '6:3:week', '7:4:future']);
});

test('deadlines and milestones become flags in their week, exams marked as exams', () => {
  const v = P.voyage(model());
  const kinds = v.flags.map((f) => `${f.w}:${f.kind}`);
  assert.ok(kinds.includes('7:deadline'), kinds.join(' '));
  assert.ok(kinds.includes('10:exam'), kinds.join(' '));
  assert.ok(v.flags.some((f) => f.kind === 'milestone'));
});

test('anything after the term is counted, not drawn off the edge', () => {
  const v = P.voyage(model());
  assert.equal(v.after, 1);                  // the final exam two months away
  assert.ok(v.flags.every((f) => f.w >= 0 && f.w < v.weeks));
});

test("a week view lists that week's lectures and flags", () => {
  const v = P.voyage(model());
  assert.ok(P.voyageWeek(v, 6).items.some((x) => /市场失灵/.test(x.text)));
  assert.ok(P.voyageWeek(v, 7).items.some((x) => /小论文/.test(x.text)));     // due six days from Wednesday: next week
});

test('the compass lights one direction per habit, all four is full', () => {
  assert.deepEqual(P.compassParts([true, false, true, false]), { lit: [true, false, true, false], full: false });
  assert.equal(P.compassParts([true, true, true, true]).full, true);
});
