/* ───────────────────────────── first run ─────────────────────────────
 * A sample course dated around today, so the dashboard is full the moment the
 * plugin is installed, and a check that says what was recognised in real notes.
 */

const SAMPLE = '示例课 DEMO101';

/** Notes for a sample course, as {path: text}. Dates are written relative to `now`. */
function sampleSemester(now, root) {
  const md = (d) => `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const mon = monday(now);
  const at = (days) => md(addDays(mon, days));
  const soon = (days) => md(addDays(day0(now), days));
  const lateMonth = addDays(day0(now), 60);
  const c = `${root}/${SAMPLE}`;
  return {
    [`${root}/学期总览.md`]: `# 学期总览

> 学期罗盘从这里的「关键日期」表读截止日期，显示在看板的倒计时和「现在做什么」里。

## 关键日期

| 日期 | 事项 | 课程 |
|---|---|---|
| ${soon(6)} | **第一篇小论文截止** | ${SAMPLE} |
| ${soon(30)} | 期中考试 | ${SAMPLE} |
| ${lateMonth.getFullYear()} 年 ${lateMonth.getMonth() + 1} 月中旬 | 期末考试（日期待定） | ${SAMPLE} |
`,
    [`${c}/课程主页.md`]: `# ${SAMPLE} 课程主页

> [!tip] 这是学期罗盘生成的示例课，看完可以整个文件夹删掉。
> 每讲一个标题：\`### 第 N 讲 · 主题 · 月-日\`（英文 \`### Lecture 3 · Topic · 10-14\` 也行）。
> 标题下面链接这讲的笔记或课件 PDF：日期过了算「已上」，链接的笔记看满 10 分钟算「读过」。

### 第 1 讲 · 课程导论 Introduction · ${at(-14)}
- [[第 1 讲 笔记]]

### 第 2 讲 · 供给与需求 Supply & demand · ${at(-7)}
- [[第 2 讲 笔记]]
- [ ] 读教材第 2 章

### 第 3 讲 · 市场失灵 Market failure · ${at(2)}
- [ ] ⭐ 读教材第 3 章
- [ ] 读 Coase (1960)

### 第 4 讲 · 公共物品 Public goods · ${at(9)}
`,
    [`${c}/第 1 讲 笔记.md`]: `# 第 1 讲 笔记 · 课程导论

## 主线

经济学研究在资源稀缺的条件下怎么做选择。

## 术语表

| 术语 | 含义 |
|---|---|
| 机会成本（opportunity cost） | 为了得到某样东西而放弃的最好的其他选择 |
| 边际分析（marginal analysis） | 比较多做一点带来的额外收益和额外成本 |

## 自测题

- 为什么说「免费午餐」也有成本？
`,
    [`${c}/第 2 讲 笔记.md`]: `# 第 2 讲 笔记 · 供给与需求

## 术语表

| 术语 | 含义 |
|---|---|
| 需求定律（law of demand） | 其他条件不变时，价格越高需求量越少 |
| 均衡价格（equilibrium price） | 供给量等于需求量时的价格 |
| 价格弹性（price elasticity） | 需求量对价格变化有多敏感 |

## 自测题

- 画图说明：供给减少时，均衡价格和数量怎么变？
`,
    [`${c}/作业与考试.md`]: `# 作业与考试

> 「时间表」下带日期的勾选项会出现在看板的「现在做什么」和本周清单里。

## 时间表
- [ ] **${at(-7)} → ${at(4)}**：读完参考文献，写一页提纲
- [ ] **${at(5)} → ${at(18)}**：写初稿
- [ ] **${soon(6)}**：提交小论文
`,
  };
}

/**
 * What the dashboard recognised, course by course. Each row: ok true (found),
 * false (missing, with a fix), or null (optional, with a hint).
 */
function recognitionReport(model, cardsByCourse) {
  const st = model.settings, t = termFor(model.now), out = [];
  out.push({ title: '学期', rows: [t.guessed
    ? { ok: false, text: `学期日期是估的（${mdd(t.start)} → ${mdd(t.end)}）`, fix: '在设置里填学期开始和结束日期，周数才准' }
    : { ok: true, text: `${dkey(t.start)} → ${dkey(t.end)}，现在是${termLabel(model.now)}` }] });
  if (!model.courses.length) out.push({ title: '课程', rows: [{ ok: false, text: `「${st.courseRoot}」里没有找到课程文件夹`, fix: '每门课建一个文件夹，或者在设置向导里生成一门示例课' }] });
  for (const c of model.courses) {
    const rows = [];
    if (!c.homePath) rows.push({ ok: false, text: '没找到课程主页', fix: '在这门课的文件夹里建一篇「课程主页」，每讲一个标题：### 第 1 讲 · 主题 · 10-14' });
    else {
      rows.push({ ok: true, text: `主页：${c.homePath.split('/').pop().replace(/\.md$/, '')}` });
      const n = c.items.length, dated = c.items.filter((i) => !i.estimated).length, linked = c.items.filter((i) => i.guides).length;
      if (!n) rows.push({ ok: false, text: '主页里没有认出讲次', fix: '标题写成「### 第 1 讲 · 主题 · 10-14」或「### Lecture 1 · Topic · 10-14」' });
      else {
        rows.push({ ok: true, text: `${n} 讲，${dated} 讲有日期，${linked} 讲链接了笔记` });
        if (dated < n) rows.push({ ok: false, text: `${n - dated} 讲没有日期，按开学后第 N 周估`, fix: '在标题末尾加日期，比如「· 10-14」' });
        if (!linked) rows.push({ ok: null, text: '讲次下面没有链接笔记，没法自动判断「读过」', fix: '在每讲标题下面加 [[这讲的笔记]] 或课件 PDF' });
      }
    }
    const cards = cardsByCourse[c.code] || 0;
    rows.push(cards ? { ok: true, text: `${cards} 张闪卡` } : { ok: null, text: '没有闪卡', fix: '笔记里加「## 术语表」表格或「## 自测题」清单，就会自动出卡' });
    const ms = (model.milestones || []).filter((m) => m.code === c.code).length;
    rows.push(ms ? { ok: true, text: `${ms} 个考核节点` } : { ok: null, text: '没有考核计划', fix: '建一篇「作业与考试」，在「## 时间表」下写：- [ ] **11-09 → 11-22**：写初稿' });
    out.push({ title: c.code, rows });
  }
  const n = (model.allDeadlines || []).length;
  out.push({ title: '学期总览', rows: [n
    ? { ok: true, text: `${st.scheduleFile}：${n} 个关键日期` }
    : { ok: false, text: `没在「${st.scheduleFile}」里找到关键日期`, fix: '加一个「## 关键日期」表格：| 日期 | 事项 | 课程 |' }] });
  return out;
}

