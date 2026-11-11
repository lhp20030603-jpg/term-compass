/*
 * Tasks: tasks, quick notes and the recording panel of Term Compass.
 *
 * Tasks live in one Markdown file with three lists: 今天, 本周, 以后 (plus 已完成).
 * A dated task also shows in the list its date falls in, so nothing has to be moved
 * by hand. Old files with seven lists (收件箱, 接下来 …) are merged on read.
 *   - [ ] 写宏观作业 #ECON201 📅 2026-10-26
 *   - [x] 买菜 #生活 ✅ 2026-10-25
 * Memos live in another file, newest day first:
 *   ## 2026-10-25
 *   - 14:30 一条想法（续行用两个空格缩进）
 * Both files stay readable and editable without the plugin.
 *
 * Layout of this file: utils → task doc → memo doc → renderers → plugin.
 */

const VIEW_TYPE = 'term-compass-tasks';
const LISTS = ['今天', '本周', '以后', '已完成'];
const OPEN_LISTS = ['今天', '本周', '以后'];
const DONE = '已完成';
// Lists from the older seven-list layout, merged on read so no task is lost.
const OLD_LISTS = { 收件箱: '以后', 接下来: '本周', 随时可做: '以后', 将来也许: '以后', 等待: '以后' };
const DEFAULT_SETTINGS = {
  taskFile: '学期罗盘/任务.md',
  memoFile: '学期罗盘/随手记.md',
  archiveFile: '学期罗盘/存档.md',
};
const CONVERTED = ' → 已转任务';
const stripDue = (raw) => raw.replace(/\s*📅\s*\d{4}-\d{2}-\d{2}/, '');
const PROJECT_COLORS = ['#5b6bd5', '#e07a5f', '#3d9a8b', '#d4a03a', '#b5669e', '#5aa1d6', '#7bb662', '#c46a8e'];

/* ───────────────────────────── utils ───────────────────────────── */

