'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Pulse } = require('./helpers.js');

const P = Pulse.__preview;
const NOW = new Date(2026, 10, 11, 10);
const text = P.guideText('我的课程');
// The fenced examples in the guide, in order.
const blocks = [...text.matchAll(/```(?:markdown)?\n([\s\S]*?)```/g)].map((m) => m[1]);

test('the guide lives with the plugin\'s other notes and names the user\'s course folder', () => {
  assert.equal(P.GUIDE_PATH, '学期罗盘/使用指南.md');
  assert.ok(text.includes('「我的课程」文件夹'));
  assert.ok(text.includes('我的课程/示例课 DEMO101'));
});

test('every lecture heading format the guide promises is recognised', () => {
  const heading = blocks.find((b) => b.startsWith('### '));
  const m = P.matchLecture(heading.split('\n')[0]);
  assert.ok(m, 'example heading');
  assert.equal(m.n, 3);
  for (const t of ['第 3 周 · 主题', '第 3 课 · 主题', 'Lecture 3 · Topic', 'Week 3 · Topic', 'L3 · Topic'])
    assert.ok(P.matchLecture(`### ${t}`), t);
  for (const d of ['11-11', '2026-11-11', '11月11日']) assert.ok(P.findDate(`第 3 讲 · 主题 · ${d}`), d);
});

test('the plan example gives three milestones and the note names it suggests are plan notes', () => {
  const plan = blocks.find((b) => b.startsWith('## 时间表'));
  assert.equal(P.parseMilestones('ECON201', 'p.md', plan, NOW).length, 3);
  for (const n of ['作业与考试.md', '期末备考.md', 'Assessment.md', 'Essay plan.md']) assert.ok(P.isPlanNote(n), n);
});

test('the key-dates example gives two countdowns', () => {
  const dates = blocks.find((b) => b.startsWith('## 关键日期'));
  assert.equal(P.parseDeadlines(dates, NOW).length, 2);
});