class CheckModal extends obsidian.Modal {
  constructor(app, report, onSetup) { super(app); this.report = report; this.onSetup = onSetup; }
  onOpen() {
    const c = this.contentEl;
    c.addClass('tc-check');
    c.createEl('h2', { text: '识别检查' });
    c.createEl('p', { cls: 'tc-muted', text: '学期罗盘从你的笔记里认出了这些。⚠ 的地方按提示改一下，看板就能读到。' });
    for (const sec of this.report) {
      const box = c.createDiv({ cls: 'tc-check-sec' });
      box.createDiv({ cls: 'tc-check-title', text: sec.title });
      for (const r of sec.rows) {
        const row = box.createDiv({ cls: `tc-check-row is-${r.ok === true ? 'ok' : r.ok === false ? 'bad' : 'hint'}` });
        row.createSpan({ cls: 'tc-check-mark', text: r.ok === true ? '✓' : r.ok === false ? '⚠' : '○' });
        const t = row.createDiv();
        t.createDiv({ text: r.text });
        if (r.fix) t.createDiv({ cls: 'tc-muted', text: r.fix });
      }
    }
    new obsidian.Setting(c).addButton((b) => b.setButtonText('打开设置向导').onClick(() => { this.close(); this.onSetup(); }))
      .addButton((b) => b.setButtonText('好的').setCta().onClick(() => this.close()));
  }
  onClose() { this.contentEl.empty(); }
}

class SetupModal extends obsidian.Modal {
  constructor(app, plugin) { super(app); this.plugin = plugin; }
  onOpen() {
    const p = this.plugin, st = p.settings, c = this.contentEl;
    c.addClass('tc-setup');
    const guess = termFor(new Date());
    const pick = { root: st.courseRoot, start: st.termStart || dkey(guess.start), end: st.termEnd || dkey(guess.end), calendarYear: Number(st.yearStartMonth) === 1, sample: false };
    c.createEl('h2', { text: '欢迎使用学期罗盘' });
    c.createEl('p', { cls: 'tc-muted', text: '设好下面三项，看板就能读你的课程笔记。之后随时可以在设置里改。' });
    const folders = this.app.vault.getRoot().children.filter((x) => !(x instanceof obsidian.TFile) && !x.name.startsWith('.')).map((x) => x.name);
    const found = c.createDiv({ cls: 'tc-found' });
    const sampleToggle = { set: () => {} };
    const refresh = () => {
      const root = this.app.vault.getAbstractFileByPath(pick.root);
      const names = root && root.children ? courseFolders(root.children.filter((x) => !(x instanceof obsidian.TFile)).map((x) => x.name)) : [];
      found.setText(names.length ? `在「${pick.root}」里找到 ${names.length} 门课：${names.slice(0, 6).join('、')}${names.length > 6 ? '…' : ''}` : `「${pick.root}」里还没有课程文件夹，可以先生成一门示例课看看效果`);
      if (!names.length) { pick.sample = true; sampleToggle.set(true); }
    };
    new obsidian.Setting(c).setName('课程放在哪个文件夹').setDesc('每门课是里面的一个子文件夹')
      .addDropdown((d) => {
        const options = Object.fromEntries([[st.courseRoot, `${st.courseRoot}${folders.includes(st.courseRoot) ? '' : '（新建）'}`], ...folders.map((f) => [f, f])]);
        d.addOptions(options).setValue(pick.root).onChange((v) => { pick.root = v; refresh(); });
      });
    c.appendChild(found);
    const date = (name, desc, key) => new obsidian.Setting(c).setName(name).setDesc(desc).addText((t) => { t.inputEl.type = 'date'; t.setValue(pick[key]).onChange((v) => { pick[key] = v; }); });
    date('学期开始', '第 1 周是这天所在的那一周，每周从周一开始', 'start');
    date('学期结束', '过了这天看板会显示「假期」', 'end');
    new obsidian.Setting(c).setName('学校在澳洲或新西兰').setDesc('学年按自然年算，日期推断会跟着变')
      .addToggle((t) => t.setValue(pick.calendarYear).onChange((v) => { pick.calendarYear = v; }));
    new obsidian.Setting(c).setName('生成一门示例课').setDesc(`在课程文件夹里建「${SAMPLE}」，演示主页、笔记、闪卡和考核计划怎么写，看完可以删掉`)
      .addToggle((t) => { sampleToggle.set = (v) => t.setValue(v); t.setValue(pick.sample).onChange((v) => { pick.sample = v; }); });
    refresh();
    new obsidian.Setting(c).addButton((b) => b.setButtonText('开始使用').setCta().onClick(async () => {
      b.setDisabled(true);
      await p.finishSetup(pick);
      this.close();
    }));
  }
  onClose() { this.contentEl.empty(); }
}
