/* ───────────────────────────── renderers ───────────────────────────── */

const WHEN = { 今天: '今天', 本周: '本周', 以后: '以后', 已完成: '已完成' };

function taskRow(box, t, view, today) {
  const row = h('div', 'tp-task' + (t.done ? ' is-done' : ''), box);
  const cb = h('input', '', row); cb.type = 'checkbox'; cb.checked = t.done;
  cb.onchange = () => view.actions.toggle(t);
  const main = h('div', 'tp-task-main', row);
  h('div', 'tp-task-title', main, t.title || '(空)');
  const meta = h('div', 'tp-task-meta', main);
  for (const tag of t.tags) { const p = h('span', 'tp-pill', meta, tag); p.style.setProperty('--c', colorOf(tag)); }
  if (t.due && !t.done) h('span', 'tp-due' + (t.due < today ? ' is-hot' : t.due === today ? ' is-warm' : ''), meta, t.due === today ? '今天到期' : t.due < today ? `逾期 ${t.due.slice(5)}` : `📅 ${t.due.slice(5)}`);
  if (t.doneOn) h('span', 'tp-muted', meta, `完成于 ${t.doneOn.slice(5)}`);
  // Actions sit under the title so a narrow side bar never squeezes it.
  const quick = h('div', 'tp-quick', main);
  if (!t.done) {
    if (t.list !== '今天') h('button', 'tp-qbtn', quick, '今天').onclick = () => view.actions.schedule(t, 'today');
    h('button', 'tp-qbtn', quick, '明天').onclick = () => view.actions.schedule(t, 'tomorrow');
  }
  const sel = h('select', 'tp-move', quick);
  h('option', '', sel, '移到…').value = '';
  for (const name of OPEN_LISTS) if (name !== t.list) h('option', '', sel, name).value = name;
  if (t.due && !t.done) h('option', '', sel, '去掉日期').value = '__nodate';
  h('option', '', sel, '删除').value = '__delete';
  sel.onchange = () => { if (sel.value) view.actions.move(t, sel.value); };
}

// Exam milestones from the dashboard, ticked where they were written.
function milestoneRows(box, list, view) {
  if (!list.length) return;
  h('div', 'tp-label', box, '考核节点');
  for (const m of list) {
    const row = h('div', 'tp-task tp-ms', box);
    const cb = h('input', '', row); cb.type = 'checkbox';
    cb.onchange = () => view.actions.tickMilestone(m);
    const main = h('div', 'tp-task-main', row);
    h('div', 'tp-task-title', main, m.text);
    const meta = h('div', 'tp-task-meta', main);
    const p = h('span', 'tp-pill', meta, courseTag(m.code)); p.style.setProperty('--c', colorOf(courseTag(m.code)));
    h('span', 'tp-due' + (m.status === 'overdue' ? ' is-hot' : ''), meta, m.status === 'overdue' ? `逾期 ${-m.left} 天` : `${m.end.getMonth() + 1}-${pad(m.end.getDate())} 前`);
  }
}

function memoBox(root, state, view) {
  h('div', 'tp-label tp-mt', root, '随手记');
  const ta = h('textarea', 'tp-memo-input', root);
  ta.placeholder = '想到什么先记下来，回头再转成任务（⌘/Ctrl + 回车）';
  ta.value = view.draft || '';
  ta.oninput = () => { view.draft = ta.value; };
  const submit = () => { const v = ta.value.trim(); if (!v) return; ta.value = ''; view.draft = ''; view.actions.memo(v); };
  ta.onkeydown = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } };
  const bar = h('div', 'tp-memo-bar', root);
  h('a', 'tp-link', bar, '全部随手记 →').onclick = () => view.actions.openFile('memo');
  h('button', 'tp-btn is-primary', bar, '记下').onclick = submit;
  if (view.focusMemo) { setTimeout(() => ta.focus(), 30); view.focusMemo = false; }
  const today = dkey(new Date()), yest = dkey(addDays(new Date(), -1));
  const open = state.memos.filter((m) => !m.converted).slice(0, 6);
  const list = h('div', 'tp-memos', root);
  for (const m of open) {
    const card = h('div', 'tp-memo', list);
    const top = h('div', 'tp-memo-top', card);
    h('span', 'tp-muted', top, `${m.day === today ? '今天' : m.day === yest ? '昨天' : m.day.slice(5)} ${m.time}`);
    const acts = h('span', 'tp-memo-acts', top);
    [['today', '→ 今天'], ['week', '→ 本周']].forEach(([to, label]) => { h('a', 'tp-link', acts, label).onclick = () => view.actions.memoToTask(m, to); });
    h('div', 'tp-memo-text', card, m.text);
  }
  if (state.memos.some((m) => m.day < today)) h('button', 'tp-btn', root, '把今天以前的随手记挪进存档').onclick = () => view.actions.archiveMemos();
}

