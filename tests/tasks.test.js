'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Tempo } = require('./helpers.js');

const T = Tempo.__preview;
const TODAY = '2026-11-11', WEEK_END = '2026-11-15';

test('an old seven-list file keeps every task, merged into 今天 / 本周 / 以后', () => {
  const old = `# 任务\n\n## 收件箱\n- [ ] a\n\n## 今天\n- [ ] b\n\n## 接下来\n- [ ] c 📅 2026-11-20\n\n## 随时可做\n- [ ] d\n\n## 将来也许\n- [ ] e\n\n## 等待\n- [ ] f\n\n## 已完成\n- [x] g ✅ 2026-11-10\n`;
  const lists = T.readTasks(old);
  assert.deepEqual(Object.keys(lists), ['今天', '本周', '以后', '已完成']);
  assert.deepEqual(lists['今天'].map((t) => t.title), ['b']);
  assert.deepEqual(lists['本周'].map((t) => t.title), ['c']);
  assert.deepEqual(lists['以后'].map((t) => t.title).sort(), ['a', 'd', 'e', 'f']);
  assert.deepEqual(lists['已完成'].map((t) => t.title), ['g']);
  const again = T.serializeTaskDoc(T.parseTaskDoc(old));
  assert.deepEqual(again.match(/^## .+$/gm), ['## 今天', '## 本周', '## 以后', '## 已完成']);
});

test('a heading of your own in the task file survives', () => {
  const s = T.serializeTaskDoc(T.parseTaskDoc('## 今天\n- [ ] a\n\n## 想法\n随便写写\n'));
  assert.match(s, /## 想法\n随便写写/);
});

const lists = () => T.readTasks(`## 今天
- [ ] 今天的事
- [ ] 下个月也在今天 📅 2026-12-20

## 本周
- [ ] 本周的事
- [ ] 本周但已过期 📅 2026-11-09

## 以后
- [ ] 以后的事
- [ ] 周五要交 📅 2026-11-13
- [ ] 今天到期 📅 2026-11-11
- [ ] 下个月 📅 2026-12-01

## 已完成
`);

test('a task shows in the earliest of its list and its date', () => {
  const v = T.viewsOf(lists(), TODAY, WEEK_END);
  assert.deepEqual(v['今天'].map((t) => t.title), ['本周但已过期', '今天到期', '下个月也在今天', '今天的事']);
  assert.deepEqual(v['本周'].map((t) => t.title), ['周五要交', '本周的事']);
  assert.deepEqual(v['以后'].map((t) => t.title), ['下个月', '以后的事']);
});

test('a course name becomes a tag: the code if it has one, else the name without spaces', () => {
  assert.equal(T.courseTag('宏观经济学 ECON201'), 'ECON201');
  assert.equal(T.courseTag('ECON201'), 'ECON201');
  assert.equal(T.courseTag('Environmental Law LAW 3021'), 'LAW3021');
  assert.equal(T.courseTag('环境 政策'), '环境政策');
});

test('adding a task while a course is picked tags it once', () => {
  assert.equal(T.withTag('读第 3 章', 'ECON201'), '读第 3 章 #ECON201');
  assert.equal(T.withTag('读第 3 章 #ECON201', 'ECON201'), '读第 3 章 #ECON201');
  assert.equal(T.withTag('读第 3 章', null), '读第 3 章');
});
