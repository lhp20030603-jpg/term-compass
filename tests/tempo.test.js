'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Tempo } = require('./helpers.js');

const { parseNewTask } = Tempo.__preview;
const now = new Date(2026, 10, 5, 12);

for (const [input, expected] of [
  ['读 Kolstad 4-5 章', '- [ ] 读 Kolstad 4-5 章'],
  ['看 DV 5-6 章', '- [ ] 看 DV 5-6 章'],
  ['MATH101 第 3-4 题', '- [ ] MATH101 第 3-4 题'],
  ['复习第 1-2 讲 #ECON201', '- [ ] 复习第 1-2 讲 #ECON201'],
  ['读 Kolstad 10-12 章', '- [ ] 读 Kolstad 10-12 章'],
  ['读 Kolstad 4-5', '- [ ] 读 Kolstad 4-5'],
  ['第 10-12 页', '- [ ] 第 10-12 页'],
  ['整理 10-12', '- [ ] 整理 10-12'],
]) test(`chapter numbers stay in the task: ${input}`, () => assert.equal(parseNewTask(input, now), expected));

for (const [input, expected] of [
  ['写 ECON201 作业 11-11', '- [ ] 写 ECON201 作业 📅 2026-11-11'],
  ['写 ECON201 作业 11-11 #ECON201', '- [ ] 写 ECON201 作业 #ECON201 📅 2026-11-11'],
  ['考试 1-15', '- [ ] 考试 📅 2027-01-15'],
  ['考试 2027-01-15', '- [ ] 考试 📅 2027-01-15'],
  ['交作业 明天', '- [ ] 交作业 📅 2026-11-06'],
  ['读 4-5 章 明天', '- [ ] 读 4-5 章 📅 2026-11-06'],
  ['今天 打电话', '- [ ] 打电话 📅 2026-11-05'],
]) test(`real dates still work: ${input}`, () => assert.equal(parseNewTask(input, now), expected));

test('a memo keeps every word when it becomes a task', async () => {
  const p = Object.create(Tempo.prototype);
  const lines = [];
  p.editTasks = async (fn) => { const doc = { sections: [{ name: '今天', lines }, { name: '本周', lines }, { name: '以后', lines }] }; fn(doc); };
  p.ensureFile = async () => ({});
  p.app = { vault: { process: async () => {} } };
  p.refresh = () => {};
  await p.memoToTask({ text: '读 Kolstad 4-5 章 11-11', raw: ['- 10:00 读 Kolstad 4-5 章 11-11'] }, 'today');
  assert.equal(lines[0], '- [ ] 读 Kolstad 4-5 章 11-11');
});

test('the count for the dashboard includes tasks due from other lists', async () => {
  const p = Object.create(Tempo.prototype);
  const today = new Date();
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  p.settings = { taskFile: 't.md' };
  p.app = { vault: { getAbstractFileByPath: () => Object.assign(new (require('./helpers.js').TFile)(), {}), cachedRead: async () => `## 今天\n- [ ] a\n- [ ] b\n\n## 接下来\n- [ ] c 📅 ${key}\n- [ ] d 📅 2099-01-01\n` } };
  assert.equal(await p.todayCount(), 3);
});