const pad = (n) => String(n).padStart(2, '0');
const dkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function h(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

function colorOf(tag) {
  let x = 0;
  for (const ch of tag) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  return PROJECT_COLORS[x % PROJECT_COLORS.length];
}

/* ───────────────────────────── task doc ───────────────────────────── */

function parseTaskLine(line) {
  const m = line.match(/^\s*[-*] \[([ xX])\] (.*)$/);
  if (!m) return null;
  const body = m[2];
  const tags = [...body.matchAll(/(?:^|\s)#([^\s#]+)/g)].map((x) => x[1]);
  const due = (body.match(/📅\s*(\d{4}-\d{2}-\d{2})/) || [])[1] || null;
  const doneOn = (body.match(/✅\s*(\d{4}-\d{2}-\d{2})/) || [])[1] || null;
  const title = body.replace(/(?:^|\s)#[^\s#]+/g, ' ').replace(/(?:📅|✅)\s*\d{4}-\d{2}-\d{2}/g, '').replace(/\s+/g, ' ').trim();
  return { raw: line, done: m[1] !== ' ', title, tags, due, doneOn };
}

// Our four lists come first, in order; any heading of your own is kept after them.
function parseTaskDoc(text) {
  const doc = { head: [], sections: [] };
  const named = (name) => doc.sections.find((s) => s.name === name) || (doc.sections.push({ name, lines: [] }), doc.sections[doc.sections.length - 1]);
  let cur = null;
  for (const line of text.split('\n')) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) { cur = named(OLD_LISTS[m[1]] || m[1]); continue; }
    (cur ? cur.lines : doc.head).push(line);
  }
  for (const name of LISTS) named(name);
  doc.sections.sort((a, b) => (LISTS.includes(a.name) ? LISTS.indexOf(a.name) : 99) - (LISTS.includes(b.name) ? LISTS.indexOf(b.name) : 99));
  return doc;
}

function serializeTaskDoc(doc) {
  const out = doc.head.slice();
  while (out.length && out[out.length - 1].trim() === '') out.pop();
  for (const s of doc.sections) {
    const lines = s.lines.slice();
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    while (lines.length && lines[0].trim() === '') lines.shift();
    out.push('', `## ${s.name}`, ...lines);
  }
  return out.join('\n') + '\n';
}

function section(doc, name) { return doc.sections.find((s) => s.name === name); }

function insertTask(sec, line, atTop) {
  const idx = sec.lines.map((l) => !!parseTaskLine(l));
  if (atTop) { const first = idx.indexOf(true); sec.lines.splice(first < 0 ? sec.lines.length : first, 0, line); return; }
  const last = idx.lastIndexOf(true);
  sec.lines.splice(last < 0 ? sec.lines.length : last + 1, 0, line);
}

function removeTask(doc, from, raw) {
  const sec = section(doc, from);
  const i = sec ? sec.lines.indexOf(raw) : -1;
  if (i < 0) return false;
  sec.lines.splice(i, 1);
  return true;
}

const WORD_DAYS = { 今天: 0, 明天: 1, 后天: 2 };
const DATE_TOKEN = /(^|\s)(今天|明天|后天|(?:\d{4}-)?\d{1,2}-\d{1,2})(?=\s|$)/g;
const RANGE_UNIT = /^\s*[章讲题页周节课篇]/;

/**
 * The date a typed token means, or null when it reads as a number range. A bare
 * 「4-5」 stays text (write 04-05 for a date), and so does anything landing more
 * than 300 days ahead: nobody schedules 「10-12」 for next October by typing that.
 */
function readDate(tok, now) {
  const p = tok.split('-').map(Number);
  if (p.length === 3) return new Date(p[0], p[1] - 1, p[2]);
  if (/^\d-\d$/.test(tok)) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let due = new Date(now.getFullYear(), p[0] - 1, p[1]);
  if (due.getMonth() !== p[0] - 1) return null;
  if (due < today) due = new Date(now.getFullYear() + 1, p[0] - 1, p[1]);
  return (due - today) / 864e5 <= 300 ? due : null;
}

// 「今天」「明天」「后天」「10-28」「2026-10-28」 at a word boundary become a 📅 due date.
// 「4-5 章」 and 「第 3-4 题」 are ranges and stay in the text.
function parseNewTask(input, now) {
  let due = null;
  const text = input.replace(DATE_TOKEN, (all, sp, tok, at, str) => {
    if (due || /第\s*$/.test(str.slice(0, at + sp.length)) || RANGE_UNIT.test(str.slice(at + all.length))) return all;
    due = tok in WORD_DAYS ? addDays(now, WORD_DAYS[tok]) : readDate(tok, now);
    return due ? sp : all;
  }).replace(/\s+/g, ' ').trim();
  return `- [ ] ${text}${due ? ` 📅 ${dkey(due)}` : ''}`;
}

function readTasks(text) {
  const doc = parseTaskDoc(text || '');
  const lists = {};
  for (const name of LISTS) lists[name] = section(doc, name).lines.map(parseTaskLine).filter(Boolean).map((t) => Object.assign(t, { list: name }));
  return lists;
}

/**
 * What 今天 / 本周 / 以后 show: the earlier of the list a task sits in and the list
 * its date falls in. Overdue tasks land in 今天. Within a list, dated tasks come first.
 */
function viewsOf(lists, today, weekEnd) {
  const out = { 今天: [], 本周: [], 以后: [] };
  const byDate = (t) => (!t.due ? 2 : t.due <= today ? 0 : t.due <= weekEnd ? 1 : 2);
  for (const t of OPEN_LISTS.flatMap((n) => lists[n])) out[OPEN_LISTS[Math.min(OPEN_LISTS.indexOf(t.list), byDate(t))]].push(t);
  const order = (a, b) => (a.due || '9999') .localeCompare(b.due || '9999');
  for (const k of OPEN_LISTS) out[k].sort(order);
  return out;
}

// 「宏观经济学 ECON201」 → ECON201. A name without a course code just loses its spaces.
const courseTag = (name) => ((String(name).match(/[A-Za-z]{2,}\s?\d{2,}[A-Za-z]?/) || [String(name)])[0]).replace(/\s+/g, '');
const withTag = (input, tag) => (!tag || new RegExp(`(^|\\s)#${tag}(\\s|$)`).test(input) ? input : `${input} #${tag}`);

/* ───────────────────────────── memo doc ───────────────────────────── */

function parseMemos(text) {
  const memos = [];
  let day = null, cur = null;
  for (const line of (text || '').split('\n')) {
    const dm = line.match(/^##\s+(\d{4}-\d{2}-\d{2})/);
    if (dm) { day = dm[1]; cur = null; continue; }
    const mm = line.match(/^- (\d{1,2}:\d{2})\s?(.*)$/);
    if (mm && day) {
      const converted = mm[2].endsWith(CONVERTED.trim());
      cur = { day, time: mm[1], text: converted ? mm[2].slice(0, -CONVERTED.trim().length).trim() : mm[2], raw: [line], converted };
      memos.push(cur); continue;
    }
    if (cur && /^ {2,}\S/.test(line)) { cur.text += '\n' + line.trim(); cur.raw.push(line); continue; }
    cur = null;
  }
  return memos;
}

function addMemo(text, memo, now) {
  const lines = (text || '# 随手记\n').split('\n');
  const today = dkey(now);
  const entry = [`- ${hhmm(now)} ${memo.split('\n')[0]}`, ...memo.split('\n').slice(1).map((l) => `  ${l}`)];
  let hi = lines.findIndex((l) => l.trim() === `## ${today}`);
  if (hi < 0) {
    let first = lines.findIndex((l) => /^##\s+\d{4}-\d{2}-\d{2}/.test(l));
    if (first < 0) { while (lines.length && lines[lines.length - 1].trim() === '') lines.pop(); lines.push(''); first = lines.length; }
    lines.splice(first, 0, `## ${today}`, '');
    hi = first;
  }
  lines.splice(hi + 1, 0, ...entry);
  return lines.join('\n');
}

// Split memo text into (kept, archived): every day before `beforeDay` is archived.
function splitMemos(text, beforeDay) {
  const keep = [], gone = [];
  let bucket = keep;
  for (const line of (text || '').split('\n')) {
    const dm = line.match(/^##\s+(\d{4}-\d{2}-\d{2})/);
    if (dm) bucket = dm[1] < beforeDay ? gone : keep;
    bucket.push(line);
  }
  return { keep: keep.join('\n').replace(/\n{3,}/g, '\n\n'), gone: gone.join('\n').trim() };
}

function appendArchive(text, title, body) {
  const head = (text || '# 存档\n\n> 随手记和已完成任务的存档，从 Inbox 和任务清单里挪过来的，不会删除。\n').replace(/\s+$/, '');
  return `${head}\n\n## ${title}\n\n${body.trim()}\n`;
}

