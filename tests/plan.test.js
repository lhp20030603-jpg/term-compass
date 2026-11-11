'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Pulse } = require('./helpers.js');

const P = Pulse.__preview;
const day = (d) => P.dkey(d);
const NOW = new Date(2026, 10, 6, 12);
const SETTINGS = { courseRoot: '课程', courses: 'ECON101, ECON201, STAT301', englishRoot: '英语', readingFolder: '英语/写作/每日阅读' };
const PLAN = `# 作业

## 4. 时间表（倒推到 12-04 交）
- [x] **10-01 → 10-10**：已经做完的
- [ ] **10-19 → 10-25**：选题，确定两个国家
- [ ] **10-26 → 11-08**：文献阅读；写一页论证提纲
- [ ] **11-09 → 11-22**：完成初稿
- [ ] **10-27 Tutorial 1**：做完学生讲义
- [ ] **12-04（周五）**：在 Moodle 提交 Word 文件
- [ ] **12-18 10:30**：参加线上答疑
- [ ] **12 月第 1 周**：做一份速查页
  - 这是子项，不是节点
- [ ] **1 月 1–14 日**：手写限时练习
- [ ] **1 月**：做完 Mock 5
- [ ] **每周**：课后写一页纸
- [ ] **圣诞假**：准备提纲
- [ ] 12-05 回国前：准备好论证模板（论点 → 界定关键词 → 法律渊源）
- [ ] **12-06**：提交声明表 ✅
- [ ] **12-07**：回看笔记 → [[ECON201 课程主页]]
- [ ] **11 月**：作业都按考试标准写
- [ ] 读 Moodle 上的 [资源](https://www.vle.cam.ac.uk/mod/folder/view.php?id=19609339)

## 5. 别的
- [ ] **11-10 → 11-11**：不在计划小节里
`;
const parsed = (now = NOW) => P.parseMilestones('STAT301', 'a/作业.md', PLAN, now);
const find = (list, word) => list.find((m) => m.text.includes(word));

test('every date style used in the real plans is read', () => {
  const list = parsed();
  const span = (w) => { const m = find(list, w); return `${day(m.start)} ${day(m.end)}`; };
  assert.equal(span('文献阅读'), '2026-10-26 2026-11-08');
  assert.equal(span('Moodle 提交'), '2026-12-04 2026-12-04');
  assert.equal(span('线上答疑'), '2026-12-18 2026-12-18');
  assert.equal(span('速查页'), '2026-12-01 2026-12-07');
  assert.equal(span('手写限时'), '2027-01-01 2027-01-14');
  assert.equal(span('Mock 5'), '2027-01-01 2027-01-31');
  assert.equal(span('回国前'), '2026-12-05 2026-12-05');
});

test('lines with no date, sub-items and other sections are not milestones', () => {
  const list = parsed();
  for (const word of ['课后写', '准备提纲', '这是子项', '不在计划', '资源']) assert.equal(find(list, word), undefined, word);
  assert.equal(list.length, 14);
});

test('the text drops the date and the weekday', () => {
  const list = parsed();
  assert.equal(find(list, 'Moodle 提交').text, '在 Moodle 提交 Word 文件');
  assert.equal(find(list, '线上答疑').text, '参加线上答疑');
  assert.equal(find(list, '学生讲义').text, 'Tutorial 1：做完学生讲义');
  assert.equal(find(list, '声明表').text, '提交声明表');
});

test('an arrow inside the text survives, a trailing link does not', () => {
  const list = parsed();
  assert.equal(find(list, '回国前').text, '回国前：准备好论证模板（论点 → 界定关键词 → 法律渊源）');
  assert.equal(find(list, '回看笔记').text, '回看笔记');
});

test('each milestone keeps the line it came from so it can be ticked', () => {
  const m = find(parsed(), '选题');
  assert.equal(PLAN.split('\n')[m.line], m.raw);
  assert.equal(m.path, 'a/作业.md');
});

const statuses = (now = NOW) => P.milestoneStatus(parsed(now), now);

test('a range that ended unticked is overdue', () => {
  const m = find(statuses(), '选题');
  assert.equal(m.status, 'overdue');
  assert.equal(m.left, -12);
});

test('a one-day milestone that passed just disappears', () => {
  assert.equal(find(statuses(), '学生讲义'), undefined);
});

test('a whole month is guidance: it passes quietly too', () => {
  assert.equal(find(statuses(), '考试标准').status, 'active');
  const later = new Date(2026, 11, 10, 12);
  assert.equal(find(statuses(later), '考试标准'), undefined);
});

