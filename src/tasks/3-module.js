class TasksView extends obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.tab = 'tasks'; this.list = '今天'; this.project = null; this.draft = '';
    this.actions = plugin.actions;
  }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return this.tab === 'voice' ? '录音' : '任务'; }
  getIcon() { return this.tab === 'voice' ? 'mic' : 'list-checks'; }
  getState() { return { tab: this.tab, list: this.list }; }
  async setState(state, result) {
    if (state && state.tab) this.tab = state.tab === 'memo' ? 'tasks' : state.tab;
    if (state && state.list) this.list = state.list;
    await this.render();
    return super.setState(state, result);
  }
  async onOpen() {
    // Re-render when recording state changes; tick the timer and level meter in between.
    this.registerEvent(this.app.workspace.on('term-compass:voice-change', () => {
      if (this.tab !== 'voice') return;
      const v = this.plugin.voice(), s = v && v.getState();
      const sig = s ? `${s.recording}|${s.marks}|${s.job ? Math.floor(s.job.progress / 5) : '-'}|${String(s.preset)}` : 'none';
      if (sig !== this._sig) { this._sig = sig; this.render(); }
    }));
    this.registerInterval(window.setInterval(() => this.liveTick(), 250));
    await this.render();
  }
  liveTick() {
    if (this.tab !== 'voice') return;
    const v = this.plugin.voice();
    if (!v || !v.rec) return;
    const s = v.getState();
    const t = this.contentEl.querySelector('.tp-rec-time');
    if (t) t.textContent = clockFmt(s.seconds);
    this.contentEl.querySelectorAll('.tp-rec-bars i').forEach((b, i) => { b.style.height = `${3 + Math.max(0, s.level * 18 - Math.abs(i - 3) * 3)}px`; });
  }
  set(patch) { Object.assign(this, patch); this.render(); }
  async render() {
    const root = this.contentEl;
    const draft = root.querySelector('.tp-memo-input');
    if (draft) this.draft = draft.value;
    const state = await this.plugin.readState();
    root.textContent = '';
    root.classList.add('tp-root');
    const sw = h('div', 'tp-switch', root);
    [['tasks', '任务'], ['voice', '录音']].forEach(([k, l]) => {
      const b = h('button', 'tp-chip' + (this.tab === k ? ' is-active' : ''), sw, l);
      b.onclick = () => this.set({ tab: k });
    });
    (this.tab === 'voice' ? renderVoice : renderTasks)(root, state, this);
  }
}

class TasksSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new obsidian.Setting(containerEl).setName('任务与随手记').setHeading();
    for (const [key, name, desc] of [['taskFile', '任务文件', '三个清单：今天、本周、以后，外加已完成'], ['memoFile', '随手记文件', '按日期分节，最新在上'], ['archiveFile', '存档文件', '归档的随手记和已完成任务挪到这里']]) {
      new obsidian.Setting(containerEl).setName(name).setDesc(desc).addText((t) => t.setValue(this.plugin.settings[key]).onChange(async (v) => {
        this.plugin.settings[key] = v.trim() || DEFAULT_SETTINGS[key];
        await this.plugin.saveData({ settings: this.plugin.settings });
        this.plugin.refresh();
      }));
    }
  }
}

