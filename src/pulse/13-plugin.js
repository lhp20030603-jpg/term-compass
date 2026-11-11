/* ───────────────────────────── plugin ───────────────────────────── */

class LevelUpModal extends obsidian.Modal {
  constructor(app, level, title, nextNeed, newTitle, items) { super(app); Object.assign(this, { level, title, nextNeed, newTitle, items: items || [] }); }
  onOpen() {
    this.modalEl.addClass('sp-levelup-modal');
    const c = this.contentEl;
    const burst = h('div', 'sp-confetti', c);
    const colors = ['#5b6bd5', '#e3a43a', '#e07a5f', '#3d9a8b', '#b5669e', '#ffd75e'];
    for (let i = 0; i < 46; i++) {
      const p = h('i', '', burst);
      p.style.left = `${Math.random() * 100}%`;
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = `${Math.random() * 0.5}s`;
      p.style.animationDuration = `${1.4 + Math.random() * 1.2}s`;
    }
    h('div', 'sp-lu-kicker', c, 'LEVEL UP');
    h('div', 'sp-lu-level', c, `Lv ${this.level}`);
    h('div', 'sp-lu-title', c, this.newTitle ? `解锁新称号：${this.title}` : this.title);
    if (this.items.length) {
      const box = h('div', 'sp-lu-items', c);
      this.items.forEach((u) => { const it = h('div', 'sp-lu-item', box); h('div', 'sp-lu-item-icon', it, u.icon); h('div', '', it, `解锁：${u.name}`); });
    }
    h('div', 'sp-lu-sub', c, `下一级还需 ${fmtInt(this.nextNeed)} XP。继续保持！`);
    const b = h('button', 'mod-cta', c, '继续冒险');
    b.onclick = () => this.close();
  }
  onClose() { this.contentEl.empty(); }
}

class PulseView extends obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.range = 90; this.metric = 'score'; this.selectedDay = null;
    this.actions = plugin.actions;
  }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return '学期罗盘'; }
  getIcon() { return 'activity'; }
  async onOpen() { await this.refresh(); }
  set(patch) { Object.assign(this, patch); this.refresh(); }
  selectDay(k) { this.selectedDay = k; this.actions.setFolded('当日详情', false); this.refresh(); }
  async refresh(force) {
    const scroll = this.contentEl.scrollTop;
    const model = await this.plugin.getModel(force);
    if (!this.selectedDay) this.selectedDay = model.today;
    this.contentEl.addClass('sp-view');
    renderDashboard(this.contentEl, model, this);
    this.contentEl.scrollTop = scroll;
    this.plugin.tickPomo();
  }
}

class DashboardSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new obsidian.Setting(containerEl).setName('看板').setHeading();
    new obsidian.Setting(containerEl).setName('设置向导和识别检查').setDesc('重新选课程文件夹、学期日期，或者看看哪些笔记没被认出来')
      .addButton((b) => b.setButtonText('设置向导').onClick(() => this.plugin.openSetup()))
      .addButton((b) => b.setButtonText('识别检查').onClick(() => this.plugin.openCheck()));
    const text = (key, name, desc) => new obsidian.Setting(containerEl).setName(name).setDesc(desc)
      .addText((t) => t.setValue(String(this.plugin.settings[key])).onChange(async (v) => {
        this.plugin.settings[key] = typeof DEFAULT_SETTINGS[key] === 'number' ? Number(v) || DEFAULT_SETTINGS[key] : v;
        await this.plugin.persist(); this.plugin.scheduleRefresh();
      }));
    text('courseRoot', '课程根目录', '每门课是这里的一个子文件夹');
    text('courses', '课程代码', '逗号分隔，顺序就是卡片顺序');
    text('englishRoot', '英语文件夹', '这里的写作计入「英语」');
    text('readingFolder', '每日阅读文件夹', '文件名以 YYYY-MM-DD 开头，每篇算一次精读');
    text('scheduleFile', '学期总览', '读取「关键日期」表和「本周」清单');
    text('termStart', '学期开始', 'YYYY-MM-DD。第 1 周是开学这天所在的那一周，每周从周一开始');
    text('termEnd', '学期结束', 'YYYY-MM-DD。留空的话按秋季 9 月–次年 1 月、春季 2–6 月估');
    text('yearStartMonth', '学年从几月开始', '大多数学校是 9；澳洲、新西兰按自然年，填 1');
    text('focusMinutes', '番茄专注分钟', '');
    text('breakMinutes', '休息分钟', '');
    text('pomodoroGoal', '每日番茄目标', '');
    const toggle = (key, name, desc) => new obsidian.Setting(containerEl).setName(name).setDesc(desc)
      .addToggle((tg) => tg.setValue(!!this.plugin.settings[key]).onChange(async (v) => {
        this.plugin.settings[key] = v; await this.plugin.persist(); this.plugin.tickPomo();
      }));
    toggle('showFloat', '悬浮计时器', '计时时在屏幕角落显示一个可拖动的小计时器');
    toggle('sound', '提示音', '时间到时响两声');
    toggle('systemNotify', '系统通知', '时间到时发 macOS 通知，Obsidian 在后台也能看到');
    text('backupFolder', '自动备份文件夹', '每天打包一次到这里，放在会同步到云端的文件夹里。留空就不备份');
    text('backupKeep', '保留备份份数', '更早的自动删除，录音不受影响');
    new obsidian.Setting(containerEl).setName('现在备份一次').setDesc(backupLine(this.plugin.data.backup))
      .addButton((b) => b.setButtonText('备份').onClick(() => this.plugin.maybeBackup(true)));
    new obsidian.Setting(containerEl).setName('清空实测数据').setDesc('只清空插件记录的每日统计，不动任何笔记')
      .addButton((b) => b.setButtonText('清空').setWarning().onClick(async () => {
        this.plugin.data.days = {}; await this.plugin.persist(); new obsidian.Notice('已清空'); this.plugin.scheduleRefresh();
      }));
  }
}

