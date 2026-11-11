'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { Pulse, notices } = require('./helpers.js');

const { runBackup, staleBackups, expandHome } = Pulse.__preview;

function vault() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-test-'));
  const v = path.join(root, '我的 vault');
  const write = (p, text) => { fs.mkdirSync(path.dirname(path.join(v, p)), { recursive: true }); fs.writeFileSync(path.join(v, p), text); };
  write('00 Home/Home.md', '# Home');
  write('.obsidian/plugins/study-pulse/data.json', '{"days":{}}');
  write('.obsidian/workspace.json', '{}');
  write('.trash/old.md', 'gone');
  write('99 附件/图.png', 'img');
  write('99 附件/录音/a.webm', 'audio-a');
  return { v, dest: path.join(root, 'cloud', '备份'), root };
}
const opts = (t, over) => Object.assign({ vault: t.v, dest: t.dest, audioFolder: '99 附件/录音', today: '2026-11-05', keep: 3 }, over);
const list = (file) => execFileSync('tar', ['-tzf', file], { encoding: 'utf8' });

test('packs notes and plugin data, skips trash, layout and recordings', async () => {
  const t = vault();
  fs.mkdirSync(path.dirname(t.dest), { recursive: true });
  await runBackup(opts(t));
  const names = list(path.join(t.dest, '学期罗盘备份-2026-11-05.tgz'));
  assert.match(names, /00 Home\/Home\.md/);
  assert.match(names, /plugins\/study-pulse\/data\.json/);
  assert.match(names, /\.png/);
  assert.doesNotMatch(names, /workspace\.json/);
  assert.doesNotMatch(names, /\.trash/);
  assert.doesNotMatch(names, /a\.webm/);
});

test('recordings are mirrored once beside the archives', async () => {
  const t = vault();
  fs.mkdirSync(path.dirname(t.dest), { recursive: true });
  await runBackup(opts(t));
  assert.equal(fs.readFileSync(path.join(t.dest, '录音', 'a.webm'), 'utf8'), 'audio-a');
  const copied = path.join(t.dest, '录音', 'a.webm');
  const stamp = new Date(2020, 0, 1);
  fs.utimesSync(copied, stamp, stamp);
  await runBackup(opts(t, { today: '2026-11-06' }));
  assert.equal(fs.statSync(copied).mtime.getFullYear(), 2020);
});

test('a missing cloud folder fails loudly instead of creating a fake one', async () => {
  const t = vault();
  await assert.rejects(runBackup(opts(t)), /找不到/);
  assert.equal(fs.existsSync(path.dirname(t.dest)), false);
});

test('only this plugin\'s old archives are ever removed', () => {
  const names = ['学期罗盘备份-2026-11-01.tgz', '学期罗盘备份-2026-11-02.tgz', '学期罗盘备份-2026-11-03.tgz', '学期罗盘备份-2026-11-04.tgz', '论文.tgz', '录音'];
  assert.deepEqual(staleBackups(names, 2), ['学期罗盘备份-2026-11-02.tgz', '学期罗盘备份-2026-11-01.tgz']);
});

test('old archives are pruned after a good run', async () => {
  const t = vault();
  fs.mkdirSync(t.dest, { recursive: true });
  for (const d of ['01', '02', '03', '04']) fs.writeFileSync(path.join(t.dest, `学期罗盘备份-2026-11-${d}.tgz`), 'x');
  fs.writeFileSync(path.join(t.dest, '别的文件.tgz'), 'x');
  await runBackup(opts(t));
  const left = fs.readdirSync(t.dest).sort();
  assert.deepEqual(left.filter((n) => n.startsWith('学期罗盘备份')), ['学期罗盘备份-2026-11-03.tgz', '学期罗盘备份-2026-11-04.tgz', '学期罗盘备份-2026-11-05.tgz']);
  assert.ok(left.includes('别的文件.tgz'));
});

test('a failed run leaves no partial archive and prunes nothing', async () => {
  const t = vault();
  fs.mkdirSync(t.dest, { recursive: true });
  fs.writeFileSync(path.join(t.dest, '学期罗盘备份-2026-11-01.tgz'), 'x');
  await assert.rejects(runBackup(opts(t, { vault: path.join(t.root, 'nope'), keep: 0 })));
  assert.deepEqual(fs.readdirSync(t.dest), ['学期罗盘备份-2026-11-01.tgz']);
});

test('~ expands to the home folder', () => {
  assert.equal(expandHome('~/a b'), path.join(os.homedir(), 'a b'));
  assert.equal(expandHome('/x'), '/x');
});

function fakePlugin(dest) {
  const p = Object.create(Pulse.prototype);
  p.settings = { backupFolder: dest, backupKeep: 3 };
  p.data = { backup: null };
  p.app = { vault: { adapter: { getBasePath: () => '/nonexistent/vault' } }, plugins: { plugins: {} } };
  p.persistSoon = () => {}; p.scheduleRefresh = () => {};
  return p;
}

test('a failed day shows one notice, not one per hourly retry', async () => {
  const p = fakePlugin('/nonexistent/cloud/备份');
  const before = notices.length;
  await p.maybeBackup(); await p.maybeBackup();
  assert.equal(notices.length, before + 1);
  assert.ok(p.data.backup.error);
});

test('no folder set means no backup and no warning', async () => {
  const p = fakePlugin('');
  const before = notices.length;
  await p.maybeBackup();
  assert.equal(notices.length, before);
  assert.equal(p.data.backup, null);
});
