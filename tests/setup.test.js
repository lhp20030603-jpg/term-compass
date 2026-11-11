'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Pulse, Recall } = require('./helpers.js');

const P = Pulse.__preview;
const NOW = new Date(2026, 10, 11, 10);   // a Wednesday
const ROOT = '课程';
const files = P.sampleSemester(NOW, ROOT);
const paths = Object.keys(files);
const COURSE = '示例课 DEMO101';

test('the sample semester is a homepage, two lecture notes, an exam plan and a key-dates note', () => {
  assert.deepEqual(paths.sort(), [`${ROOT}/${COURSE}/作业与考试.md`, `${ROOT}/${COURSE}/第 1 讲 笔记.md`, `${ROOT}/${COURSE}/第 2 讲 笔记.md`, `${ROOT}/${COURSE}/课程主页.md`, `${ROOT}/学期总览.md`].sort());
});

const model = () => {
  P.useTerm({ termStart: '2026-09-28', termEnd: '2026-12-11', yearStartMonth: 9 });
  const home = `${ROOT}/${COURSE}/课程主页.md`;
  return P.withGame(P.buildModel({ files: paths.map((p) => ({ path: p, ctime: NOW.getTime(), mtime: NOW.getTime() })), cache: {}, tracked: {}, now: NOW, pomo: { mode: 'idle' },
    settings: { courseRoot: ROOT, courses: COURSE, englishRoot: '英语', readingFolder: '', scheduleFile: `${ROOT}/学期总览.md`, termStart: '2026-09-28', termEnd: '2026-12-11', yearStartMonth: 9 },
    resolve: (l) => paths.find((p) => p.endsWith(`/${l}.md`)) || null,
    texts: { schedule: files[`${ROOT}/学期总览.md`], courseHomes: { [COURSE]: { path: home, text: files[home] } }, plans: [{ code: COURSE, path: `${ROOT}/${COURSE}/作业与考试.md`, text: files[`${ROOT}/${COURSE}/作业与考试.md`] }] } }));
};

test('right after setup every part of the dashboard has something in it', () => {
  const m = model();
  const c = m.courses[0];
  assert.equal(c.items.length, 4);
  assert.equal(c.homePath.endsWith('课程主页.md'), true);
  assert.ok(m.week.groups.length, 'a lecture this week');
  assert.ok(m.deadlines.length >= 2, 'upcoming deadlines');
  assert.ok(m.milestones.some((x) => x.status === 'active'), 'a milestone running now');
  assert.ok(P.nowList(m).length >= 2, 'the now card has rows');
  assert.ok(m.week.toRead.length >= 1, 'a past lecture waiting to be read');
});

test('the sample notes make flashcards', () => {
  const R = Recall.__preview;
  const cards = paths.flatMap((p) => R.parseCards(p, files[p], { courseRoot: ROOT }));
  assert.ok(cards.filter((c) => c.kind === 'term').length >= 4);
  assert.ok(cards.filter((c) => c.kind === 'quiz').length >= 2);
});

test('the check report says what was found, and how to fix what was not', () => {
  const report = P.recognitionReport(model(), { [COURSE]: 9 });
  const course = report.find((s) => s.title === COURSE);
  assert.ok(course.rows.every((r) => r.ok !== false), JSON.stringify(course.rows));
  assert.ok(report.find((s) => s.title === '学期').rows[0].ok);
});

test('a course without a homepage gets a concrete fix', () => {
  const m = model();
  m.courses.push({ code: '空课', items: [], homePath: null });
  const rows = P.recognitionReport(m, {}).find((s) => s.title === '空课').rows;
  assert.equal(rows[0].ok, false);
  assert.match(rows[0].fix, /第 1 讲/);
});

test('an unset term is flagged in the report', () => {
  const m = model();
  P.useTerm({ termStart: '', termEnd: '' });
  assert.equal(P.recognitionReport(m, {}).find((s) => s.title === '学期').rows[0].ok, false);
});

test('no courses at all says so', () => {
  const m = model();
  m.courses = [];
  const rows = P.recognitionReport(m, {}).find((s) => s.title === '课程').rows;
  assert.equal(rows[0].ok, false);
});
