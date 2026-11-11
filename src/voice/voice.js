/*
 * Voice: the lecture recording module of Term Compass (desktop only).
 *
 * Flow: record (MediaRecorder → compressed .webm kept in the vault, plus a raw
 * 16 kHz mono PCM stream for Whisper) → pick a course → note is created at once
 * → whisper.cpp transcribes locally in the background → transcript is written
 * into the note with a timestamp every minute and ⭐ on the parts you marked.
 * Any audio file in the vault can also be transcribed from its right-click menu.
 *
 * Crash safety: every 5 s chunk is appended to the plugin's recovery folder while
 * recording. A quit, reload or crash leaves it there and the next launch turns it
 * into a normal recording. Only 取消 or a finished save removes it.
 *
 * Layout of this file: utils → audio encoding → transcript formatting → UI → plugin.
 */
// Node modules exist on desktop only; the host never starts this module on mobile.
const desktop = (m) => (obsidian.Platform.isDesktopApp ? require(m) : {});
const os = desktop('os');
const fs = desktop('fs');
const path = desktop('path');
const { spawn } = desktop('child_process');

const DEFAULT_SETTINGS = {
  whisperPath: '/opt/homebrew/bin/whisper-cli',
  modelPath: os.homedir ? path.join(os.homedir(), 'whisper-models', 'ggml-large-v3-turbo-q5_0.bin') : '',
  language: 'auto',
  audioFolder: '学期罗盘/录音音频',
  inboxFolder: '学期罗盘/录音',
  courseRoot: '',            // empty: follow the dashboard
  courses: '',
  threads: 8,
};
const SAMPLE_RATE = 16000;
const AUDIO_EXT = ['webm', 'm4a', 'mp3', 'wav', 'ogg', 'aac', 'flac', 'mp4'];
const MIN_RECOVER_BYTES = 20000;   // under ~5 s of audio: not worth a note
// Real lectures never stay below 0.87 for 45 s (measured on 2 h of recordings); a dead mic reads 0.
const QUIET_LEVEL = 0.02;
const QUIET_MS = 45000;

/* ───────────────────────────── utils ───────────────────────────── */

const pad = (n) => String(n).padStart(2, '0');
const dkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const clock = (sec) => { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600); return `${h ? h + ':' : ''}${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`; };

function h(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

async function ensureFolder(vault, folder) {
  const parts = folder.split('/').filter(Boolean);
  let cur = '';
  for (const p of parts) {
    cur = cur ? `${cur}/${p}` : p;
    if (!vault.getAbstractFileByPath(cur)) await vault.createFolder(cur);
  }
}

async function uniquePath(vault, base, ext) {
  let p = `${base}.${ext}`, i = 2;
  while (vault.getAbstractFileByPath(p)) p = `${base} ${i++}.${ext}`;
  return p;
}

/* ───────────────────────────── audio encoding ───────────────────────────── */

// Linear resample a Float32 channel to 16 kHz (only used when the context could not run at 16 kHz).
function resampleTo16k(input, fromRate) {
  if (fromRate === SAMPLE_RATE) return input;
  const ratio = fromRate / SAMPLE_RATE, out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const x = i * ratio, i0 = Math.floor(x), t = x - i0;
    out[i] = (input[i0] || 0) * (1 - t) + (input[i0 + 1] || 0) * t;
  }
  return out;
}

function floatToInt16(f32) {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) { const v = Math.max(-1, Math.min(1, f32[i])); out[i] = v < 0 ? v * 0x8000 : v * 0x7fff; }
  return out;
}

/** 16-bit PCM mono WAV from Int16 chunks. */
function encodeWav(chunks) {
  const n = chunks.reduce((a, c) => a + c.length, 0);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24); buf.writeUInt32LE(SAMPLE_RATE * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  let off = 44;
  for (const c of chunks) { Buffer.from(c.buffer, c.byteOffset, c.byteLength).copy(buf, off); off += c.byteLength; }
  return buf;
}

