'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Pulse, Recall } = require('./helpers.js');

const P = Pulse.__preview;
const NOW = new Date(2026, 10, 12, 12);
P.useTerm({ termStart: '2026-09-28', termEnd: '2026-12-11', yearStartMonth: 9 });

for (const [line, n, date] of [
  ['### 第 3 讲 · 市场失灵 · 10-14', 3, '10-14'],
  ['## 第3周 外部性 10月20日', 3, '10-20'],
  ['### 第 4 次课：博弈论（2026-10-21）', 4, '10-21'],
  ['### Lecture 5: Public goods (2026-10-28)', 5, '10-28'],
  ['## Week 6 · Climate policy · 11-04', 6, '11-04'],
  ['#### L7 Carbon markets', 7, null],
  ['### Session 2 — Methods', 2, null],
]) test(`lecture heading: ${line}`, () => {
  const [it] = P.parseStatusItems(line + '\n');
  assert.equal(it.n, n);
  assert.equal(it.date ? `${String(it.date.m).padStart(2, '0')}-${String(it.date.d).padStart(2, '0')}` : null, date);
});

test('a slash date is not guessed at: 11/3 means different days in the US and the UK', () => {
  assert.equal(P.parseStatusItems('### Lecture 1 · 11/3\n')[0].date, null);
});

test('words that only look like a lecture are not lectures', () => {
  assert.deepEqual(P.parseStatusItems('### Literature review\n## Weekly summary\n### 第一部分\n'), []);
});

test('an English heading keeps its own words as the label', () => {
  assert.match(P.parseStatusItems('### Lecture 5: Public goods (2026-10-28)\n')[0].label, /^Lecture 5: Public goods/);
});

test('the homepage is found by name, by folder name, or by having the most lectures', () => {
  const note = (path, text = '') => ({ path, text });
  assert.equal(P.pickHome('ECON201', [note('c/ECON201/作业.md'), note('c/ECON201/课程主页.md')]), 'c/ECON201/课程主页.md');
  assert.equal(P.pickHome('ECON201', [note('c/ECON201/Readings.md'), note('c/ECON201/Syllabus.md')]), 'c/ECON201/Syllabus.md');
  assert.equal(P.pickHome('ECON201', [note('c/ECON201/a.md'), note('c/ECON201/ECON201.md')]), 'c/ECON201/ECON201.md');
  assert.equal(P.pickHome('宏观', [note('c/宏观/杂记.md', '# x'), note('c/宏观/安排.md', '## Week 1\n## Week 2\n')]), 'c/宏观/安排.md');
  assert.equal(P.pickHome('宏观', [note('c/宏观/杂记.md', '# x')]), null);
});

test('course folders skip attachments, templates and hidden folders', () => {
  assert.deepEqual(P.courseFolders(['ECON201', '附件', 'attachments', '_模板', '.trash', 'Templates', '宏观经济学']), ['ECON201', '宏观经济学']);
});

test('an English key-dates table and plan are read', () => {
  const dl = P.parseDeadlines('## Key dates\n\n| Date | What | Course |\n|---|---|---|\n| 2026-12-04 | Essay due | ECON201 |\n| 12月10日 | Exam | ECON202 |\n', NOW);
  assert.deepEqual(dl.map((d) => P.dkey(d.due)), ['2026-12-04', '2026-12-10']);
  const plan = P.parseMilestones('ECON201', 'p.md', '## Timeline\n- [ ] **11-09 → 11-22**: First draft\n- [ ] **12月4日**：Submit\n', NOW);
  assert.deepEqual(plan.map((m) => m.text), ['First draft', 'Submit']);
});

test('plan notes are recognised by name in either language', () => {
  for (const name of ['ECON201 作业与真题.md', 'Exam plan.md', 'Assessment.md', '考试安排.md']) assert.equal(P.isPlanNote(name), true, name);
  assert.equal(P.isPlanNote('课程主页.md'), false);
});

test('any note or PDF linked under a lecture counts as its reading', () => {
  const home = '### Lecture 5 · 11-11\n- [[Week 5 slides.pdf]]\n- ![[diagram.png]]\n';
  const m = P.withGame(P.buildModel({ files: [], cache: {}, tracked: {}, now: NOW, pomo: { mode: 'idle' },
    settings: { courseRoot: '课程', courses: 'ECON201', englishRoot: '英语', readingFolder: '' },
    resolve: (l) => `课程/ECON201/${l}`, reading: { '课程/ECON201/Week 5 slides.pdf': 700 },
    texts: { schedule: '', plans: [], courseHomes: { ECON201: { path: '课程/ECON201/Syllabus.md', text: home } } } }));
  const it = m.courses[0].items[0];
  assert.equal(it.guides, 1);
  assert.equal(it.done, true);
});

test('flashcards come from English glossary and self-test headings too', () => {
  const R = Recall.__preview;
  const cards = R.parseCards('课程/ECON201/w5.md', '## Key terms\n\n| Term | Meaning |\n|---|---|\n| Public good | Non-rival, non-excludable |\n\n## Self-test\n\n- Why do public goods get under-provided?\n', { courseRoot: '课程' });
  assert.deepEqual(cards.map((c) => c.kind), ['term', 'quiz']);
});

test('a course name with spaces stays one course', () => {
  const m = P.buildModel({ files: [], cache: {}, tracked: {}, now: NOW, pomo: { mode: 'idle' },
    settings: { courseRoot: '课程', courses: '宏观经济学 ECON201, Microeconomics', englishRoot: '英语', readingFolder: '' },
    texts: { schedule: '', plans: [], courseHomes: {} } });
  assert.deepEqual(m.courses.map((c) => c.code), ['宏观经济学 ECON201', 'Microeconomics']);
});
