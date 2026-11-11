'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Voice, TFile, notices } = require('./helpers.js');

const { formatTranscript, whisperArgs, flagged } = Voice.__test;

test('whisper runs without carrying text between windows, which is what stops the loops', () => {
  const args = whisperArgs({ modelPath: 'm', language: 'auto', threads: 8 }, 'a.wav');
  assert.equal(args[args.indexOf('-mc') + 1], '0');
  assert.equal(args.includes('--prompt'), false);
});

const line = (start, text) => ({ start, text });
const loop = (start, text, n) => Array.from({ length: n }, (_, i) => line(start + i, text));

test('a repeated line collapses to one copy and the minute is flagged', () => {
  const out = formatTranscript([line(0, 'A normal opening sentence.'), ...loop(60, 'So, we have a lot of options.', 40)], []);
  assert.equal(out.match(/a lot of options/g).length, 1);
  assert.match(out, /⚠️ \*\*\[01:00\]\*\*/);
  assert.match(out.split('\n')[0], /> \[!warning\].*01:00/);
});

test('repeats inside one segment are caught too', () => {
  const out = formatTranscript([line(0, 'It is a user fee. '.repeat(30).trim())], []);
  assert.equal(out.match(/user fee/g).length, 1);
  assert.match(out, /⚠️/);
});

test('normal speech is left alone and not flagged', () => {
  const out = formatTranscript([line(0, 'First point here.'), line(5, 'Second point follows.'), line(9, 'Okay. Okay. Then the third point.')], []);
  assert.equal(out.includes('⚠️'), false);
  assert.equal(out.includes('[!warning]'), false);
  assert.match(out, /Okay\. Okay\. Then the third point\./);
});

test('marks still star their minute', () => {
  const out = formatTranscript([line(0, 'One.'), line(70, 'Two.')], [75]);
  assert.match(out, /⭐ \*\*\[01:10\]\*\*/);
});

test('the flag check matches the failure seen in the real transcripts', () => {
  assert.equal(flagged(Array(10).fill('So, we have a lot of options.')), true);
  assert.equal(flagged(['One.', 'Two.', 'Three.', 'Four.', 'Five.', 'Six.']), false);
  assert.equal(flagged(['Yes.', 'Yes.']), false);
});

function fakeVault(base) {
  const store = new Map();
  const add = (p, data) => { const f = Object.assign(new TFile(), { path: p, basename: path.basename(p, '.md') }); store.set(p, { f, data }); return f; };
  return {
    store, configDir: '.obsidian', adapter: { getBasePath: () => base },
    getAbstractFileByPath: (p) => (store.get(p) || {}).f || null,
    getMarkdownFiles: () => [...store.values()].map((x) => x.f).filter((f) => f.path.endsWith('.md')),
    createFolder: async (p) => { store.set(p, { f: { path: p } }); },
    createBinary: async (p, data) => add(p, data),
    create: async (p, data) => add(p, data),
    process: async (f, fn) => { const e = store.get(f.path); e.data = fn(e.data); },
    readBinary: async (f) => store.get(f.path).data,
    read: async (f) => store.get(f.path).data,
  };
}

function fakeVoice() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-test-'));
  const p = Object.create(Voice.prototype);
  const frontmatter = new Map();
  p.app = { vault: fakeVault(base), workspace: { trigger() {}, getActiveFile: () => null }, plugins: { plugins: {} }, metadataCache: { getFileCache: (f) => ({ frontmatter: frontmatter.get(f.path) }), getFirstLinkpathDest: (l) => p.app.vault.getAbstractFileByPath(l) } };
  p.settings = { audioFolder: '99 附件/录音', inboxFolder: '00 Home/Inbox/录音', courseRoot: '课程', courses: 'ECON101, ECON201', whisperPath: '/bin/true', modelPath: '/bin/true', language: 'auto', threads: 8 };
  p.jobs = []; p.enqueue = (...a) => p.jobs.push(a);
  p.checkSetup = () => true;
  p.frontmatter = frontmatter;
  return p;
}

const fakeRec = (p, extra) => {
  const rec = Object.assign({ startedAt: Date.now() - 60000, marks: [], pcm: [], webm: [], course: 'ECON201', stream: { getTracks: () => [] }, ctx: { close() {} }, proc: { disconnect() {} }, mr: { state: 'recording', stop() { this.state = 'inactive'; } } }, extra);
  p.openRecovery(rec);
  return rec;
};
const chunk = (text) => ({ arrayBuffer: async () => new TextEncoder().encode(text).buffer });

global.OfflineAudioContext = class { async decodeAudioData() { return { length: 16000, numberOfChannels: 1, sampleRate: 16000, duration: 61, getChannelData: () => new Float32Array(16000) }; } };

test('audio reaches the disk while recording', async () => {
  const p = fakeVoice();
  const rec = fakeRec(p);
  p.appendChunk(rec, chunk('aaa')); p.appendChunk(rec, chunk('bbb'));
  await rec.write;
  assert.equal(fs.readFileSync(rec.file, 'utf8'), 'aaabbb');
});