function renderTasks(root, state, view) {
  const { lists } = state;
  const now = new Date(), today = dkey(now);
  const weekEnd = dkey(addDays(now, (7 - now.getDay()) % 7));
  const views = viewsOf(lists, today, weekEnd);
  const head = h('div', 'tp-head', root);
  h('div', 'tp-title', head, '任务');
  const overdue = views['今天'].filter((t) => t.due && t.due < today).length;
  h('div', 'tp-muted', head, `今天 ${views['今天'].length} · 本周 ${views['本周'].length}${overdue ? ` · 逾期 ${overdue}` : ''} · 今日完成 ${lists[DONE].filter((t) => t.doneOn === today).length}`);

  const tabs = h('div', 'tp-chips', root);
  for (const name of LISTS) {
    const b = h('button', 'tp-chip' + (view.list === name ? ' is-active' : ''), tabs, WHEN[name]);
    const n = name === DONE ? 0 : views[name].length;
    if (n) h('span', 'tp-count', b, String(n));
    b.onclick = () => view.set({ list: name });
  }

  // Courses from the dashboard plus any other tags in use; picking one filters and tags new tasks.
  const tags = [...new Set(state.courses.map(courseTag).concat(OPEN_LISTS.flatMap((n) => lists[n]).flatMap((t) => t.tags)))];
  if (tags.length) {
    const row = h('div', 'tp-projects', root);
    for (const tag of tags) {
      const b = h('button', 'tp-project' + (view.project === tag ? ' is-active' : ''), row);
      b.style.setProperty('--c', colorOf(tag));
      h('i', 'tp-dot', b);
      b.appendChild(document.createTextNode(tag));
      b.onclick = () => view.set({ project: view.project === tag ? null : tag });
    }
  }

  if (view.list !== DONE) {
    const add = h('input', 'tp-add', root);
    add.type = 'text';
    add.placeholder = `添加到「${view.list}」…可以写日期（明天 / 11-20）${view.project ? `，会打上 #${view.project}` : ''}`;
    add.onkeydown = (e) => { if (e.key === 'Enter' && !e.isComposing && add.value.trim()) { view.actions.add(withTag(add.value.trim(), view.project), view.list); add.value = ''; } };
    if (view.focusAdd) { setTimeout(() => add.focus(), 30); view.focusAdd = false; }
  }

  const box = h('div', 'tp-list', root);
  if (view.list === '本周') milestoneRows(box, state.milestones, view);
  if (view.list === '今天') milestoneRows(box, state.milestones.filter((m) => m.left <= 0), view);
  let items = view.list === DONE ? lists[DONE].slice(0, 60) : views[view.list];
  if (view.project) items = items.filter((t) => t.tags.includes(view.project));
  if (!items.length && !box.children.length) h('div', 'tp-empty', box, { 今天: '今天没有待办，可以从「本周」挑一件', 本周: '这周还没有任务', 以后: '以后的事先放这里', 已完成: '还没有完成的任务' }[view.list]);
  for (const t of items) taskRow(box, t, view, today);
  if (view.list === DONE && lists[DONE].length) h('button', 'tp-btn', root, '把 14 天前完成的挪进存档').onclick = () => view.actions.archiveDone();
  if (view.list !== DONE) memoBox(root, state, view);
  h('a', 'tp-link', root, '打开任务文件 →').onclick = () => view.actions.openFile('task');
}

