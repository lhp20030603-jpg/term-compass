/* ───────────────────────────── text parsers ───────────────────────────── */

function stripFrontmatter(text) {
  return text.startsWith('---') ? text.replace(/^---\n[\s\S]*?\n---\n?/, '') : text;
}

// CJK characters count as one word each; latin words by token.
function countWords(text) {
  const body = stripFrontmatter(text).replace(/```[\s\S]*?```/g, '').replace(/\]\([^)]*\)/g, ']');
  const cjk = (body.match(/[㐀-鿿豈-﫿]/g) || []).length;
  const latin = (body.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) || []).length;
  return cjk + latin;
}

function countTasks(text) {
  return {
    done: (text.match(/^\s*[-*] \[[xX]\]/gm) || []).length,
    open: (text.match(/^\s*[-*] \[ \]/gm) || []).length,
  };
}

const TASK_LINE = /^\s*[-*] \[([ xX])\]\s*(.*)$/;

/** Open and done task lines as {text → count}. The ✅ date is dropped so a task keeps its identity when ticked. */
function taskIndex(text) {
  const idx = { open: new Map(), done: new Map() };
  for (const line of text.split('\n')) {
    const m = line.match(TASK_LINE);
    if (!m) continue;
    const key = m[2].replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/g, '').replace(/\s+/g, ' ').trim();
    const map = m[1] === ' ' ? idx.open : idx.done;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return idx;
}
const NO_TASKS = taskIndex('');

/**
 * Net boxes ticked between two versions of a note. A line only counts when the
 * same task was open before, so generated or pasted `[x]` lines are not ticks.
 * Unticking takes the tick back.
 */
function taskFlips(a, b) {
  const ticked = (from, to, k) => Math.min(Math.max(0, (from.open.get(k) || 0) - (to.open.get(k) || 0)), Math.max(0, (to.done.get(k) || 0) - (from.done.get(k) || 0)));
  let n = 0;
  for (const k of b.done.keys()) n += ticked(a, b, k);
  for (const k of a.done.keys()) n -= ticked(b, a, k);
  return n;
}

const noteStats = (text) => Object.assign({ w: countWords(text), idx: taskIndex(text) }, countTasks(text));

// [[a|b]] → b, [[a]] → a, [t](url) → t, **x** → x
function stripMd(t) {
  return t
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]#]+)(#[^\]]*)?\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|`/g, '')
    .replace(/\\\|/g, '|')
    .trim();
}