class TasksModule extends SubModule {
  async onload() {
    const saved = (await this.loadData()) || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved.settings || {});
    this.actions = {
      add: (input, list) => this.addTask(input, list),
      toggle: (t) => this.toggleTask(t),
      move: (t, to) => this.moveTask(t, to),
      memo: (text) => this.addMemoEntry(text),
      schedule: (t, when) => this.scheduleTask(t, when),
      memoToTask: (m, to) => this.memoToTask(m, to),
      tickMilestone: async (m) => { const p = this.peer('pulse'); if (p) { await p.toggleNoteTask(m); this.refresh(); } },
      archiveMemos: () => this.archiveMemos(),
      archiveDone: () => this.archiveDone(),
      deleteRecording: (r) => this.deleteRecording(r),
      openFile: async (which) => { await this.ensureFile(which); this.app.workspace.openLinkText(this.settings[which === 'memo' ? 'memoFile' : 'taskFile'], '', false); },
    };
    this.registerView(VIEW_TYPE, (leaf) => new TasksView(leaf, this));
    this.addRibbonIcon('list-checks', '任务', () => this.open('tasks', false));
    this.addCommand({ id: 'open-tasks', name: '打开任务（右侧栏）', callback: () => this.open('tasks', false) });
    this.addCommand({ id: 'open-tasks-tab', name: '在新标签页打开任务', callback: () => this.open('tasks', true) });
    this.addCommand({ id: 'open-memo', name: '写一条随手记（右侧栏）', callback: () => this.open('tasks', false, true) });
    this.addCommand({ id: 'open-voice', name: '打开录音面板（右侧栏）', callback: () => this.open('voice', false) });
    this.addCommand({ id: 'quick-task', name: '快速添加今天的任务', callback: () => this.open('tasks', false, false, '今天') });
    this.addSettingTab(new TasksSettingTab(this.app, this));
    // The recordings list comes from frontmatter, so follow the metadata cache, not just file saves.
    this.registerEvent(this.app.metadataCache.on('changed', (f, _d, cache) => { if (((cache || {}).frontmatter || {}).type === '录音') this.refreshVoice(); }));
    this.registerEvent(this.app.vault.on('delete', () => this.refreshVoice()));
    this.registerEvent(this.app.vault.on('rename', () => this.refreshVoice()));
    this.registerEvent(this.app.vault.on('modify', (f) => {
      if (f.path === this.settings.taskFile || f.path === this.settings.memoFile) this.refresh();
    }));
  }

  async open(tab, inTab, focusMemo, list) {
    const ws = this.app.workspace;
    let leaf = ws.getLeavesOfType(VIEW_TYPE).find((l) => (inTab ? l.getRoot() === ws.rootSplit : l.getRoot() !== ws.rootSplit));
    if (!leaf) leaf = inTab ? ws.getLeaf('tab') : ws.getRightLeaf(false);
    await leaf.setViewState({ type: VIEW_TYPE, active: true, state: { tab, list: list || undefined } });
    ws.revealLeaf(leaf);
    const v = leaf.view;
    if (v instanceof TasksView) {
      if (focusMemo) v.focusMemo = true;
      if (list) v.focusAdd = true;
      v.render();
    }
  }

  refresh() {
    clearTimeout(this._t);
    this._t = setTimeout(() => {
      for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) if (leaf.view instanceof TasksView) leaf.view.render();
    }, 150);
  }

  async ensureFile(which) {
    const path = this.settings[which === 'memo' ? 'memoFile' : 'taskFile'];
    let f = this.app.vault.getAbstractFileByPath(path);
    if (f instanceof obsidian.TFile) return f;
    const dir = path.split('/').slice(0, -1).join('/');
    if (dir && !this.app.vault.getAbstractFileByPath(dir)) await this.app.vault.createFolder(dir);
    const init = which === 'memo' ? '# 随手记\n' : serializeTaskDoc(parseTaskDoc('> 三个清单：今天、本周、以后。任务格式：`- [ ] 内容 #课程 📅 2026-10-28`，带日期的任务到时候会自动出现在今天或本周。可以直接在这里改，也可以用侧栏的任务面板。\n'));
    return this.app.vault.create(path, init);
  }

  voice() { return this.peer('voice') || null; }

  // Note + its audio go to the system Trash. Audio outside the recordings folder (a file
  // the user transcribed from the right-click menu) is theirs, so it stays.
  async deleteRecording(r) {
    const { vault } = this.app;
    const note = vault.getAbstractFileByPath(r.path);
    const v = this.voice();
    const folder = ((v && v.settings.audioFolder) || '学期罗盘/录音音频') + '/';
    const audio = r.audio && r.audio.startsWith(folder) ? vault.getAbstractFileByPath(r.audio) : null;
    // fileManager follows the user's own setting for where deleted files go.
    if (audio instanceof obsidian.TFile) await this.app.fileManager.trashFile(audio);
    if (note instanceof obsidian.TFile) await this.app.fileManager.trashFile(note);
    new obsidian.Notice(`已移到废纸篓：${r.title}`);
    this.refreshVoice();
  }

  refreshVoice() {
    clearTimeout(this._vt);
    this._vt = setTimeout(() => {
      for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) if (leaf.view instanceof TasksView && leaf.view.tab === 'voice') leaf.view.render();
    }, 200);
  }

  // Notes written by the Voice module carry `type: 录音` in their frontmatter.
  listRecordings() {
    const out = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter;
      if (!fm || fm.type !== '录音') continue;
      out.push({ path: f.path, ctime: f.stat.ctime, title: f.basename, course: fm.course && fm.course !== '其他' ? fm.course : '', duration: fm.duration || '', status: fm.status || '',
        audio: String(fm.audio || '').replace(/^\[\[|\]\]$/g, '') });
    }
    return out.sort((a, b) => b.ctime - a.ctime).slice(0, 15);
  }

  async readState() {
    const read = async (path) => {
      const f = this.app.vault.getAbstractFileByPath(path);
      return f instanceof obsidian.TFile ? this.app.vault.cachedRead(f) : '';
    };
    const pulse = this.peer('pulse');
    // Background tabs are not loaded, so the dashboard may not have read the notes yet.
    const model = pulse ? pulse._model || (pulse.getModel ? await pulse.getModel() : null) : null;
    const week = model ? model.week : null;
    return { lists: readTasks(await read(this.settings.taskFile)), memos: parseMemos(await read(this.settings.memoFile)),
      voice: this.voice(), recordings: this.listRecordings(),
      courses: pulse && pulse.courseCodes ? pulse.courseCodes() : [], milestones: week ? week.milestones.filter((m) => !m.done) : [] };
  }

  // For the 现在做什么 card on the dashboard.
  async todayCount() {
    const f = this.app.vault.getAbstractFileByPath(this.settings.taskFile);
    const lists = readTasks(f instanceof obsidian.TFile ? await this.app.vault.cachedRead(f) : '');
    const now = new Date();
    return viewsOf(lists, dkey(now), dkey(addDays(now, (7 - now.getDay()) % 7)))['今天'].length;
  }

  async editTasks(fn) {
    const f = await this.ensureFile('task');
    let ok = true;
    await this.app.vault.process(f, (text) => {
      const doc = parseTaskDoc(text);
      ok = fn(doc) !== false;
      return ok ? serializeTaskDoc(doc) : text;
    });
    if (!ok) new obsidian.Notice('任务文件刚被改过，已刷新，请再试一次');
    this.refresh();
  }

  addTask(input, list) {
    const target = list === DONE ? '今天' : list;
    return this.editTasks((doc) => { insertTask(section(doc, target), parseNewTask(input, new Date()), false); });
  }

  toggleTask(t) {
    const today = dkey(new Date());
    return this.editTasks((doc) => {
      if (!removeTask(doc, t.list, t.raw)) return false;
      if (t.done) insertTask(section(doc, '今天'), t.raw.replace(/\[[xX]\]/, '[ ]').replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/, ''), false);
      else insertTask(section(doc, DONE), `${t.raw.replace('[ ]', '[x]')} ✅ ${today}`, true);
    });
  }

  moveTask(t, to) {
    return this.editTasks((doc) => {
      if (to === '__nodate') {
        const sec = section(doc, t.list), i = sec ? sec.lines.indexOf(t.raw) : -1;
        if (i < 0) return false;
        sec.lines[i] = stripDue(t.raw);
        return;
      }
      if (!removeTask(doc, t.list, t.raw)) return false;
      if (to === '__delete') return;
      let line = t.done ? t.raw.replace(/\[[xX]\]/, '[ ]').replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/, '') : t.raw;
      // Moved to 以后: drop the date, or it would pull the task straight back into 今天 or 本周.
      if (to === '以后') line = stripDue(line);
      insertTask(section(doc, to), line, false);
    });
  }

  // 今天 = move to 今天; 明天 = due tomorrow in 本周 (it shows up in 今天 by itself tomorrow).
  scheduleTask(t, when) {
    const tomorrow = dkey(addDays(new Date(), 1));
    return this.editTasks((doc) => {
      if (!removeTask(doc, t.list, t.raw)) return false;
      if (when === 'today') insertTask(section(doc, '今天'), t.raw, false);
      else {
        const line = t.raw.replace(/\s*📅\s*\d{4}-\d{2}-\d{2}/, '') + ` 📅 ${tomorrow}`;
        insertTask(section(doc, t.list === '今天' ? '本周' : t.list), line, false);
      }
    });
  }

  async memoToTask(m, to) {
    const now = new Date();
    const text = m.text.split('\n')[0];
    const list = to === 'today' ? '今天' : to === 'week' || to === 'tomorrow' ? '本周' : '以后';
    const line = `- [ ] ${text}${to === 'tomorrow' ? ` 📅 ${dkey(addDays(now, 1))}` : ''}`;
    await this.editTasks((doc) => { insertTask(section(doc, list), line, false); });
    const f = await this.ensureFile('memo');
    await this.app.vault.process(f, (old) => old.replace(m.raw[0], m.raw[0] + CONVERTED));
    this.refresh();
  }

  async writeArchive(title, body) {
    const path = this.settings.archiveFile;
    let f = this.app.vault.getAbstractFileByPath(path);
    if (!(f instanceof obsidian.TFile)) {
      const dir = path.split('/').slice(0, -1).join('/');
      if (dir && !this.app.vault.getAbstractFileByPath(dir)) await this.app.vault.createFolder(dir);
      f = await this.app.vault.create(path, appendArchive('', title, body));
      return;
    }
    await this.app.vault.process(f, (old) => appendArchive(old, title, body));
  }

  async archiveMemos() {
    const f = await this.ensureFile('memo');
    const { gone } = splitMemos(await this.app.vault.read(f), dkey(new Date()));
    if (!gone) return;
    // Write the archive first, then remove from the inbox, so nothing is lost if one step fails.
    await this.writeArchive(`随手记 · 归档于 ${dkey(new Date())}`, gone.replace(/^## /gm, '### '));
    await this.app.vault.process(f, (old) => splitMemos(old, dkey(new Date())).keep);
    new obsidian.Notice('已把今天以前的随手记挪进存档');
    this.refresh();
  }

  async archiveDone() {
    const cutoff = dkey(addDays(new Date(), -14));
    const f = await this.ensureFile('task');
    const old = readTasks(await this.app.vault.read(f))[DONE].filter((t) => t.doneOn && t.doneOn < cutoff);
    if (!old.length) { new obsidian.Notice('没有 14 天前完成的任务'); return; }
    await this.writeArchive(`已完成任务 · 归档于 ${dkey(new Date())}`, old.map((t) => t.raw).join('\n'));
    await this.editTasks((doc) => { old.forEach((t) => removeTask(doc, DONE, t.raw)); });
    new obsidian.Notice(`已存档 ${old.length} 个任务`);
  }

  async addMemoEntry(text) {
    const f = await this.ensureFile('memo');
    await this.app.vault.process(f, (old) => addMemo(old, text, new Date()));
    this.refresh();
  }
}