// 录音 tab: drives the Voice module without leaving the note you are writing.
function renderVoice(root, state, view) {
  const voice = state.voice;
  const head = h('div', 'tp-head', root);
  h('div', 'tp-title', head, '录音');
  if (!voice) { h('div', 'tp-empty', root, '录音只能在电脑版 Obsidian 上使用'); return; }
  const vs = voice.getState();
  if (!vs.recording) {
    h('div', 'tp-muted', root, '录完存到：');
    const row = h('div', 'tp-projects', root);
    [[undefined, '录完再选'], ...vs.courses.map((o) => [o.value, o.value === null ? 'Inbox' : o.label])].forEach(([val, label]) => {
      const b = h('button', 'tp-project' + (vs.preset === val ? ' is-active' : ''), row, label);
      b.style.setProperty('--c', '#5b6bd5');
      b.onclick = () => { voice.setPreset(val); view.render(); };
    });
  }
  const big = h('button', 'tp-rec-btn' + (vs.recording ? ' is-on' : ''), root);
  h('span', 'tp-rec-dot', big);
  h('span', '', big, vs.recording ? '停止并保存' : '开始录音');
  big.onclick = async () => { await voice.toggle(); view.render(); };
  if (vs.recording) {
    const live = h('div', 'tp-rec-live', root);
    h('span', 'tp-rec-time', live, clockFmt(vs.seconds));
    const bars = h('span', 'tp-rec-bars', live); for (let i = 0; i < 7; i++) h('i', '', bars);
    h('span', 'tp-rec-marks', live, vs.marks ? `⭐ ${vs.marks}` : '');
    const acts = h('div', 'tp-rec-acts', root);
    h('button', 'tp-btn', acts, '⭐ 标记重点').onclick = () => { voice.mark(); view.render(); };
    h('button', 'tp-btn', acts, '✕ 取消（不保存）').onclick = () => { voice.cancel(); view.render(); };
    h('div', 'tp-muted', root, vs.preset === undefined ? '停止后选择课程' : `停止后存到：${vs.preset === null ? 'Inbox' : vs.preset}`);
  }
  if (vs.job) {
    const jb = h('div', 'tp-rec-job', root);
    h('div', '', jb, `转写中 ${vs.job.progress}%${vs.job.course ? ' · ' + vs.job.course : ''}`);
    const bar = h('div', 'tp-rec-jobbar', jb); h('i', '', bar).style.width = `${vs.job.progress}%`;
  }
  h('div', 'tp-muted tp-rec-tip', root, '小技巧：在 设置 → 快捷键 搜「录音」，给「开始 / 停止录音」和「标记重点」绑键，打字时不用碰鼠标。');
  h('div', 'tp-label', root, '最近的录音');
  const list = h('div', 'tp-list', root);
  if (!state.recordings.length) h('div', 'tp-empty', list, '还没有录音');
  for (const r of state.recordings) {
    const row = h('div', 'tp-task tp-rec-row', list);
    const main = h('div', 'tp-task-main', row);
    h('div', 'tp-task-title', main, r.title);
    const meta = h('div', 'tp-task-meta', main);
    if (r.course) { const p = h('span', 'tp-pill', meta, r.course); p.style.setProperty('--c', colorOf(r.course)); }
    if (r.duration) h('span', 'tp-muted', meta, r.duration);
    h('span', 'tp-rec-status is-' + ({ 已转写: 'ok', 转写中: 'run', 转写失败: 'bad' }[r.status] || 'run'), meta, r.status || '转写中');
    row.onclick = () => view.app.workspace.openLinkText(r.path, '', false);
    // Two clicks to delete, so a stray click can't remove a recording.
    const del = h('button', 'tp-rec-del', row, '删除');
    del.title = '把这条录音的笔记和音频移到废纸篓';
    del.onclick = (e) => {
      e.stopPropagation();
      if (del.classList.contains('is-armed')) { view.actions.deleteRecording(r); return; }
      del.classList.add('is-armed'); del.textContent = '确定？';
      setTimeout(() => { del.classList.remove('is-armed'); del.textContent = '删除'; }, 3000);
    };
  }
}

const clockFmt = (sec) => { sec = Math.max(0, Math.round(sec)); const hh = Math.floor(sec / 3600); return `${hh ? hh + ':' : ''}${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`; };

/* ───────────────────────────── plugin ───────────────────────────── */