/** Decode any browser-supported audio (webm, m4a, mp3…) into 16 kHz mono Int16. */
async function decodeTo16k(arrayBuffer) {
  const ctx = new OfflineAudioContext(1, 1, SAMPLE_RATE);
  const audio = await ctx.decodeAudioData(arrayBuffer);
  const mono = new Float32Array(audio.length);
  for (let ch = 0; ch < audio.numberOfChannels; ch++) { const d = audio.getChannelData(ch); for (let i = 0; i < d.length; i++) mono[i] += d[i] / audio.numberOfChannels; }
  return { pcm: floatToInt16(resampleTo16k(mono, audio.sampleRate)), seconds: audio.duration };
}

/* ───────────────────────────── transcript formatting ───────────────────────────── */

/** "[00:01:02.340 --> 00:01:05.000]  text" → {start, text} */
function parseWhisperLine(line) {
  const m = line.match(/^\[(\d+):(\d+):(\d+)[.,]\d+\s*-->\s*[^\]]+\]\s*(.*)$/);
  if (!m) return null;
  const text = m[4].trim();
  return text ? { start: +m[1] * 3600 + +m[2] * 60 + +m[3], text } : null;
}

const splitSentences = (text) => text.replace(/([.!?])\s+/g, '$1\n').replace(/([。！？])\s*/g, '$1\n').split('\n').map((x) => x.trim()).filter(Boolean);

/** A minute where most sentences are copies: Whisper was stuck, not the lecturer. */
function flagged(sentences) {
  return sentences.length >= 6 && new Set(sentences.map((x) => x.toLowerCase())).size / sentences.length < 0.5;
}

// A sentence said three or more times in a row keeps one copy. Twice is normal speech.
function collapseRepeats(sentences) {
  const out = [];
  for (let i = 0; i < sentences.length;) {
    let j = i;
    while (j + 1 < sentences.length && sentences[j + 1].toLowerCase() === sentences[i].toLowerCase()) j++;
    const run = j - i + 1;
    out.push(...sentences.slice(i, run >= 3 ? i + 1 : j + 1));
    i = j + 1;
  }
  return out;
}

/**
 * Group segments into one paragraph per minute; paragraphs containing a mark get ⭐.
 * Minutes that look like a Whisper loop are collapsed, get ⚠️, and are listed on top.
 */
function formatTranscript(segments, marks) {
  const paras = [];
  for (const sg of segments) {
    const bucket = Math.floor(sg.start / 60);
    let p = paras[paras.length - 1];
    if (!p || p.bucket !== bucket) { p = { bucket, start: sg.start, text: [] }; paras.push(p); }
    p.text.push(sg.text);
  }
  const suspect = [];
  const body = paras.map((p) => {
    const starred = marks.some((m) => m >= p.bucket * 60 - 10 && m < (p.bucket + 1) * 60);
    const glue = /[一-鿿]$/.test(p.text[0] || '') ? '' : ' ';
    const join = p.text.join(glue);
    const sentences = splitSentences(join);
    const kept = collapseRepeats(sentences);
    const loop = flagged(sentences);
    if (loop) suspect.push(clock(p.start));
    return `${starred ? '⭐ ' : ''}${loop ? '⚠️ ' : ''}**[${clock(p.start)}]** ${kept.length === sentences.length ? join : kept.join(glue)}`;
  }).join('\n\n');
  return suspect.length ? `> [!warning] 这些分钟的转写不可靠，建议回听原音频：${suspect.join('、')}\n\n${body}` : body;
}

// -mc 0: no text is carried between 30 s windows. Carried text is what lets Whisper
// repeat one line for minutes. It also makes --prompt a no-op, so none is passed.
const whisperArgs = (s, wav) => ['-m', s.modelPath, '-f', wav, '-l', s.language, '-t', String(s.threads), '-pp', '-mc', '0'];

function noteBody(o) {
  const fm = ['---', 'type: 录音', `course: ${o.course || '其他'}`, `date: ${o.date}`, `duration: "${clock(o.seconds)}"`, `audio: "[[${o.audio}]]"`, 'status: 转写中', 'tags: [录音]', '---', ''];
  return fm.concat([
    `# 🎙 ${o.title}`, '',
    `![[${o.audio}]]`, '',
    `> [!info] 正在本地转写（音频 ${clock(o.seconds)}，预计 ${Math.max(1, Math.round(o.seconds / 600))} 分钟左右）。完成后会自动填进下面。`, '',
    '## ⭐ 重点标记', '',
    o.marks.length ? o.marks.map((m) => `- ${clock(m)}`).join('\n') : '- （录音时没有标记）', '',
    '## 转写', '',
    '<!-- term-compass:transcript -->', '（转写中…）', '<!-- /term-compass:transcript -->', '',
    '## 整理', '',
    '（写下这节课的要点，或者把转写整理成笔记）', '',
  ]).join('\n');
}