function sectionLines(text, headingMatch) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^##\s/.test(l) && headingMatch(l));
  if (start < 0) return { start: -1, lines: [] };
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (/^##\s/.test(lines[i])) { end = i; break; }
  return { start, lines: lines.slice(start + 1, end), heading: lines[start].replace(/^##\s*/, '') };
}

/**
 * A date without a year belongs to the academic year. It turns a month before the
 * school year starts (August for a September start), so for a calendar-year school
 * (yearStartMonth 1) every date stays in the current year.
 */
function inferDate(m, d, y, now) {
  if (y) return new Date(y, m - 1, d, 23, 59);
  const cut = TERM_SETTINGS.yearStartMonth - 1;
  const first = now.getMonth() + 1 >= cut ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(m >= cut ? first : first + 1, m - 1, d, 23, 59);
}

// 「2027 年 4 月中下旬」 has no exact day, so the earliest likely date stands in.
const TEN_DAYS = { 上旬: 1, 中旬: 11, 中下旬: 11, 下旬: 21 };
function fuzzyDate(cell) {
  const m = cell.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(上旬|中下旬|中旬|下旬)?/);
  return m ? new Date(+m[1], +m[2] - 1, TEN_DAYS[m[3]] || 1, 23, 59) : null;
}

// Parse the "关键日期" table: the last date in the first cell is the due date.
function parseDeadlines(text, now) {
  if (!text) return [];
  const sec = sectionLines(text, (l) => DEADLINE_HEAD.test(l));
  const out = [];
  for (const line of sec.lines) {
    if (!line.startsWith('|') || /^\|\s*-/.test(line)) continue;
    const cells = splitRow(line).slice(1, -1).map((c) => c.trim());
    if (cells.length < 2 || cells[0] === '日期') continue;
    const when = normDates(cells[0].replace(/（[^）]*）/g, ''));
    const dates = [...when.matchAll(/(?:(\d{4})-)?(\d{1,2})-(\d{1,2})/g)];
    const fuzzy = dates.length ? null : fuzzyDate(when);
    if (!dates.length && !fuzzy) continue;
    const last = dates[dates.length - 1];
    const due = fuzzy || inferDate(+last[2], +last[3], last[1] ? +last[1] : (dates[0][1] ? +dates[0][1] : null), now);
    const title = stripMd(cells[1]).replace(/（[^）]*）/g, '').replace(/→.*$/, '').trim();
    const course = stripMd(cells[2] || '');
    out.push({ due, title, full: stripMd(cells[1]), course, raw: stripMd(cells[0]), important: /\*\*/.test(cells[0] + cells[1]), fuzzy: !!fuzzy });
  }
  return out.sort((a, b) => a.due - b.due);
}

// Parse the "本周" checklist; keep line numbers so the dashboard can toggle them.
function parseWeekTasks(text) {
  if (!text) return { heading: '', tasks: [] };
  const sec = sectionLines(text, (l) => WEEK_HEAD.test(l));
  const tasks = [];
  sec.lines.forEach((line, i) => {
    const m = line.match(/^\s*[-*] \[([ xX])\]\s*(.*)$/);
    if (m) tasks.push({ line: sec.start + 1 + i, raw: line, done: m[1] !== ' ', text: stripMd(m[2]).replace(/→.*$/, '').trim() });
  });
  return { heading: sec.heading || '', tasks };
}

// Exam plans: notes like 「STAT301 作业与历年真题」 hold a section of dated checkboxes.

/** The dates in a plan line's lead, or null for 「每周」「圣诞假」 and the like. */
function parsePlanDate(lead, now) {
  const on = (m, d) => inferDate(m, d, null, now);
  let x = lead.match(/(\d{1,2})-(\d{1,2})\s*(?:→|->|至|到)\s*(\d{1,2})-(\d{1,2})/);
  if (x) return { start: on(+x[1], +x[2]), end: on(+x[3], +x[4]), token: x[0] };
  x = lead.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[–—-]\s*(\d{1,2})\s*日/);
  if (x) return { start: on(+x[1], +x[2]), end: on(+x[1], +x[3]), token: x[0] };
  x = lead.match(/(\d{1,2})\s*月第\s*(\d)\s*周/);
  if (x) return { start: on(+x[1], (+x[2] - 1) * 7 + 1), end: on(+x[1], +x[2] * 7), token: x[0] };
  x = lead.match(/(?:^|[^\d])((\d{1,2})-(\d{1,2}))(?!\d)/);
  if (x) return { start: on(+x[2], +x[3]), end: on(+x[2], +x[3]), token: x[1], soft: true };
  x = lead.match(/(\d{1,2})\s*月/);
  if (x) { const start = on(+x[1], 1); return { start, end: new Date(start.getFullYear(), +x[1], 0, 23, 59), token: x[0], soft: true }; }
  return null;
}

