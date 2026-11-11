'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
require('./helpers.js');
const TermCompass = require(path.join(__dirname, '..', 'main.js'));

// Just enough DOM for the floating timers.
const el = () => ({ style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} }, children: [], appendChild(c) { this.children.push(c); return c; }, addEventListener() {}, setAttribute() {}, remove() {}, querySelectorAll: () => [] });
global.document = Object.assign(global.document || {}, { createElement: el, createElementNS: el, createTextNode: el, body: el(), querySelectorAll: () => [], addEventListener() {}, hasFocus: () => true });
global.window.setInterval = () => 0; global.window.setTimeout = () => 0;

const on = () => ({});
const app = {
  vault: { configDir: '.obsidian', on, getMarkdownFiles: () => [], getAbstractFileByPath: () => null, getRoot: () => ({ children: [] }), adapter: { getBasePath: () => '/tmp/v' }, cachedRead: async () => '' },
  workspace: { onLayoutReady() {}, on, trigger() {}, getLeavesOfType: () => [] },
  metadataCache: { on, getFileCache: () => null },
};

test('the whole plugin loads, every module registers its commands', async () => {
  const p = new TermCompass(app, { id: 'term-compass', name: 'Term Compass 学期罗盘' });
  await p.onload();
  for (const id of ['open-dashboard', 'open-setup', 'check-notes', 'open-tasks', 'open-memo', 'open-cards', 'review', 'toggle', 'mark'])
    assert.ok(p.calls.includes(`command ${id}`), `missing command ${id}`);
  for (const icon of ['compass', 'list-checks', 'layers', 'mic']) assert.ok(p.calls.includes(`ribbon ${icon}`), `missing ribbon ${icon}`);
  assert.equal(p.sections.length, 4);
});

test('commands of other modules can be run by id', async () => {
  const p = new TermCompass(app, { id: 'term-compass', name: 'Term Compass' });
  await p.onload();
  assert.equal(p.run('term-compass:nonexistent'), false);
  assert.equal(typeof p.cmds['review'], 'function');
});

test('the task panel redraws when this week\'s milestones change, not on every model build', async () => {
  const p = new TermCompass(app, { id: 'term-compass', name: 'Term Compass' });
  await p.onload();
  const pulse = p.mods.pulse;
  let redraws = 0;
  p.mods.tasks.refresh = () => { redraws++; };
  await pulse.getModel(true);
  assert.equal(redraws, 1, 'first model build redraws the panel');
  await pulse.getModel(true);
  assert.equal(redraws, 1, 'same milestones, no redraw');
  pulse._milestoneSig = 'stale';
  await pulse.getModel(true);
  assert.equal(redraws, 2, 'changed milestones redraw');
});

test('the task panel reads milestones itself when the dashboard has not loaded yet', async () => {
  const p = new TermCompass(app, { id: 'term-compass', name: 'Term Compass' });
  await p.onload();
  p.mods.tasks.refresh = () => {};
  assert.equal(p.mods.pulse._model, undefined);
  const state = await p.mods.tasks.readState();
  assert.ok(p.mods.pulse._model, 'model built on demand');
  assert.deepEqual(state.milestones, []);
});