test('a range running today is active and a later one is upcoming', () => {
  assert.equal(find(statuses(), '文献阅读').status, 'active');
  assert.equal(find(statuses(), '完成初稿').status, 'upcoming');
});

test('a ticked milestone stays marked done', () => {
  assert.equal(find(statuses(), '已经做完').status, 'done');
});

const SCHEDULE = `## 0. 关键日期

| 日期 | 事项 | 课程 |
|---|---|---|
| **11-09（周一）前** | **论文 proposal 提交** | 论文 |
| 11-25 | ECON201 Tutorial 3 | ECON201 |
| 2027 年 4 月中下旬 | ECON201 第二场考试 | ECON201 |

## 2. ▶️ 本周（MT 第 5 周，11-05 → 11-11）
- [ ] **与 Liu 老师见面（11-06 周五）**
- [ ] ECON101 第 5 讲（11-11）：先读 D/V 第 6 章
- [x] 已经交了（11-06）
`;
const HOME = `### 第 5 讲 · 生物多样性 Biodiversity · 11-11
- [ ] ⭐ 读 D/V 第 6 章
- [ ] 读 Burke
`;
const build = (over) => P.withGame(P.buildModel(Object.assign({ files: [], cache: {}, tracked: {}, settings: SETTINGS, now: NOW, pomo: { mode: 'idle' }, resolve: () => null,
  texts: { schedule: SCHEDULE, courseHomes: { ECON101: { path: 'e/home.md', text: HOME } }, plans: [{ code: 'STAT301', path: 'a/作业.md', text: PLAN }] } }, over)));

test('readings no longer count in the weekly tally', () => {
  const w = build({ now: new Date(2026, 10, 10, 12) }).week;
  assert.equal(w.groups[0].lec.tasks.length, 2);
  const ms = w.milestones.length;
  assert.equal(w.total, ms + 3);
  assert.equal(w.done, 1);
});

test('the week lists overdue milestones and those running this week', () => {
  const w = build({ now: new Date(2026, 10, 10, 12) }).week;
  assert.ok(find(w.milestones, '选题'));
  assert.ok(find(w.milestones, '文献阅读'));
  assert.ok(find(w.milestones, '完成初稿'));
  assert.equal(find(w.milestones, 'Moodle 提交'), undefined);
});

const texts = (rows) => rows.map((r) => r.text);

test('today comes first, then what is late, then what is close', () => {
  const rows = P.nowList(build());
  assert.equal(rows.length, 3);
  assert.match(rows[0].text, /Liu 老师/);
  assert.equal(rows[0].when, '今天');
  assert.match(rows[1].text, /选题/);
  assert.equal(rows[1].when, '逾期 12 天');
  assert.match(rows[2].text, /proposal/);
  assert.equal(rows[2].when, '还有 3 天');
});

test('a lecture today shows, and a note about it is not listed twice', () => {
  const m = build({ now: new Date(2026, 10, 11, 9) });
  const rows = P.nowList(m);
  assert.match(rows[0].text, /生物多样性/);
  assert.equal(texts(rows).filter((t) => /ECON101 第 5 讲/.test(t)).length, 0);
});

test('only the oldest overdue milestone of a course shows', () => {
  const m = build({ now: new Date(2026, 10, 25, 12) });
  const late = P.nowList(m).filter((r) => r.when.startsWith('逾期'));
  assert.equal(late.length, 1);
  assert.match(late[0].text, /选题/);
});

test('approximate deadlines never claim to be close', () => {
  const rows = P.nowList(build({ now: new Date(2027, 3, 9, 12) }));
  assert.equal(texts(rows).some((t) => /第二场/.test(t)), false);
});

test('a ticked or stale list item is left out', () => {
  assert.equal(texts(P.nowList(build())).some((t) => /已经交了/.test(t)), false);
  const stale = build({ now: new Date(2026, 10, 12, 12) });
  assert.equal(stale.week.stale, true);
  assert.equal(texts(P.nowList(stale)).some((t) => /Liu 老师/.test(t)), false);
});

test('a quiet day gives an empty list', () => {
  const m = build({ texts: { schedule: '', courseHomes: {}, plans: [] } });
  assert.deepEqual(P.nowList(m), []);
});

test('folded card keys ignore the date in a title', () => {
  assert.equal(P.foldKey('2026年11月6日 周五'), '当日详情');
  assert.equal(P.foldKey('11 月挑战'), '月挑战');
  assert.equal(P.foldKey('成就'), '成就');
});
