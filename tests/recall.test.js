'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Recall } = require('./helpers.js');

const R = Recall.__preview;
const card = (id, course, base, extra) => Object.assign({ id, course, base, kind: 'term', front: id, back: 'b', path: `${base}.md` }, extra);
const CARDS = [card('a', 'STAT301', 'p1'), card('b', 'MATH101', 'r1'), card('c', 'ECON201', 'e1'), card('d', 'ECON201', 'e2'), card('e', 'ECON101', 'wk')];

test('the daily scope is the exam decks plus this week\'s notes', () => {
  assert.deepEqual(R.scopeCards(CARDS, 'ECON201', new Set(['wk'])).map((c) => c.id), ['c', 'd', 'e']);
});

test('with no exam decks set, everything is in scope', () => {
  assert.equal(R.scopeCards(CARDS, '', new Set()).length, 5);
});

test('cards already started stay in the daily review', () => {
  const ids = R.scopeCards(CARDS, 'ECON201', new Set(['wk']), { a: { due: 1 } }).map((c) => c.id);
  assert.deepEqual(ids, ['a', 'c', 'd', 'e']);
});

test('new cards alternate between this week and the exam decks', () => {
  const week = new Set(['wk']);
  const cards = [card('x', 'ECON201', 'e1'), card('y', 'ECON201', 'e2'), card('w1', 'ECON101', 'wk'), card('w2', 'ECON101', 'wk'), card('w3', 'ECON101', 'wk')];
  assert.deepEqual(R.buildQueue(cards, {}, 1000, 4, week).map((c) => c.id), ['w1', 'x', 'w2', 'y']);
});

test('when one side runs out the other fills the day', () => {
  const week = new Set(['wk']);
  const cards = [card('x', 'ECON201', 'e1'), card('w1', 'ECON101', 'wk'), card('w2', 'ECON101', 'wk')];
  assert.deepEqual(R.buildQueue(cards, {}, 1000, 3, week).map((c) => c.id), ['w1', 'x', 'w2']);
});

test('due cards still come before new ones', () => {
  const q = R.buildQueue(CARDS, { b: { due: 500 } }, 1000, 1, new Set(['wk']));
  assert.deepEqual(q.map((c) => c.id), ['b', 'e']);
});

const NOTE = `# 导读

## 主线

全文讲庇古税。

## 6. 庇古费的现实案例

瑞典电池税的收入下降，说明税在起作用，绿色税替代所得税的承诺不可能永久。

## 7. TPP 五个步骤

政府定总量，发放许可证，企业交易。祖父法和拍卖隐含的产权不同。

## 术语表

| 词 | 义 |
|---|---|
| 瑞典电池税 | 收入下降 |

## 自测题

- [ ] 瑞典电池税收入下降，为什么是好消息？
`;

test('a self-test question finds the section that answers it', () => {
  assert.equal(R.relatedSection('瑞典电池税收入下降，为什么是好消息？', NOTE).heading, '6. 庇古费的现实案例');
  assert.equal(R.relatedSection('祖父法和拍卖分别隐含产权归谁？', NOTE).heading, '7. TPP 五个步骤');
});

test('the 术语表, 自测题 and 主线 sections are never the answer', () => {
  const r = R.relatedSection('全文讲庇古税', NOTE);
  assert.notEqual(r && r.heading, '主线');
});

test('no overlap means no answer rather than a guess', () => {
  assert.equal(R.relatedSection('量子力学的波函数塌缩', NOTE), null);
});

test('a long section is cut at a paragraph', () => {
  const long = `## 长节\n\n碳税与排放权交易市场\n\n${'税'.repeat(500)}\n\n${'费'.repeat(500)}\n\n${'钱'.repeat(500)}\n`;
  const r = R.relatedSection('碳税与排放权交易市场是什么', long);
  assert.ok(r.text.length < 1200);
  assert.ok(r.cut);
});