class PulseModule extends SubModule {
  async onload() {
    const saved = (await this.loadData()) || {};
    this.data = { days: saved.days || {}, pomo: saved.pomo || { mode: 'idle' }, floatPos: saved.floatPos || null, game: saved.game || null,
      backup: saved.backup || null, reading: saved.reading || {} };
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved.settings || {});
    this.cache = {};
    this.lastEdit = {};
    this.lastMinute = '';
    this.keyed = {}; this.pastedAt = {}; this.lastKey = 0; this.lastInput = 0;
    this.quiet = new Set();   // files this plugin is writing itself, e.g. the sample course
    this.blocks = new Set();
    this.ready = false;
    this.actions = {
      open: (p) => this.app.workspace.openLinkText(p, '', false),
      command: (id) => {
        if (!this.host.run(id)) new obsidian.Notice('这个功能在当前设备上不可用');
      },
      toggleTask: (t) => this.toggleTask(t),
      toggleLecture: (code, it) => this.toggleLecture(code, it),
      toggleCourseTask: (code, tk) => this.toggleCourseTask(code, tk),
      toggleNoteTask: (m) => this.toggleNoteTask(m),
      setFolded: (key, on) => {
        this.settings.folded = this.settings.folded.filter((k) => k !== key).concat(on ? [key] : []);
        this.persistSoon();
      },
      openCourse: (code) => { const c = (this._model || { courses: [] }).courses.find((x) => x.code === code); if (c && c.homePath) this.app.workspace.openLinkText(c.homePath, '', false); },
      pomoStart: () => this.pomoStart(),
      pomoStop: () => this.pomoStop(),
      pomoToggle: () => this.pomoToggle(),
      setup: () => this.openSetup(),
      check: () => this.openCheck(),
      setTheme: async (key) => { this.settings.theme = key; await this.persist(); this._model = null; this.scheduleRefresh(); for (const l of this.app.workspace.getLeavesOfType(VIEW_TYPE)) if (l.view instanceof PulseView) l.view.refresh(true); },
    };

    this.registerView(VIEW_TYPE, (leaf) => new PulseView(leaf, this));
    this.addRibbonIcon('compass', '学期罗盘', () => this.activate());
    this.addCommand({ id: 'open-dashboard', name: '打开看板', callback: () => this.activate() });
    this.addCommand({ id: 'open-setup', name: '打开设置向导', callback: () => this.openSetup() });
    this.addCommand({ id: 'open-guide', name: '打开使用指南', callback: () => this.openGuide(true) });
    this.addCommand({ id: 'check-notes', name: '识别检查：看看认出了哪些课程和讲次', callback: () => this.openCheck() });
    this.addCommand({ id: 'pomodoro-start', name: '开始番茄钟', callback: () => this.pomoStart() });
    this.addCommand({ id: 'pomodoro-stop', name: '停止番茄钟', callback: () => this.pomoStop() });
    this.addCommand({ id: 'pomodoro-toggle', name: '开始 / 暂停 / 继续番茄钟', callback: () => this.pomoToggle() });
    this.addSettingTab(new DashboardSettingTab(this.app, this));
    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass('sp-status');
    this.statusEl.onclick = () => this.pomoToggle();
    this.buildFloat();
    this.armPomoTimer();

    this.registerMarkdownCodeBlockProcessor('term-compass', async (src, el) => {
      const block = { el, section: (src.trim().split(/\s+/)[0] || 'dashboard').toLowerCase(), view: null };
      this.blocks.add(block);
      await this.renderBlock(block);
    });