/* ───────────────────────────── UI ───────────────────────────── */

class CourseModal extends obsidian.SuggestModal {
  constructor(app, options, onPick) { super(app); this.options = options; this.onPick = onPick; this.picked = false; this.setPlaceholder('这段录音属于哪门课？（Esc = 放进 Inbox）'); }
  getSuggestions(q) { return this.options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())); }
  renderSuggestion(o, el) { el.createEl('div', { text: o.label }); if (o.hint) el.createEl('small', { text: o.hint, cls: 'sv-hint' }); }
  onChooseSuggestion(o) { this.picked = true; this.onPick(o.value); }
  onClose() { if (!this.picked) setTimeout(() => this.onPick(null), 0); }
}

class VoiceSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new obsidian.Setting(containerEl).setName('录音转写').setHeading();
    const text = (key, name, desc) => new obsidian.Setting(containerEl).setName(name).setDesc(desc)
      .addText((t) => t.setValue(String(this.plugin.settings[key])).onChange(async (v) => {
        this.plugin.settings[key] = typeof DEFAULT_SETTINGS[key] === 'number' ? Number(v) || DEFAULT_SETTINGS[key] : v.trim();
        await this.plugin.saveData(this.plugin.settings);
      }));
    new obsidian.Setting(containerEl).setName('转写语言').setDesc('自动识别对中英混合也可以；纯英文讲座选 English 更稳')
      .addDropdown((d) => d.addOptions({ auto: '自动识别', en: 'English', zh: '中文' }).setValue(this.plugin.settings.language)
        .onChange(async (v) => { this.plugin.settings.language = v; await this.plugin.saveData(this.plugin.settings); }));
    text('whisperPath', 'whisper-cli 路径', 'Homebrew 安装的默认位置');
    text('modelPath', '模型文件', 'ggml 格式的 Whisper 模型');
    text('audioFolder', '音频保存位置', '录音的压缩音频（.webm）存这里');
    text('inboxFolder', '未分类录音笔记', '没选课程时笔记放这里');
    text('threads', 'CPU 线程数', '一般填 CPU 核心数，越多转写越快');
    new obsidian.Setting(containerEl).setName('检查转写环境').setDesc('确认 whisper-cli 和模型都在')
      .addButton((b) => b.setButtonText('检查').onClick(() => this.plugin.checkSetup(true)));
  }
}

/* ───────────────────────────── plugin ───────────────────────────── */

