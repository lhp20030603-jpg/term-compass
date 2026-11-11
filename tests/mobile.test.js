'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { Pulse } = require('./helpers.js');

const P = Pulse.__preview;
const built = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

// iOS before 16.4 cannot parse regex lookbehind; one such literal stops the whole plugin loading there.
test('the built plugin has no regex lookbehind', () => {
  assert.equal(/\(\?<[=!]/.test(built), false);
});

test('the plugin never hardcodes the config folder name in paths it builds', () => {
  const hits = built.split('\n').filter((l) => /['"`/]\.obsidian\b/.test(l) && !/configDir \|\| '\.obsidian'/.test(l));
  assert.deepEqual(hits, []);
});

test('an escaped pipe stays inside its table cell', () => {
  const dl = P.parseDeadlines('## 关键日期\n\n| 日期 | 事项 | 课程 |\n|---|---|---|\n| 12-04 | 论文 A \\| B 截止 | ECON201 |\n', new Date(2026, 10, 11));
  assert.equal(dl.length, 1);
  assert.match(JSON.stringify(dl[0]), /论文 A \\?\| B 截止/);
});
