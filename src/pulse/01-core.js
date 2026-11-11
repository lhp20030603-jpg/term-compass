/*
 * Pulse: the dashboard module of Term Compass.
 *   1. Live tracking: vault modify/create events give per-day word and checkbox counts.
 *   2. Days before tracking began are estimated from file dates (shown faded, no XP).
 *   3. Parsers read your notes: course homepages, the key-dates table, exam plans.
 *   4. Renderers draw everything with plain DOM + SVG (no chart libraries).
 */
const VIEW_TYPE = 'term-compass-dashboard';

const DEFAULT_SETTINGS = {
  courseRoot: '课程',
  courses: '',                 // empty: every folder in courseRoot is a course
  englishRoot: '英语',
  readingFolder: '',
  scheduleFile: '课程/学期总览.md',
  termStart: '',               // YYYY-MM-DD; empty: guessed (autumn Sep–Jan, spring Feb–Jun)
  termEnd: '',
  yearStartMonth: 9,           // month the school year starts; 1 for Australia / New Zealand
  setupDone: false,            // the first-run dialog has been completed
  focusMinutes: 25,
  breakMinutes: 5,
  pomodoroGoal: 8,
  theme: 'blue',
  showFloat: true,
  sound: true,
  systemNotify: true,
  backupFolder: '',
  backupKeep: 30,
  folded: ['学习概览', '当日详情', '知识地层', '成就'],
};

// XP: time spent and things recalled. Saving, new notes, pastes and tool-written
// text earn nothing, because they say nothing about what was learned.
const SCORE = { focusMin: 1, lectureMin: 0.5, readMin: 0.5, review: 1, word: 0.02, task: 2 };
const READ_MINUTES = 10;           // time in a lecture's guide that counts as 读过
const READING_TICK_S = 15;
const READING_IDLE_MS = 120000;    // no input for this long: the reader has walked away
const TYPED_WINDOW_MS = 8000;      // autosave lands about 2 s after the last key

// One autosave happens about every 2 s; adding more than this many words in a
// single save cannot be typing, even with keys pressed just before it.
const PASTE_WORDS = 80;

// The compass measures balance, not volume: each habit done lights one direction.
// progress(d) → { frac 0..1, text } drives the quest bars; done = frac >= 1.
const typedIn = (day, code) => Object.values(day.fileStats || {}).reduce((a, x) => a + (x.area === code ? x.t : 0), 0);
const courseWords = (d, codes) => Math.round(codes.reduce((a, c) => a + (d.est ? d.areas[c] || 0 : typedIn(d, c)), 0));
const studyMin = (d) => (d.focus || 0) + (d.lecture || 0) + (d.readMin || 0);
const HABITS = [
  { key: 'course', label: '课程', icon: '📖', hint: '在课程笔记里手写 ≥ 100 词',
    progress: (d, codes) => ({ frac: courseWords(d, codes) / 100, text: `${courseWords(d, codes)} / 100 词` }) },
  { key: 'english', label: '英语', icon: '🗣', hint: '读完一篇每日阅读，或英语区写 ≥ 100 词',
    progress: (d) => ({ frac: Math.max(d.reading ? 1 : 0, (d.areas['英语'] || 0) / 100), text: d.reading ? `精读 ${d.reading} 篇` : `${Math.round(d.areas['英语'] || 0)} / 100 词，或读 1 篇` }) },
  { key: 'focus', label: '专注', icon: '🍅', hint: '番茄、听课、阅读课程笔记合计 ≥ 50 分钟',
    progress: (d) => ({ frac: studyMin(d) / 50, text: `${studyMin(d)} / 50 分钟` }) },
  { key: 'close', label: '收尾', icon: '✅', hint: '勾掉 1 个任务，或复习 10 张闪卡',
    progress: (d) => ({ frac: Math.max(d.tasks || 0, (d.reviews || 0) / 10), text: `任务 ${d.tasks || 0}/1 · 闪卡 ${d.reviews || 0}/10` }) },
];
HABITS.forEach((hb) => { hb.test = (d, codes) => hb.progress(d, codes).frac >= 1; });

const EDIT_SESSION_GAP_MS = 10 * 60 * 1000;
const OTHER_COLORS = ['#9aa0b4', '#7bb662', '#c46a8e', '#4fb3c8', '#a07ad0', '#c9a35a', '#6b8f71'];
const AREA_COLORS = ['#5b6bd5', '#e07a5f', '#3d9a8b', '#d4a03a', '#b5669e', '#5aa1d6', '#8a8fa3', '#7bb662', '#c9705a'];