class VoiceModule extends SubModule {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) || {});
    this.rec = null;
    this.presetCourse = undefined;   // undefined = ask after recording; null = Inbox; 'ECON201' = that course
    this.queue = Promise.resolve();
    this.addRibbonIcon('mic', '录音 / 停止', () => this.toggle());
    this.addCommand({ id: 'toggle', name: '开始 / 停止录音', callback: () => this.toggle() });
    this.addCommand({ id: 'mark', name: '录音时标记重点 ⭐', callback: () => this.mark() });
    this.addCommand({ id: 'cancel', name: '取消当前录音（不保存）', callback: () => this.cancel() });
    this.addCommand({ id: 'transcribe-current', name: '转写当前笔记里的录音', callback: () => this.transcribeActive() });
    this.addSettingTab(new VoiceSettingTab(this.app, this));
    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass('sv-status');
    this.statusEl.onclick = () => this.toggle();
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (!(file instanceof obsidian.TFile) || !AUDIO_EXT.includes(file.extension.toLowerCase())) return;
      menu.addItem((it) => it.setTitle('🎙 转写成笔记').setIcon('mic').onClick(() => this.transcribeAudioFile(file)));
    }));
    this.buildFloat();
    this.app.workspace.onLayoutReady(async () => {
      await this.resumeStuck();     // first, so notes recovered below are not queued twice
      await this.recoverOrphans();
    });
  }

  // A reload or quit must not cost the recording: stop the devices and leave the audio for the next launch.
  onunload() {
    const rec = this.rec;
    if (!rec) return;
    try { rec.mr.stop(); } catch (e) { /* not started */ }
    this.teardown(rec);
  }

  courseOptions() {
    const pulse = this.peer('pulse');
    const ps = (pulse && pulse.settings) || {};
    const root = ps.courseRoot || this.settings.courseRoot;
    const list = pulse && pulse.courseCodes ? pulse.courseCodes() : String(this.settings.courses).split(/[,，]/).map((x) => x.trim()).filter(Boolean);
    return { root, options: list.map((c) => ({ label: c, value: c, hint: `${root}/${c}/录音/` })).concat([{ label: '其他 · 放进收件箱', value: null, hint: this.settings.inboxFolder }]) };
  }

  checkSetup(verbose) {
    const okBin = fs.existsSync(this.settings.whisperPath), okModel = fs.existsSync(this.settings.modelPath);
    if (verbose || !okBin || !okModel) {
      new obsidian.Notice(okBin && okModel ? '✅ 转写环境正常：whisper-cli 和模型都在' :
        `⚠️ ${okBin ? '' : '找不到 whisper-cli（brew install whisper-cpp）。'}${okModel ? '' : '找不到模型文件，请在设置里检查路径。'}`, 8000);
    }
    return okBin && okModel;
  }

  /* ── recording ── */

  async toggle() { return this.rec ? this.stop() : this.start(); }

  async start() {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    } catch (e) {
      new obsidian.Notice('无法使用麦克风。请在 系统设置 → 隐私与安全性 → 麦克风 里允许 Obsidian。', 10000);
      return;
    }
    let ctx;
    try { ctx = new AudioContext({ sampleRate: SAMPLE_RATE }); } catch (e) { ctx = new AudioContext(); }
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser(); analyser.fftSize = 512;
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const rec = { stream, ctx, analyser, proc, pcm: [], webm: [], marks: [], startedAt: Date.now(), quietSince: Date.now(), rate: ctx.sampleRate, course: this.presetCourse };
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    this.openRecovery(rec);
    proc.onaudioprocess = (e) => { rec.pcm.push(floatToInt16(resampleTo16k(new Float32Array(e.inputBuffer.getChannelData(0)), rec.rate))); };
    src.connect(analyser); src.connect(proc); proc.connect(ctx.destination);
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    rec.mr = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32000 });
    rec.mr.ondataavailable = (e) => { if (e.data && e.data.size) { rec.webm.push(e.data); this.appendChunk(rec, e.data); } };
    rec.mr.start(5000);
    stream.getAudioTracks().forEach((t) => { t.onended = () => this.micLost(rec); });
    this.rec = rec;
    this.tick = window.setInterval(() => { this.updateFloat(); this.watchMic(); }, 200);
    this.registerInterval(this.tick);
    this.updateFloat();
    this.emit(true);
    new obsidian.Notice('🎙 开始录音');
  }

  mark() {
    if (!this.rec) return;
    const t = (Date.now() - this.rec.startedAt) / 1000;
    this.rec.marks.push(t);
    this.saveMeta(this.rec);
    new obsidian.Notice(`⭐ 已标记 ${clock(t)}`, 2000);
    this.updateFloat();
    this.emit(true);
  }

  teardown(rec) {
    window.clearInterval(this.tick);
    rec.stream.getTracks().forEach((t) => t.stop());
    try { rec.proc.disconnect(); rec.ctx.close(); } catch (e) { /* already closed */ }
    this.rec = null;
    this.updateFloat();
    this.emit(true);
  }

  async cancel() {
    const rec = this.rec;
    if (!rec) return;
    rec.dropped = true;
    try { rec.mr.stop(); } catch (e) { /* not started */ }
    this.teardown(rec);
    await rec.write;
    this.dropRecovery(rec);
    new obsidian.Notice('录音已取消，没有保存');
  }

  /* ── crash safety ── */

  recoveryDir() { return path.join(this.app.vault.adapter.getBasePath(), this.app.vault.configDir, 'plugins', 'term-compass', 'recovery'); }

  // If the folder cannot be made the recording still runs, it just loses crash safety.
  openRecovery(rec) {
    rec.write = Promise.resolve();
    try {
      const dir = this.recoveryDir();
      fs.mkdirSync(dir, { recursive: true });
      rec.file = path.join(dir, `${rec.startedAt}.webm`);
      rec.meta = path.join(dir, `${rec.startedAt}.json`);
      this.saveMeta(rec);
    } catch (e) {
      console.error('[term-compass] recovery folder unavailable', e);
      new obsidian.Notice('⚠️ 这段录音无法实时存盘，中途退出 Obsidian 会丢失');
    }
  }

  saveMeta(rec) {
    if (!rec.meta) return;
    try { fs.writeFileSync(rec.meta, JSON.stringify({ startedAt: rec.startedAt, course: rec.course, marks: rec.marks })); }
    catch (e) { console.error('[term-compass] recovery info not saved', e); }
  }

  // Chained so chunks land in order; a chunk that fails to write is still in memory for a normal stop.
  appendChunk(rec, blob) {
    rec.write = rec.write.then(async () => { if (rec.file && !rec.dropped) await fs.promises.appendFile(rec.file, Buffer.from(await blob.arrayBuffer())); })
      .catch((e) => console.error('[term-compass] chunk not saved', e));
  }

  dropRecovery(rec) { for (const p of [rec.file, rec.meta]) if (p) fs.rmSync(p, { force: true }); }

  async recoverOrphans() {
    const dir = this.recoveryDir();
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.webm'))) {
      const file = path.join(dir, name);
      if (this.rec && this.rec.file === file) continue;
      // On failure the files stay, so the next launch tries again.
      try { await this.recoverOne({ file, meta: file.replace(/webm$/, 'json') }); } catch (e) { console.error('[term-compass] recovery failed', name, e); }
    }
  }

  async recoverOne(rec) {
    const bytes = fs.readFileSync(rec.file);
    if (bytes.length < MIN_RECOVER_BYTES) { this.dropRecovery(rec); return; }
    const meta = fs.existsSync(rec.meta) ? JSON.parse(fs.readFileSync(rec.meta, 'utf8')) : {};
    const started = new Date(meta.startedAt || parseInt(path.basename(rec.file), 10));
    const course = meta.course || null, marks = meta.marks || [];
    const copy = () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length);
    const audio = await this.saveAudio(started, course, copy());
    let decoded = null;
    try { decoded = await decodeTo16k(copy()); } catch (e) { console.error('[term-compass] recovered audio not decoded', e); }
    const seconds = decoded ? decoded.seconds : Math.max(0, (fs.statSync(rec.file).mtimeMs - started) / 1000);
    const note = await this.createNote({ course, root: this.courseOptions().root, started, seconds, marks, audio });
    if (decoded) this.enqueue(note, this.writeWav(decoded.pcm), seconds, marks, course);
    else await this.fillNote(note, null, '音频已经找回，但这段录音解码失败。可以在这篇笔记里运行命令「转写当前笔记里的录音」重试。');
    this.dropRecovery(rec);
    new obsidian.Notice(`🎙 找回了上次没保存完的录音（${clock(seconds)}）${course ? `，放在 ${course}` : '，放在 Inbox'}`, 15000);
  }

  // A quit during transcription leaves a note at 转写中 with nothing running.
  async resumeStuck() {
    for (const note of this.app.vault.getMarkdownFiles()) {
      const fm = (this.app.metadataCache.getFileCache(note) || {}).frontmatter || {};
      if (fm.type !== '录音' || fm.status !== '转写中') continue;
      try { await this.retranscribe(note); } catch (e) { console.error('[term-compass] resume failed', note.path, e); }
    }
  }

  /* ── mic watch ── */

  warn(title, body) {
    new obsidian.Notice(`${title}\n${body}`, 0);
    if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body });
  }

  watchMic() {
    const rec = this.rec;
    if (!rec) return;
    const now = Date.now();
    if (this.level() > QUIET_LEVEL) { rec.quietSince = now; rec.warned = false; return; }
    if (rec.warned || now - rec.quietSince < QUIET_MS) return;
    rec.warned = true;
    this.warn('🎙 麦克风好像没有声音', `已经 ${QUIET_MS / 1000} 秒没收到声音了，检查一下麦克风有没有断开或静音。`);
  }

  // AirPods gone or mic unplugged: the recorder has stopped by itself, so save what there is.
  async micLost(rec) {
    if (this.rec !== rec) return;
    this.warn('🎙 麦克风断开了', '这段录音已经自动保存。要继续的话再开一段。');
    await this.stop();
  }

  async stop() {
    const rec = this.rec;
    if (!rec) return;
    const seconds = (Date.now() - rec.startedAt) / 1000;
    if (rec.mr.state !== 'inactive') await new Promise((res) => { rec.mr.onstop = res; rec.mr.stop(); });
    this.teardown(rec);
    await rec.write;
    if (seconds < 1.5) { this.dropRecovery(rec); new obsidian.Notice('录音太短，没有保存'); return; }
    const { root, options } = this.courseOptions();
    const course = this.presetCourse !== undefined ? this.presetCourse : await new Promise((res) => new CourseModal(this.app, options, res).open());
    const started = new Date(rec.startedAt);
    try {
      const audio = await this.saveAudio(started, course, await new Blob(rec.webm, { type: 'audio/webm' }).arrayBuffer());
      const note = await this.createNote({ course, root, started, seconds, marks: rec.marks, audio });
      this.enqueue(note, this.writeWavChunks(rec.pcm), seconds, rec.marks, course);
      this.dropRecovery(rec);
      this.app.workspace.getLeaf('tab').openFile(note);
    } catch (e) {
      console.error('[term-compass] save failed', e);
      new obsidian.Notice('保存录音失败。音频还在，下次打开 Obsidian 时会自动找回。', 15000);
    }
  }

  async saveAudio(started, course, data) {
    await ensureFolder(this.app.vault, this.settings.audioFolder);
    const stamp = `${dkey(started)} ${pad(started.getHours())}${pad(started.getMinutes())}`;
    const p = await uniquePath(this.app.vault, `${this.settings.audioFolder}/${stamp}${course ? ' ' + course : ''} 录音`, 'webm');
    await this.app.vault.createBinary(p, data);
    return p;
  }

  writeWavChunks(chunks) {
    const wav = path.join(os.tmpdir(), `term-compass-${Date.now()}.wav`);
    fs.writeFileSync(wav, encodeWav(chunks));
    return wav;
  }

  writeWav(pcm) { return this.writeWavChunks([pcm]); }

  async createNote(o) {
    const folder = o.course ? `${o.root}/${o.course}/录音` : this.settings.inboxFolder;
    await ensureFolder(this.app.vault, folder);
    const time = `${pad(o.started.getHours())}:${pad(o.started.getMinutes())}`;
    const title = `${o.course ? o.course + ' ' : ''}录音 · ${o.started.getMonth() + 1}-${pad(o.started.getDate())} ${time}`;
    const p = await uniquePath(this.app.vault, `${folder}/${dkey(o.started)} ${pad(o.started.getHours())}${pad(o.started.getMinutes())}${o.course ? ' ' + o.course : ''} 录音`, 'md');
    return this.app.vault.create(p, noteBody({ title, course: o.course, date: dkey(o.started), seconds: o.seconds, audio: o.audio, marks: o.marks }));
  }

  /* ── transcription ── */

  enqueue(note, wav, seconds, marks, course) {
    this.queue = this.queue.then(() => this.transcribe(note, wav, seconds, marks, course)).catch((e) => console.error('[term-compass]', e));
  }

  transcribe(note, wav, seconds, marks, course) {
    return new Promise((resolve) => {
      if (!this.checkSetup(false)) { this.fillNote(note, null, '找不到 whisper-cli 或模型文件。装好后在这篇笔记里运行命令「转写当前笔记里的录音」。'); resolve(); return; }
      const s = this.settings;
      const segs = [];
      let outBuf = '', errTail = '';
      this.job = { course, progress: 0, seconds };
      this.updateFloat();
      const child = spawn(s.whisperPath, whisperArgs(s, wav));
      child.stdout.on('data', (d) => {
        outBuf += d.toString();
        const lines = outBuf.split('\n'); outBuf = lines.pop();
        for (const l of lines) { const sg = parseWhisperLine(l.trim()); if (sg) segs.push(sg); }
      });
      child.stderr.on('data', (d) => {
        const str = d.toString(); errTail = (errTail + str).slice(-2000);
        const m = str.match(/progress\s*=\s*(\d+)%/g);
        if (m) { this.job.progress = +m[m.length - 1].match(/(\d+)/)[1]; this.updateFloat(); }
      });
      child.on('error', (e) => { this.finishJob(); this.fillNote(note, null, `转写程序启动失败：${e.message}`); fs.unlink(wav, () => {}); resolve(); });
      child.on('close', async (code) => {
        const last = parseWhisperLine(outBuf.trim()); if (last) segs.push(last);
        this.finishJob();
        fs.unlink(wav, () => {});
        if (code !== 0 || !segs.length) {
          console.error('[term-compass] whisper failed', code, errTail);
          await this.fillNote(note, null, code === 0 ? '没有识别到语音内容。' : `转写失败（退出码 ${code}），详见开发者控制台。`);
        } else {
          const kept = await this.fillNote(note, formatTranscript(segs, marks));
          this.emit(true);
          if (!kept) { resolve(); return; }
          const msg = `${course ? course + ' ' : ''}录音已转写（${clock(seconds)}）`;
          new obsidian.Notice(`✅ ${msg}`, 8000);
          if ('Notification' in window && Notification.permission === 'granted') new Notification('🎙 录音转写完成', { body: msg, silent: true });
        }
        resolve();
      });
    });
  }

  setPreset(course) { this.presetCourse = course; this.emit(true); }

  finishJob() { this.job = null; this.updateFloat(); this.emit(true); }

  // Returns false if the note was deleted while transcribing, so the queue keeps moving.
  async fillNote(note, transcript, error) {
    if (!this.app.vault.getAbstractFileByPath(note.path)) return false;
    await this.app.vault.process(note, (text) => {
      const body = transcript || `> [!warning] ${error}`;
      let out = text.replace(/<!-- term-compass:transcript -->[\s\S]*?<!-- \/term-compass:transcript -->/, `<!-- term-compass:transcript -->\n${body}\n<!-- /term-compass:transcript -->`);
      out = out.replace(/^status: .*$/m, `status: ${transcript ? '已转写' : '转写失败'}`);
      out = out.replace(/> \[!info\] 正在本地转写[^\n]*\n\n?/, transcript ? '' : '');
      return out;
    });
    return true;
  }

  /** Transcribe an audio file that is already in the vault (e.g. a Voice Memos .m4a). */
  async transcribeAudioFile(file) {
    if (!this.checkSetup(true)) return;
    try {
      new obsidian.Notice(`🎙 正在读取 ${file.name}…`);
      const { pcm, seconds } = await decodeTo16k(await this.app.vault.readBinary(file));
      const { root, options } = this.courseOptions();
      const course = await new Promise((res) => new CourseModal(this.app, options, res).open());
      const started = new Date(file.stat.ctime);
      const note = await this.createNote({ course, root, started, seconds, marks: [], audio: file.path });
      this.enqueue(note, this.writeWav(pcm), seconds, [], course);
      this.app.workspace.getLeaf('tab').openFile(note);
    } catch (e) {
      console.error('[term-compass] decode failed', e);
      new obsidian.Notice('这个音频格式读不了，试试 m4a / mp3 / wav');
    }
  }

  /** Re-run transcription for the recording linked in the open note. */
  async transcribeActive() {
    const note = this.app.workspace.getActiveFile();
    if (note && await this.retranscribe(note)) new obsidian.Notice('🎙 已开始重新转写');
  }

  async retranscribe(note) {
    const fm = (this.app.metadataCache.getFileCache(note) || {}).frontmatter || {};
    const link = String(fm.audio || '').replace(/^\[\[|\]\]$/g, '');
    const audio = link && this.app.metadataCache.getFirstLinkpathDest(link, note.path);
    if (!audio) { new obsidian.Notice('这篇笔记的 frontmatter 里没有 audio 链接'); return false; }
    if (!this.checkSetup(true)) return false;
    const { pcm, seconds } = await decodeTo16k(await this.app.vault.readBinary(audio));
    const marks = [...(await this.app.vault.read(note)).matchAll(/^- (\d+:\d\d(?::\d\d)?)$/gm)].map((m) => m[1].split(':').reduce((a, v) => a * 60 + +v, 0));
    await this.app.vault.process(note, (t) => t.replace(/<!-- term-compass:transcript -->[\s\S]*?<!-- \/term-compass:transcript -->/, '<!-- term-compass:transcript -->\n（转写中…）\n<!-- /term-compass:transcript -->'));
    this.enqueue(note, this.writeWav(pcm), seconds, marks, fm.course && fm.course !== '其他' ? fm.course : null);
    return true;
  }

  /* ── floating recorder / status ── */

  buildFloat() {
    const el = h('div', 'sv-float', document.body);
    this.register(() => el.remove());
    const dot = h('span', 'sv-dot', el);
    const time = h('span', 'sv-time', el);
    const bars = h('span', 'sv-bars', el);
    for (let i = 0; i < 5; i++) h('i', '', bars);
    const marks = h('span', 'sv-marks', el);
    const markB = h('button', 'sv-btn', el, '⭐ 标记');
    const stopB = h('button', 'sv-btn is-stop', el, '■ 停止');
    const cancelB = h('button', 'sv-btn is-ghost', el, '✕');
    markB.title = '标记重点（转写里会加 ⭐）'; stopB.title = '停止并保存'; cancelB.title = '取消，不保存';
    markB.onclick = () => this.mark(); stopB.onclick = () => this.stop(); cancelB.onclick = () => this.cancel();
    this.float = { el, dot, time, bars, marks, markB, stopB, cancelB };
  }

  /** Live state for other panels (e.g. the 录音 tab in the tasks side bar). */
  getState() {
    const rec = this.rec;
    return {
      recording: !!rec, seconds: rec ? (Date.now() - rec.startedAt) / 1000 : 0, marks: rec ? rec.marks.length : 0,
      level: rec ? this.level() : 0, job: this.job ? Object.assign({}, this.job) : null, preset: this.presetCourse,
      courses: this.courseOptions().options,
    };
  }

  level() {
    const rec = this.rec;
    if (!rec) return 0;
    const data = new Uint8Array(rec.analyser.fftSize);
    rec.analyser.getByteTimeDomainData(data);
    let sum = 0; for (const v of data) sum += ((v - 128) / 128) ** 2;
    return Math.min(1, Math.sqrt(sum / data.length) * 6);
  }

  // Panels listen with app.workspace.on('term-compass:voice-change'); throttled for the 200 ms recorder tick.
  emit(force) {
    const now = Date.now();
    if (!force && now - (this._lastEmit || 0) < 1000) return;
    this._lastEmit = now;
    this.app.workspace.trigger('term-compass:voice-change');
  }

  updateFloat() {
    this.emit(false);
    const f = this.float;
    if (!f) return;
    const rec = this.rec, job = this.job;
    f.el.classList.toggle('is-visible', !!(rec || job));
    f.el.classList.toggle('is-job', !rec && !!job);
    [f.markB, f.stopB, f.cancelB, f.bars].forEach((e) => { e.style.display = rec ? '' : 'none'; });
    if (rec) {
      const sec = (Date.now() - rec.startedAt) / 1000;
      f.time.textContent = `录音 ${clock(sec)}`;
      f.marks.textContent = rec.marks.length ? `⭐${rec.marks.length}` : '';
      const lvl = this.level();
      [...f.bars.children].forEach((b, i) => { b.style.height = `${3 + Math.max(0, lvl * 14 - Math.abs(i - 2) * 3)}px`; });
      this.statusEl.setText(`● 录音 ${clock(sec)}`);
    } else if (job) {
      f.time.textContent = `转写中 ${job.progress}%${job.course ? ' · ' + job.course : ''}`;
      f.marks.textContent = '';
      this.statusEl.setText(`🎙 转写 ${job.progress}%`);
    } else this.statusEl.setText('');
  }
}

VoiceModule.__test = { parseWhisperLine, formatTranscript, flagged, whisperArgs, encodeWav, noteBody, clock };
return VoiceModule;
