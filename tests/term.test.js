'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Pulse } = require('./helpers.js');

const P = Pulse.__preview;
const day = (d) => P.dkey(d);
const term = (over) => P.useTerm(Object.assign({ termStart: '2026-09-28', termEnd: '2026-12-11', yearStartMonth: 9 }, over));

test('weeks start on Monday and count from the week the term starts in', () => {
  term();
  assert.equal(P.termLabel(new Date(2026, 8, 30)), '第 1 周');      // Wed of the first week
  assert.equal(P.termLabel(new Date(2026, 9, 4, 23)), '第 1 周');   // Sunday night
  assert.equal(P.termLabel(new Date(2026, 9, 5, 0, 30)), '第 2 周'); // Monday
  assert.equal(P.termLabel(new Date(2026, 10, 9)), '第 7 周');       // across the October clock change
});

test('before and after the term say so', () => {
  term();
  assert.equal(P.termLabel(new Date(2026, 8, 25)), '开学前 · 还有 3 天');
  assert.equal(P.termLabel(new Date(2026, 11, 20)), '假期 · 12月20日');
});

test('an unset term is guessed from the date', () => {
  term({ termStart: '', termEnd: '' });
  const autumn = P.termFor(new Date(2026, 10, 5));
  assert.equal(`${day(autumn.start)} ${day(autumn.end)} ${autumn.guessed}`, '2026-09-01 2027-01-31 true');
  const january = P.termFor(new Date(2027, 0, 10));
  assert.equal(day(january.start), '2026-09-01');
  const spring = P.termFor(new Date(2027, 2, 10));
  assert.equal(`${day(spring.start)} ${day(spring.end)}`, '2027-02-01 2027-06-30');
});

test('a year-less date follows the academic year', () => {
  term();
  assert.equal(day(P.inferDate(10, 28, null, new Date(2027, 0, 25))), '2026-10-28');
  assert.equal(day(P.inferDate(1, 15, null, new Date(2026, 10, 5))), '2027-01-15');
  assert.equal(day(P.inferDate(6, 10, null, new Date(2026, 10, 5))), '2027-06-10');
});

test('a calendar-year school (Australia, New Zealand) keeps every date in one year', () => {
  term({ termStart: '2027-02-22', termEnd: '2027-06-04', yearStartMonth: 1 });
  assert.equal(day(P.inferDate(11, 3, null, new Date(2027, 2, 1))), '2027-11-03');
  assert.equal(day(P.inferDate(2, 22, null, new Date(2027, 9, 1))), '2027-02-22');
});

test('lectures without a date fall in week N of the term', () => {
  term();
  const items = P.lectureStatus(P.parseStatusItems('### 第 3 讲 · 市场 Markets\n'), new Date(2026, 8, 28), () => false);
  assert.equal(day(items[0].due), '2026-10-12');
});

test('the week list runs Monday to Sunday', () => {
  term();
  const w = P.weeklyPlan([], [], { heading: '', tasks: [] }, new Date(2026, 10, 6), []);
  assert.equal(`${day(w.start)} ${day(w.end)}`, '2026-11-02 2026-11-08');
});