    this.registerInterval(window.setInterval(() => this.tickPomo(), 1000));
    this.app.workspace.onLayoutReady(async () => {
      await this.buildCache();
      this.cleanGenerated();
      this.ready = true;
      this.registerEvent(this.app.vault.on('modify', (f) => this.onModify(f)));
      this.registerEvent(this.app.vault.on('create', (f) => this.onCreate(f)));
      this.registerEvent(this.app.vault.on('delete', (f) => { delete this.cache[f.path]; this.scheduleRefresh(); }));
      this.registerEvent(this.app.vault.on('rename', (f, old) => {
        this.cache[f.path] = this.cache[old]; delete this.cache[old];
        if (this.data.reading[old]) { this.data.reading[f.path] = this.data.reading[old]; delete this.data.reading[old]; this.persistSoon(); }
      }));
      this.watchInput();
      this.scheduleRefresh();
      if (!this.settings.setupDone) this.openSetup();
      this.registerInterval(window.setTimeout(() => this.maybeBackup(), 60000));
      this.registerInterval(window.setInterval(() => this.maybeBackup(), 3600000));
      // A window left open overnight must not keep saying 今天 about yesterday.
      this.registerInterval(window.setInterval(() => { if (this._model && this._model.today !== dkey(new Date())) this.scheduleRefresh(); }, 300000));
      this.registerEvent(this.app.workspace.on('term-compass:cards-change', () => this.scheduleRefresh()));
    });
  }

  async onunload() { await this.persist(); }

  async persist() {
    const { days, pomo, floatPos, game, backup, reading } = this.data;
    await this.saveData({ settings: this.settings, days, pomo, floatPos, game, backup, reading });
  }

  persistSoon() {
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => this.persist(), 4000);
  }

  /* ── first run ── */

  openSetup() { new SetupModal(this.app, this).open(); }

  async openCheck() {
    const model = await this.getModel(true);
    const counts = {};
    const cards = this.peer('cards');
    if (cards) for (const c of await cards.cards()) counts[c.course] = (counts[c.course] || 0) + 1;
    new CheckModal(this.app, recognitionReport(model, counts), () => this.openSetup()).open();
  }

  async finishSetup(pick) {
    Object.assign(this.settings, { courseRoot: pick.root, termStart: pick.start, termEnd: pick.end, yearStartMonth: pick.calendarYear ? 1 : 9,
      scheduleFile: `${pick.root}/学期总览.md`, setupDone: true });
    await this.persist();
    if (pick.sample) await this.writeSample(pick.root);
    this._model = null;
    await this.openGuide(false);   // opened first, so the dashboard ends up in front
    await this.activate();
    this.scheduleRefresh();
    if (!pick.sample) window.setTimeout(() => this.openCheck(), 800);
  }

  // The guide is written once and never over the user's copy; it opens in a tab beside the dashboard.
  async openGuide(focus) {
    const vault = this.app.vault;
    let f = vault.getAbstractFileByPath(GUIDE_PATH);
    if (!f) {
      this.quiet.add(GUIDE_PATH);
      const dir = GUIDE_PATH.split('/').slice(0, -1).join('/');
      if (dir && !vault.getAbstractFileByPath(dir)) await vault.createFolder(dir);
      f = await vault.create(GUIDE_PATH, guideText(this.settings.courseRoot));
      window.setTimeout(() => this.quiet.delete(GUIDE_PATH), 10000);
    }
    await this.app.workspace.getLeaf('tab').openFile(f, { active: !!focus, state: { mode: 'preview' } });
  }

  // Existing notes are never overwritten. The files do not count as your writing.
  async writeSample(root) {
    const vault = this.app.vault;
    const notes = sampleSemester(new Date(), root);
    Object.keys(notes).forEach((p) => this.quiet.add(p));
    for (const [p, text] of Object.entries(notes)) {
      if (vault.getAbstractFileByPath(p)) continue;
      const parts = p.split('/').slice(0, -1);
      for (let i = 1; i <= parts.length; i++) { const dir = parts.slice(0, i).join('/'); if (!vault.getAbstractFileByPath(dir)) await vault.createFolder(dir); }
      await vault.create(p, text);
    }
    window.setTimeout(() => Object.keys(notes).forEach((p) => this.quiet.delete(p)), 10000);
  }

  // Real input tells typing from tool writes, and reading from a note left open.
  watchInput() {
    const ws = this.app.workspace;
    this.registerEvent(ws.on('editor-change', (_e, info) => { if (info && info.file) this.keyed[info.file.path] = Date.now(); }));
    this.registerEvent(ws.on('editor-paste', (_evt, _e, info) => { if (info && info.file) this.pastedAt[info.file.path] = Date.now(); }));
    const seen = () => { this.lastInput = Date.now(); };
    this.registerDomEvent(document, 'keydown', () => { this.lastKey = this.lastInput = Date.now(); }, true);
    for (const ev of ['mousemove', 'wheel', 'pointerdown']) this.registerDomEvent(document, ev, seen, { capture: true, passive: true });
    this.registerInterval(window.setInterval(() => this.readingTick(), READING_TICK_S * 1000));
  }

  // The editor also fires when a tool rewrites an open note, so a key must have been pressed too.
  typedJustNow(path) {
    const now = Date.now(), recent = (t) => now - (t || 0) < TYPED_WINDOW_MS;
    return recent(this.keyed[path]) && recent(this.lastKey) && !recent(this.pastedAt[path]);
  }

  // Time in a course note or PDF, while the window is in use and no pomodoro or recording already covers it.
  readingTick() {
    if (!document.hasFocus() || Date.now() - this.lastInput > READING_IDLE_MS) return;
    const voice = this.peer('voice');
    if ((this.data.pomo || {}).mode === 'focus' || (voice && voice.rec)) return;
    const view = this.app.workspace.getActiveViewOfType(obsidian.FileView || obsidian.MarkdownView);
    const path = view && view.file && view.file.path;
    if (!path || !path.startsWith(this.settings.courseRoot + '/') || !isReading(path)) return;
    this.today().readSec += READING_TICK_S;
    this.data.reading[path] = (this.data.reading[path] || 0) + READING_TICK_S;
    this.persistSoon();
  }

  // Recording notes are the source for lecture time, so deleting one takes its minutes away.
  recordingList(files) {
    const out = [];
    for (const f of files) {
      if (!f.path.includes('/录音/')) continue;
      const file = this.app.vault.getAbstractFileByPath(f.path);
      const fm = (file && (this.app.metadataCache.getFileCache(file) || {}).frontmatter) || {};
      if (fm.type !== '录音' || !fm.date || !fm.duration) continue;
      const seconds = String(fm.duration).split(':').reduce((a, v) => a * 60 + Number(v), 0);
      out.push({ date: String(fm.date).slice(0, 10), minutes: seconds / 60, course: fm.course });
    }
    return out;
  }

  /** Once a day, pack the vault into a folder that syncs off this Mac. A failure retries hourly and warns once. */
  async maybeBackup(force) {
    const st = this.settings, today = dkey(new Date()), last = this.data.backup || {};
    if (!st.backupFolder || this._backingUp || !obsidian.Platform.isDesktopApp) return;
    if (last.day === today && !force) return;
    this._backingUp = true;
    const voice = this.peer('voice');
    try {
      const size = await runBackup({ vault: this.app.vault.adapter.getBasePath(), dest: expandHome(st.backupFolder),
        audioFolder: (voice && voice.settings.audioFolder) || '学期罗盘/录音音频', configDir: this.app.vault.configDir, today, keep: st.backupKeep });
      this.data.backup = { day: today, at: Date.now(), size };
      if (force) new obsidian.Notice(`✅ 备份完成（${(size / 1048576).toFixed(1)} MB）`);
    } catch (e) {
      console.warn('[term-compass] backup failed', e);
      if (force || last.failedDay !== today) new obsidian.Notice(`⚠️ 今天的自动备份失败：${e.message}`, 15000);
      this.data.backup = Object.assign({}, last, { error: e.message, failedDay: today });
    }
    this._backingUp = false;
    this.persistSoon();
    this.scheduleRefresh();
  }

  isMd(f) { return f instanceof obsidian.TFile && f.extension === 'md'; }

  async buildCache() {
    for (const f of this.app.vault.getMarkdownFiles()) {
      try {
        const text = await this.app.vault.cachedRead(f);
        this.cache[f.path] = noteStats(text);
      } catch (e) { console.warn('[term-compass] read failed', f.path, e); }
    }
  }

  today() {
    const k = dkey(new Date());
    const d = this.data.days[k] || (this.data.days[k] = emptyDay());
    const fresh = !d.fileStats;
    for (const key in emptyDay()) if (d[key] === undefined) d[key] = emptyDay()[key];
    if (fresh) for (const [p, w] of Object.entries(d.files)) d.fileStats[p] = { t: w, p: 0, area: areaOf(p, this.effective()) };
    return d;
  }

  async onModify(f) {
    if (!this.ready || !this.isMd(f) || f.path.startsWith(this.app.vault.configDir) || this.quiet.has(f.path)) return;
    const text = await this.app.vault.cachedRead(f);
    const prev = this.cache[f.path] || { w: 0, done: 0, open: 0 };
    const next = noteStats(text);
    this.cache[f.path] = next;
    if (this.isGenerated(f.path, true)) return;
    const d = this.today();
    applyWordDelta(d, f.path, areaOf(f.path, this.effective()), next.w - prev.w, this.typedJustNow(f.path));
    d.tasks = Math.max(0, d.tasks + taskFlips(prev.idx || NO_TASKS, next.idx));
    const now = Date.now();
    if (!this.lastEdit[f.path] || now - this.lastEdit[f.path] > EDIT_SESSION_GAP_MS) d.edits++;
    this.lastEdit[f.path] = now;
    const minute = new Date().toISOString().slice(0, 16);
    if (minute !== this.lastMinute) { this.lastMinute = minute; d.activeMin++; d.hours[new Date().getHours()]++; }
    this.persistSoon();
    this.scheduleRefresh();
  }

  /**
   * Files the plugins write themselves never count as new notes. With `wordsToo`,
   * also skip their word counts: the archive and old weekly reports only receive
   * moved or generated text. (Typing in the task list or memo inbox still counts.)
   */
  isGenerated(path, wordsToo) {
    const tp = this.peer('tasks');
    const ts = (tp && tp.settings) || {};
    const archive = ts.archiveFile || '学期罗盘/存档.md';
    const bulk = path === archive;
    if (wordsToo) return bulk;
    return bulk || path === (ts.taskFile || '学期罗盘/任务.md') || path === (ts.memoFile || '学期罗盘/随手记.md');
  }

  // One-time cleanup for days recorded before isGenerated existed.
  cleanGenerated() {
    let changed = false;
    for (const d of Object.values(this.data.days)) {
      const created = (d.created || []).filter((p) => !this.isGenerated(p));
      if (created.length !== (d.created || []).length) {
        d.notes = Math.max(0, d.notes - ((d.created || []).length - created.length));
        d.created = created; changed = true;
      }
      for (const p of Object.keys(d.fileStats || {})) {
        if (!this.isGenerated(p, true)) continue;
        delete d.fileStats[p]; delete d.files[p]; changed = true;
      }
      if (changed && d.fileStats) {
        d.words = 0; d.pasted = 0; d.areas = {};
        for (const [fp, x] of Object.entries(d.fileStats)) {
          d.words += x.t; d.pasted += x.p;
          d.areas[x.area] = (d.areas[x.area] || 0) + x.t + x.p * 0.25;
        }
      }
    }
    if (changed) this.persist();
  }

  async onCreate(f) {
    if (!this.ready || !this.isMd(f) || this.isGenerated(f.path) || this.quiet.has(f.path)) return;
    const d = this.today();
    d.notes++;
    d.created.push(f.path);
    this.cache[f.path] = { w: 0, done: 0, open: 0 };
    this.persistSoon();
    this.scheduleRefresh();
  }

  async readText(path) {
    const f = this.app.vault.getAbstractFileByPath(path);
    return f instanceof obsidian.TFile ? this.app.vault.cachedRead(f) : '';
  }

  /** Course names: the setting if filled in, else every folder in the course folder. */
  courseCodes() {
    const set = String(this.settings.courses || '').split(/[,，]/).map((x) => x.trim()).filter(Boolean);
    if (set.length) return set;
    const root = this.app.vault.getAbstractFileByPath(this.settings.courseRoot);
    const names = root && root.children ? root.children.filter((c) => !(c instanceof obsidian.TFile)).map((c) => c.name) : [];
    return courseFolders(names).sort((a, b) => a.localeCompare(b, 'zh'));
  }

  // The settings with the course list filled in, for everything that reads courses.
  effective() { return Object.assign({}, this.settings, { courses: this.courseCodes().join(',') }); }

  notesIn(files, code) {
    const prefix = `${this.settings.courseRoot}/${code}/`;
    return files.filter((f) => f.path.startsWith(prefix) && !f.path.slice(prefix.length).includes('/'));
  }

  async readCourseHomes(files) {
    const out = {};
    for (const code of this.courseCodes()) {
      const notes = [];
      for (const f of this.notesIn(files, code)) notes.push({ path: f.path, text: await this.readText(f.path) });
      const home = pickHome(code, notes);
      if (home) out[code] = { path: home, text: notes.find((n) => n.path === home).text };
    }
    return out;
  }

  async readPlans(files) {
    const out = [];
    for (const code of this.courseCodes()) {
      for (const f of this.notesIn(files, code)) if (isPlanNote(f.path.split('/').pop())) out.push({ code, path: f.path, text: await this.readText(f.path) });
    }
    return out;
  }

  // Notes linked under this week's lectures, so the flashcards can put their cards first.
  weekNotes() { return this._weekNotes || []; }

  async getModel(force) {
    if (!force && this._model && Date.now() - this._modelAt < 1500) return this._model;
    const files = this.app.vault.getMarkdownFiles().filter((f) => !f.path.startsWith(this.app.vault.configDir))
      .map((f) => ({ path: f.path, ctime: f.stat.ctime, mtime: f.stat.mtime }));
    if (!this.ready) await this.buildCache();
    const model = buildModel({
      files, cache: this.cache, tracked: this.data.days, settings: this.effective(), now: new Date(), pomo: this.data.pomo, backup: this.data.backup,
      reading: this.data.reading, recordings: this.recordingList(files),
      resolve: (lt, src) => { const f = this.app.metadataCache.getFirstLinkpathDest(lt, src); return f ? f.path : null; },
      recall: (this.peer('cards') || {}).data ? this.peer('cards').data.log : {},
      texts: { schedule: await this.readText(this.settings.scheduleFile),
        courseHomes: await this.readCourseHomes(files), plans: await this.readPlans(files) },
    });
    this._weekNotes = model.courses.flatMap((c) => c.items.filter((x) => x.inWeek).flatMap((x) => x.links)).map((l) => l.split('/').pop());
    const recall = this.peer('cards'), tempo = this.peer('tasks');
    model.routine = { cards: recall && recall.summary ? await recall.summary() : null, tasks: tempo && tempo.todayCount ? await tempo.todayCount() : 0 };
    this._model = withGame(model);
    this._modelAt = Date.now();
    // The task panel shows this week's milestones from here; redraw it only when they change,
    // so a redraw never wipes what the user is typing there.
    const sig = JSON.stringify((model.week ? model.week.milestones : []).map((m) => [m.text, m.done, m.left]));
    if (sig !== this._milestoneSig) { this._milestoneSig = sig; if (tempo && tempo.refresh) tempo.refresh(); }
    return this._model;
  }

  async renderBlock(block) {
    const model = await this.getModel();
    const render = SECTIONS[block.section] || SECTIONS.dashboard;
    if (!block.view) {
      block.view = { range: 30, metric: 'score', selectedDay: model.today, compact: true, actions: this.actions,
        set: (p) => { Object.assign(block.view, p); this.renderBlock(block); },
        selectDay: (k) => { block.view.selectedDay = k; this.renderBlock(block); },
        refresh: () => this.renderBlock(block) };
    }
    block.el.textContent = '';
    block.el.classList.add('sp-root', 'sp-embed');
    render(block.el, model, block.view);
  }

  scheduleRefresh() {
    clearTimeout(this._refreshT);
    this._refreshT = setTimeout(async () => {
      this._model = null;
      try { this.checkGameEvents(await this.getModel(true)); } catch (e) { console.warn('[term-compass] game events', e); }
      for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) if (leaf.view instanceof PulseView) await leaf.view.refresh();
      for (const b of [...this.blocks]) {
        if (!b.el.isConnected) { this.blocks.delete(b); continue; }
        await this.renderBlock(b);
      }
    }, 2500);
  }

  /**
   * Compare the fresh game state with what the player has already seen and
   * celebrate anything new. The first run only records the baseline (no spam).
   */
  checkGameEvents(model) {
    const g = model.game;
    const seen = this.data.game;
    const tierKeys = g.achievements.flatMap((a) => [1, 2, 3].filter((n) => n <= a.tier).map((n) => `${a.id}:${n}`));
    const questsDone = g.quests.filter((q) => q.done).map((q) => q.key);
    const monthKey = `${g.monthly.y}-${pad(g.monthly.m + 1)}`;
    const monthDone = g.monthly.list.filter((c) => c.done).map((c) => `${monthKey}:${c.id}`);
    // v2 = tiered achievements; an older or missing record is re-baselined silently.
    if (!seen || seen.v !== 2) {
      this.data.game = { v: 2, level: g.level, unlocked: tierKeys, unlockedAt: {}, quests: { [model.today]: questsDone },
        chest: g.chest ? model.today : '', months: monthDone, shieldsUsed: g.shielded.length };
      this.persistSoon();
      return;
    }
    const sound = this.settings.sound;
    if (g.level > seen.level) {
      if (sound) fanfare();
      const items = UNLOCKS.filter((u) => u.lv > seen.level && u.lv <= g.level);
      new LevelUpModal(this.app, g.level, g.title, g.next - g.xp, titleOf(seen.level) !== g.title, items).open();
    }
    for (const a of g.achievements) for (let n = 1; n <= a.tier; n++) {
      const key = `${a.id}:${n}`;
      if (seen.unlocked.includes(key)) continue;
      seen.unlockedAt[key] = model.today;
      gameToast(['', '🥉', '🥈', '🥇'][n], `成就 · ${a.name}（${TIER_NAMES[n]}）`, a.desc.replace('{n}', fmtInt(a.tiers[n - 1])), 'gold');
      if (sound && g.level === seen.level) fanfare([659.3, 784, 1046.5]);
    }
    const before = (seen.quests || {})[model.today] || [];
    for (const q of g.quests) if (q.done && !before.includes(q.key)) gameToast('✔', `每日任务完成：${q.label}`, `+${QUEST_XP} XP`, 'green');
    if (g.chest && seen.chest !== model.today) { gameToast('🎁', '宝箱打开了！', `四项全清 +${CHEST_XP} XP · 护盾 +1`, 'gold'); if (sound) fanfare([784, 988, 1174.7, 1568]); }
    for (const c of g.monthly.list) {
      if (c.done && !(seen.months || []).includes(`${monthKey}:${c.id}`)) gameToast(c.icon, `${g.monthly.m + 1} 月挑战完成：${c.name}`, c.desc.replace('{n}', fmtInt(c.goal)), 'gold');
    }
    if (seen.shieldsUsed != null && g.shielded.length > seen.shieldsUsed) {
      const day = g.shielded[g.shielded.length - 1];
      gameToast('🛡', '护盾抵挡了一次断签', `${day.slice(5)} 没学习，连胜保住了，还剩 ${g.shields} 块`, 'gold');
    }
    this.data.game = { v: 2, level: Math.max(seen.level, g.level), unlocked: [...new Set(seen.unlocked.concat(tierKeys))], unlockedAt: seen.unlockedAt,
      quests: { [model.today]: [...new Set(before.concat(questsDone))] }, chest: g.chest ? model.today : seen.chest,
      months: [...new Set((seen.months || []).filter((k) => k.startsWith(monthKey)).concat(monthDone))], shieldsUsed: g.shielded.length };
    this.persistSoon();
  }

  async activate() {
    const ws = this.app.workspace;
    let leaf = ws.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) { leaf = ws.getLeaf('tab'); await leaf.setViewState({ type: VIEW_TYPE, active: true }); }
    ws.revealLeaf(leaf);
    ws.setActiveLeaf(leaf, { focus: true });
  }

  /**
   * Flip a lecture between done / not done by editing its heading (or 状态 cell)
   * in the course homepage. Unticking a lecture that would auto-complete writes
   * 「未完成」 so the automatic rule does not tick it again.
   */
  async toggleLecture(code, it) {
    const course = (this._model || await this.getModel(true)).courses.find((c) => c.code === code);
    const f = course && course.homePath && this.app.vault.getAbstractFileByPath(course.homePath);
    if (!(f instanceof obsidian.TFile)) return;
    const want = !it.done;
    const mark = want ? '完成' : it.autoDone ? '未完成' : '';
    let ok = false;
    await this.app.vault.process(f, (text) => {
      const lines = text.split('\n');
      if (lines[it.line] !== it.raw) return text;
      if (it.kind === 'head') {
        const base = lines[it.line].replace(/(\s*(✅|▶️|▶|未完成|没开始|已完成|完成|进行中|已上|本周[一二三四五六日]?))+\s*$/, '');
        lines[it.line] = mark ? `${base} ${mark}` : base;
      } else {
        const cells = splitRow(lines[it.line]);
        cells[it.col] = mark ? ` ${mark} ` : ' ';
        lines[it.line] = cells.join('|');
      }
      ok = true;
      return lines.join('\n');
    });
    if (!ok) { new obsidian.Notice('课程主页刚被改过，请刷新后再点'); return; }
    this._model = null;
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) if (leaf.view instanceof PulseView) leaf.view.refresh(true);
  }

  // Tick a reading checkbox that lives in a course homepage (used by the 本周清单 card).
  async toggleCourseTask(code, tk) {
    const course = (this._model || await this.getModel(true)).courses.find((c) => c.code === code);
    const f = course && course.homePath && this.app.vault.getAbstractFileByPath(course.homePath);
    if (!(f instanceof obsidian.TFile)) return;
    let ok = false;
    await this.app.vault.process(f, (text) => {
      const lines = text.split('\n');
      if (lines[tk.line] !== tk.raw) return text;
      lines[tk.line] = tk.done ? tk.raw.replace(/\[[xX]\]/, '[ ]') : tk.raw.replace('[ ]', '[x]');
      ok = true;
      return lines.join('\n');
    });
    if (!ok) { new obsidian.Notice('课程主页刚被改过，请刷新后再勾'); return; }
    this._model = null;
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) if (leaf.view instanceof PulseView) leaf.view.refresh(true);
  }

  // Tick a milestone in the plan note it came from.
  async toggleNoteTask(m) {
    const f = this.app.vault.getAbstractFileByPath(m.path);
    if (!(f instanceof obsidian.TFile)) return;
    let ok = false;
    await this.app.vault.process(f, (text) => {
      const lines = text.split('\n');
      if (lines[m.line] !== m.raw) return text;
      lines[m.line] = m.done ? m.raw.replace(/\[[xX]\]/, '[ ]') : m.raw.replace('[ ]', '[x]');
      ok = true;
      return lines.join('\n');
    });
    if (!ok) { new obsidian.Notice('这篇笔记刚被改过，请刷新后再勾'); return; }
    this._model = null;
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) if (leaf.view instanceof PulseView) leaf.view.refresh(true);
  }

  async toggleTask(task) {
    const f = this.app.vault.getAbstractFileByPath(this.settings.scheduleFile);
    if (!(f instanceof obsidian.TFile)) return;
    let ok = false;
    await this.app.vault.process(f, (text) => {
      const lines = text.split('\n');
      if (lines[task.line] !== task.raw) return text;
      lines[task.line] = task.done ? task.raw.replace(/\[[xX]\]/, '[ ]') : task.raw.replace('[ ]', '[x]');
      ok = true;
      return lines.join('\n');
    });
    if (!ok) new obsidian.Notice('清单刚被改过，请刷新后再勾选');
  }

  pomoStart() {
    if (this.settings.systemNotify && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    this.data.pomo = { mode: 'focus', endsAt: Date.now() + this.settings.focusMinutes * 60000, startedAt: Date.now() };
    this.pomoChanged();
  }

  pomoStop() {
    this.data.pomo = { mode: 'idle' };
    this.pomoChanged();
  }

  pomoToggle() {
    const p = this.data.pomo || { mode: 'idle' };
    if (p.mode === 'idle') return this.pomoStart();
    if (p.paused) { p.endsAt = Date.now() + p.left; p.paused = false; delete p.left; }
    else { p.left = Math.max(0, p.endsAt - Date.now()); p.paused = true; }
    this.pomoChanged();
  }

  pomoChanged() {
    this.persist(); this.scheduleRefresh(); this.tickPomo();
    this.armPomoTimer();
  }

  // A one-shot timeout aimed exactly at the end, on top of the 1 s tick, so the alert
  // still fires on time when Chromium throttles intervals in a background window.
  armPomoTimer() {
    clearTimeout(this._pomoT);
    const p = this.data.pomo;
    if (p && p.mode !== 'idle' && !p.paused) this._pomoT = setTimeout(() => this.tickPomo(), Math.max(0, p.endsAt - Date.now()) + 50);
  }

  pomoAlert(title, body) {
    new obsidian.Notice(`${title}\n${body}`, 10000);
    if (this.settings.sound) chime();
    if (this.settings.systemNotify) systemNotify(title, body);
  }

  tickPomo() {
    const p = this.data.pomo || { mode: 'idle' };
    if (p.mode !== 'idle' && !p.paused && Date.now() >= p.endsAt) {
      if (p.mode === 'focus') {
        const d = this.today();
        const st = new Date(p.startedAt);
        d.focus += this.settings.focusMinutes; d.poms++;
        d.sessions.push({ time: `${pad(st.getHours())}:${pad(st.getMinutes())}`, min: this.settings.focusMinutes });
        this.pomoAlert('🍅 完成一个番茄', `今天第 ${d.poms} 个。休息 ${this.settings.breakMinutes} 分钟，离开屏幕走一走。`);
        this.data.pomo = { mode: 'break', endsAt: Date.now() + this.settings.breakMinutes * 60000 };
      } else {
        this.pomoAlert('☕ 休息结束', '准备好了就开始下一个番茄。');
        this.data.pomo = { mode: 'idle' };
      }
      this.persist(); this.scheduleRefresh(); this.armPomoTimer();
    }
    const cur = this.data.pomo;
    const left = pomoLeft(cur, Date.now());
    const txt = fmtClock(left);
    const icon = cur.paused ? '⏸' : cur.mode === 'focus' ? '🍅' : '☕';
    this.statusEl.setText(cur.mode === 'idle' ? '🍅 开始专注' : `${icon} ${txt}`);
    this.statusEl.setAttr('aria-label', cur.mode === 'idle' ? '点击开始一个番茄' : '点击暂停 / 继续');
    if (cur.mode !== 'idle') document.querySelectorAll('[data-sp-pomo]').forEach((e) => { e.textContent = txt; });
    this.updateFloat(cur, left, txt);
  }

  buildFloat() {
    const el = h('div', 'sp-float', document.body);
    this.register(() => el.remove());
    const r = 15, c = 2 * Math.PI * r;
    const svg = s('svg', { viewBox: '0 0 36 36', class: 'sp-float-ring' }, el);
    s('circle', { cx: 18, cy: 18, r, class: 'sp-float-track' }, svg);
    const arc = s('circle', { cx: 18, cy: 18, r, class: 'sp-float-arc', 'stroke-dasharray': `${c} ${c}`, transform: 'rotate(-90 18 18)' }, svg);
    const icon = s('text', { x: 18, y: 22.5, 'text-anchor': 'middle', class: 'sp-float-icon' }, svg);
    const txt = h('div', 'sp-float-text', el);
    const label = h('div', 'sp-float-label', txt);
    const time = h('div', 'sp-float-time', txt);
    const pause = h('button', 'sp-float-btn', el, '⏸');
    const stop = h('button', 'sp-float-btn', el, '✕');
    pause.title = '暂停 / 继续'; stop.title = '结束这个番茄';
    pause.onclick = (e) => { e.stopPropagation(); this.pomoToggle(); };
    stop.onclick = (e) => { e.stopPropagation(); this.pomoStop(); };
    txt.onclick = () => this.activate();
    if (this.data.floatPos) { el.style.left = `${this.data.floatPos.x}px`; el.style.top = `${this.data.floatPos.y}px`; el.style.right = 'auto'; }

    // Drag anywhere on the pill except the buttons; the position is remembered.
    let drag = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const b = el.getBoundingClientRect();
      drag = { dx: e.clientX - b.left, dy: e.clientY - b.top, moved: false };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const x = Math.min(window.innerWidth - el.offsetWidth, Math.max(0, e.clientX - drag.dx));
      const y = Math.min(window.innerHeight - el.offsetHeight, Math.max(0, e.clientY - drag.dy));
      if (Math.abs(x - el.offsetLeft) + Math.abs(y - el.offsetTop) > 2) drag.moved = true;
      el.style.left = `${x}px`; el.style.top = `${y}px`; el.style.right = 'auto';
    });
    el.addEventListener('pointerup', () => {
      if (drag && drag.moved) { this.data.floatPos = { x: el.offsetLeft, y: el.offsetTop }; this.persistSoon(); }
      drag = null;
    });
    this.float = { el, arc, icon, label, time, pause, c };
  }

  updateFloat(cur, left, txt) {
    const f = this.float;
    if (!f) return;
    const show = this.settings.showFloat && cur.mode !== 'idle';
    f.el.classList.toggle('is-visible', show);
    if (!show) return;
    const total = (cur.mode === 'focus' ? this.settings.focusMinutes : this.settings.breakMinutes) * 60000;
    f.el.classList.toggle('is-break', cur.mode === 'break');
    f.el.classList.toggle('is-paused', !!cur.paused);
    f.arc.setAttribute('stroke-dasharray', `${f.c * Math.min(1, left / total)} ${f.c}`);
    f.icon.textContent = cur.mode === 'focus' ? '🍅' : '☕';
    f.label.textContent = cur.paused ? '已暂停' : cur.mode === 'focus' ? '专注中' : '休息中';
    f.time.textContent = txt;
    f.pause.textContent = cur.paused ? '▶' : '⏸';
  }
}
