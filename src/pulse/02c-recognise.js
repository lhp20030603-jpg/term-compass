/* ───────────────────────────── recognising notes ─────────────────────────────
 * Formats other students already use, so their notes work without setup.
 * Slash dates (11/3) are left alone: they mean different days in the US and the UK.
 */

const LECTURE_HEAD = /^(#{2,4})\s+((?:第\s*(\d+)\s*([讲周章课次])|(Lecture|Lec|Week|Wk|Session|Class|Seminar|Topic|L|W)\s*(\d+)\b).*)$/i;
const EN_UNIT = { lecture: '讲', lec: '讲', l: '讲', topic: '讲', week: '周', wk: '周', w: '周', session: '次', seminar: '次', class: '课' };

/** {level, text, n, unit, token} for a lecture heading, else null. */
function matchLecture(line) {
  const m = line.match(LECTURE_HEAD);
  if (!m) return null;
  const zh = !!m[3];
  return { level: m[1].length, text: m[2], n: +(zh ? m[3] : m[6]), unit: zh ? m[4] : EN_UNIT[m[5].toLowerCase()], token: zh ? m[0].match(/第\s*\d+\s*[讲周章课次]/)[0] : `${m[5]}${m[6]}` };
}

// 「11月9日」 → 「11-9」, so every reader below only needs the dash form.
const normDates = (s) => String(s).replace(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/g, '$1-$2');

/** The last date written in some text: 2026-11-11, 11-11 or 11月11日. */
function findDate(text) {
  const all = [...normDates(text).matchAll(/(?:^|[^\d-])(?:(\d{4})-)?(\d{1,2})-(\d{1,2})(?![\d-])/g)];
  const m = all.pop();
  if (!m || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31) return null;
  return { y: m[1] ? +m[1] : null, m: +m[2], d: +m[3] };
}

const HOME_NAMES = /^(课程主页|主页|首页|index|readme|home|overview|概览|syllabus|大纲|course|课程)$/i;
const base = (p) => p.split('/').pop().replace(/\.md$/, '');

/** The homepage of a course from the notes directly in its folder: by name, then by having the most lectures. */
function pickHome(code, notes) {
  const named = notes.find((n) => HOME_NAMES.test(base(n.path)) || /课程主页/.test(base(n.path))) || notes.find((n) => base(n.path) === code);
  if (named) return named.path;
  const count = (n) => (n.text || '').split('\n').filter((l) => matchLecture(l)).length;
  const best = notes.map((n) => [n, count(n)]).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= 2 ? best[0].path : null;
}

const NOT_A_COURSE = /^(\.|_)|^(附件|attachments?|assets|images?|templates?|模板|archive|归档)$/i;
const courseFolders = (names) => names.filter((n) => !NOT_A_COURSE.test(n));

const DEADLINE_HEAD = /关键日期|截止|重要日期|deadlines?|key dates|important dates/i;
const WEEK_HEAD = /本周|this week/i;
const PLAN_FILE = /真题|备考|作业|考试|考核|exam|assessment|assignment|essay|plan/i;
const PLAN_HEADING = /计划|时间表|行动清单|安排|plan|timeline|schedule/i;
const isPlanNote = (name) => PLAN_FILE.test(name) && !HOME_NAMES.test(base(name)) && !/课程主页/.test(name);

// What a lecture's reading can be: notes and PDFs, not images.
const isReading = (path) => /\.(md|pdf)$/i.test(path || '');