function parseMilestones(code, path, text, now) {
  const sec = sectionLines(text, (l) => PLAN_HEADING.test(l));
  const out = [];
  sec.lines.forEach((raw, i) => {
    const m = raw.match(/^[-*] \[([ xX])\]\s*(.*)$/);
    if (!m) return;
    const bold = m[2].match(/^\*\*(.+?)\*\*/);
    const when = parsePlanDate(normDates(bold ? bold[1] : m[2].split(/[：:]/)[0]), now);
    if (!when) return;
    const body = normDates(stripMd(m[2].replace(/\s*→\s*\[\[.*$/, ''))).replace(when.token, '').replace(/\s*✅\s*$/, '')
      .replace(/^\s*[（(]周[一二三四五六日][）)]/, '').replace(/^\s*\d{1,2}:\d{2}/, '').replace(/^[\s：:，,]+/, '').trim();
    out.push({ code, path, line: sec.start + 1 + i, raw, done: m[1] !== ' ', text: body, start: when.start, end: when.end, soft: !!when.soft });
  });
  return out;
}

/**
 * Adds status and days left. A one-day item or a whole month that has passed is
 * dropped: it was an event or a principle, and nothing is left to do. A range past
 * its end stays overdue until ticked, because it stands for work that has to exist.
 */
function milestoneStatus(list, now) {
  const today = day0(now);
  return list.map((m) => {
    const left = Math.round((day0(m.end) - today) / 864e5);
    const status = m.done ? 'done' : left < 0 ? 'overdue' : day0(m.start) <= today ? 'active' : 'upcoming';
    return Object.assign({}, m, { left, status });
  }).filter((m) => !(m.soft && m.left < 0)).sort((a, b) => a.end - b.end);
}

// Status can be an emoji or plain words (easier to type): 完成 / 进行中. 「未完成」「没开始」 count as todo.
function stateOf(s) {
  const x = (s || '').replace(/未完成|没完成|未开始|没开始|待完成/g, '');
  if (/✅|☑|完成|已上|已读|读过|上过|\bdone\b/i.test(x)) return 'done';
  if (/▶️|▶|进行中|在读|正在|在看|\bdoing\b/i.test(x)) return 'doing';
  return 'todo';
}

// Syllabus items from a course homepage: rows of any table with a 「状态」 column,
// plus headings like 「### 第 2 讲 · 10-21 ▶️」. ✅ = done, ▶️ = in progress.
const STATUS_WORDS = /✅|▶️|▶|未完成|没开始|已完成|完成|进行中|已上|本周[一二三四五六日]?/g;
const EXPLICIT_RE = /✅|▶|未完成|没开始|完成|进行中|已上/;

// "Foundations (II): Fundamental principles（推测）" → "Fundamental principles"
function shortTopic(s) {
  let x = stripMd(s).replace(/（[^）]*）|\([^)]*推测[^)]*\)/g, '').trim();
  const m = x.match(/^[^:：]{0,40}\([IVX\d]+\)\s*[:：]\s*(.+)$/);
  if (m) x = m[1];
  return x.length > 48 ? x.slice(0, 47) + '…' : x;
}

/**
 * Syllabus items from a course homepage. Lecture headings like
 * 「### 第 2 讲 · 基本原则 · 10-21 进行中」 win; tables with a 「状态」 column are
 * only used when a page has no such headings (so reference tables, e.g. a
 * textbook chapter map, never pretend to be the lecture order).
 */