test('a recording still works when the recovery folder cannot be made', async () => {
  const p = fakeVoice();
  p.recoveryDir = () => { throw new Error('no folder'); };
  const rec = fakeRec(p);
  p.appendChunk(rec, chunk('x'));
  await rec.write;
  p.dropRecovery(rec);
  assert.equal(rec.file, undefined);
  assert.ok(notices.some((n) => /无法实时存盘/.test(n)));
});

test('unloading the plugin mid-recording keeps the audio', async () => {
  const p = fakeVoice();
  const rec = fakeRec(p);
  p.rec = rec;
  p.appendChunk(rec, chunk('lecture'));
  await rec.write;
  p.onunload();
  assert.equal(fs.existsSync(rec.file), true);
  assert.equal(p.rec, null);
});

test('cancelling removes the audio', async () => {
  const p = fakeVoice();
  const rec = fakeRec(p);
  p.rec = rec;
  p.appendChunk(rec, chunk('x'.repeat(100)));
  await rec.write;
  await p.cancel();
  assert.equal(fs.existsSync(rec.file), false);
  assert.equal(fs.existsSync(rec.meta), false);
});

test('restart turns an orphaned recording into a note and transcribes it', async () => {
  const p = fakeVoice();
  const rec = fakeRec(p, { marks: [12] });
  p.saveMeta(rec);
  p.appendChunk(rec, chunk('x'.repeat(30000)));
  await rec.write;
  await p.recoverOrphans();
  const paths = [...p.app.vault.store.keys()];
  assert.ok(paths.some((x) => x.startsWith('99 附件/录音/') && x.endsWith('.webm')));
  const note = paths.find((x) => x.startsWith('课程/ECON201/录音/') && x.endsWith('.md'));
  assert.ok(note);
  assert.equal(p.jobs.length, 1);
  assert.deepEqual(p.jobs[0][3], [12]);
  assert.equal(fs.existsSync(rec.file), false);
  assert.ok(notices.some((n) => /找回/.test(n)));
});

test('an orphan with almost no audio is dropped quietly', async () => {
  const p = fakeVoice();
  const rec = fakeRec(p);
  p.appendChunk(rec, chunk('tiny'));
  await rec.write;
  await p.recoverOrphans();
  assert.equal(p.app.vault.store.size, 0);
  assert.equal(fs.existsSync(rec.file), false);
});

test('undecodable audio is still saved, and the note says how to retry', async () => {
  const p = fakeVoice();
  const rec = fakeRec(p);
  p.appendChunk(rec, chunk('x'.repeat(30000)));
  await rec.write;
  const good = global.OfflineAudioContext;
  global.OfflineAudioContext = class { async decodeAudioData() { throw new Error('bad'); } };
  await p.recoverOrphans();
  global.OfflineAudioContext = good;
  const entries = [...p.app.vault.store.entries()];
  assert.ok(entries.some(([k]) => k.endsWith('.webm')));
  const note = entries.find(([k]) => k.endsWith('.md'))[1].data;
  assert.match(note, /status: 转写失败/);
  assert.match(note, /转写当前笔记里的录音/);
  assert.equal(p.jobs.length, 0);
});

test('a recording still running is not treated as an orphan', async () => {
  const p = fakeVoice();
  const rec = fakeRec(p);
  p.rec = rec;
  p.appendChunk(rec, chunk('x'.repeat(30000)));
  await rec.write;
  await p.recoverOrphans();
  assert.equal(fs.existsSync(rec.file), true);
  assert.equal(p.app.vault.store.size, 0);
});

test('a note left at 转写中 after a quit is queued again', async () => {
  const p = fakeVoice();
  const audio = await p.app.vault.createBinary('99 附件/录音/a.webm', new ArrayBuffer(8));
  const note = await p.app.vault.create('课程/ECON201/录音/a.md', '<!-- study-voice:transcript -->\n（转写中…）\n<!-- /study-voice:transcript -->');
  p.frontmatter.set(note.path, { type: '录音', status: '转写中', audio: `[[${audio.path}]]`, course: 'ECON201' });
  await p.resumeStuck();
  assert.equal(p.jobs.length, 1);
  assert.equal(p.jobs[0][0], note);
});

test('long silence warns once, and sound clears it', () => {
  const p = fakeVoice();
  const warned = [];
  p.warn = (t) => warned.push(t);
  let level = 0;
  p.level = () => level;
  p.rec = { quietSince: Date.now() - 60000 };
  p.watchMic(); p.watchMic();
  assert.equal(warned.length, 1);
  level = 0.5;
  p.watchMic();
  assert.equal(p.rec.warned, false);
});

test('losing the mic saves what was recorded', async () => {
  const p = fakeVoice();
  const warned = [];
  p.warn = (t) => warned.push(t);
  let stopped = 0;
  p.stop = async () => { stopped++; };
  const rec = { };
  p.rec = rec;
  await p.micLost(rec);
  assert.equal(stopped, 1);
  assert.equal(warned.length, 1);
  p.rec = null;
  await p.micLost(rec);
  assert.equal(stopped, 1);
});