function parseStatusItems(text) {
  if (!text) return [];
  const lines = text.split('\n');
  const heads = [], rows = [];
  const linksIn = (str) => [...str.matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1].trim());
  for (let i = 0; i < lines.length; i++) {
    const hm = matchLecture(lines[i]);
    if (hm) {
      let label = stripMd(hm.text).replace(STATUS_WORDS, '').replace(/\s+/g, ' ').trim();
      // Heading has only number + date → borrow the bold topic line just below it.
      if (!/[A-Za-z一-鿿]{2,}/.test(label.replace(hm.token, '').replace(/周[一二三四五六日]/g, ''))) {
        const bold = lines.slice(i + 1, i + 6).find((l) => /^\*\*.+\*\*\s*$/.test(l.trim()));
        if (bold) label = `第 ${hm.n} ${hm.unit} · ${shortTopic(bold)}`;
      }
      // Section body (until the next heading of the same or higher level) → linked notes.
      let end = i + 1;
      while (end < lines.length && !new RegExp(`^#{1,${hm.level}}\\s`).test(lines[end])) end++;
      const dm = findDate(hm.text);
      const tail = hm.text.replace(hm.token, '');
      const tasks = [];
      for (let k = i + 1; k < end; k++) {
        const tm = lines[k].match(/^\s*[-*] \[([ xX])\]\s*(.*)$/);
        if (tm) tasks.push({ line: k, raw: lines[k], done: tm[1] !== ' ', text: stripMd(tm[2]).replace(/→.*$/, '').replace(/^⭐\s*/, '⭐ ').trim() });
      }
      heads.push({ kind: 'head', n: hm.n, label, state: stateOf(hm.text), explicit: EXPLICIT_RE.test(tail.replace(/本周[一二三四五六日]?/g, '')),
        date: dm, line: i, raw: lines[i], links: linksIn(lines.slice(i + 1, end).join('\n')), tasks });
      continue;
    }
    if (!lines[i].startsWith('|')) continue;
    const head = splitRow(lines[i]).map((c) => c.trim());
    const col = head.indexOf('状态');
    if (col < 0) continue;
    const unit = /章/.test(head[1]) ? '章' : /周/.test(head[1]) ? '周' : '讲';
    for (i += 1; i < lines.length && lines[i].startsWith('|'); i++) {
      if (/^\|[\s:|-]+\|?\s*$/.test(lines[i])) continue;
      const cells = splitRow(lines[i]).map((c) => c.trim());
      const topic = stripMd(cells[2] || '').replace(/<br>.*$/, '').split(/[：:]/)[0].trim();
      const num = /^\d+$/.test(cells[1]) ? +cells[1] : rows.length + 1;
      const label = /^\d+$/.test(cells[1]) ? `第 ${cells[1]} ${unit} · ${shortTopic(topic)}` : shortTopic(`${cells[1]} ${topic}`);
      rows.push({ kind: 'row', n: num, label, state: stateOf(cells[col] || ''), explicit: EXPLICIT_RE.test(cells[col] || ''), col,
        date: null, line: i, raw: lines[i], links: linksIn(lines[i]), tasks: [] });
    }
    i--;
  }
  return heads.length ? heads : rows;
}

/**
 * Turn parsed lectures into display status. A written status (完成 / 进行中 / 未完成)
 * always wins. Otherwise a lecture moves through two stages: 上过 (date passed, or a
 * recording that day) and 读过 (READ_MINUTES in the notes or PDFs it links), which completes it.
 * A past lecture with neither a guide nor a recording is overdue (待补).
 * opts: heard = Set of recording dates, readMin(link) = minutes spent in that note.
 * Rows without a date get one estimated from the term start (lecture N in week N).
 */
function lectureStatus(items, now, isGuide, opts) {
  const { heard = new Set(), readMin = () => 0 } = opts || {};
  const start = day0(termFor(now).start);
  const today = day0(now);
  return items.map((it) => {
    const due = it.date ? day0(inferDate(it.date.m, it.date.d, it.date.y || null, now)) : addDays(start, (it.n - 1) * 7);
    const past = due < today, inWeek = +monday(due) === +monday(now);
    const links = it.links.filter(isGuide);
    const guides = links.length;
    const recorded = heard.has(dkey(due));
    const read = guides > 0 && links.reduce((a, l) => a + readMin(l), 0) >= READ_MINUTES;
    const autoDone = read && (past || recorded);
    // A lecture inside the current week is 本周 (not 待补) even if its day has passed.
    const pending = recorded || (past && guides) ? 'attended' : inWeek ? 'week' : past ? 'overdue' : 'future';
    // 「进行中」 left on a lecture whose week is over and whose reading is done → treat as done.
    const staleDoing = it.state === 'doing' && past && !inWeek && autoDone;
    let status;
    if (it.explicit && !staleDoing) status = it.state === 'done' ? 'done' : it.state === 'doing' ? 'doing' : pending;
    else status = autoDone ? 'done' : pending;
    return Object.assign({}, it, { due, estimated: !it.date, past, inWeek, guides, guideLink: links[0] || null, autoDone, status,
      done: status === 'done', auto: status === 'done' && (!it.explicit || staleDoing) });
  });
}
