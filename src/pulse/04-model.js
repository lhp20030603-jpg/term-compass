/* ───────────────────────────── model ───────────────────────────── */

// Names may contain spaces (「宏观经济学 ECON201」), so only commas separate them.
function courseList(settings) {
  return String(settings.courses || '').split(/[,，]/).map((x) => x.trim()).filter(Boolean);
}

function areaOf(path, st) {
  const courses = courseList(st);
  if (path.startsWith(st.courseRoot + '/')) {
    const seg = path.slice(st.courseRoot.length + 1).split('/')[0];
    return courses.includes(seg) ? seg : '其他课程';
  }
  if (path.startsWith(st.englishRoot + '/')) return '英语';
  return (path.split('/')[0] || '根目录').replace(/^\d+\s*/, '');
}

/** What a day earned, part by part, under the rules of that day. */
function scoreParts(d, key) {
  // A day guessed from file dates only shows how busy it looked; it earns nothing.
  if (d.est) return [['估算活动', d.notes * 2 + d.edits, '#b7a6e6']];
  return [['专注', d.focus * SCORE.focusMin, '#d99a3a'], ['听课', (d.lecture || 0) * SCORE.lectureMin, '#c46a8e'], ['阅读', (d.readMin || 0) * SCORE.readMin, '#3f7fd0'],
    ['闪卡', (d.reviews || 0) * SCORE.review, '#5aa1d6'], ['手写', d.words * SCORE.word, '#8b6fd6'], ['任务', d.tasks * SCORE.task, '#3d9a8b']];
}
const scoreOf = (d, key) => scoreParts(d, key).reduce((a, p) => a + p[1], 0);

function readingDate(path, ctime) {
  const m = path.split('/').pop().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : dkey(new Date(ctime));
}

/**
 * Build everything the renderers need from plain data (pure; easy to preview).
 * ctx = { files:[{path,ctime,mtime}], cache:{path:{w,done,open}}, tracked:{key:day},
 *         settings, texts:{schedule, courseHomes}, now, pomo }
 */
function buildModel(ctx) {
  const { files, cache, tracked, settings: st, texts, now } = ctx;
  useTerm(st);
  const recall = ctx.recall || {};
  const today = dkey(now);
  const est = {};
  const get = (map, k) => map[k] || (map[k] = emptyDay());
  const readingDays = {};

  for (const f of files) {
    const area = areaOf(f.path, st);
    const w = (cache[f.path] && cache[f.path].w) || 0;
    const ck = dkey(new Date(f.ctime));
    const mk = dkey(new Date(f.mtime));
    const d1 = get(est, ck);
    d1.notes++; d1.words += w; d1.created.push(f.path);
    d1.areas[area] = (d1.areas[area] || 0) + w;
    d1.files[f.path] = (d1.files[f.path] || 0) + w;
    if (mk !== ck) {
      const d2 = get(est, mk);
      d2.edits++; d2.areas[area] = (d2.areas[area] || 0) + 30;
      d2.files[f.path] = d2.files[f.path] || 0;
    }
    if (st.readingFolder && f.path.startsWith(st.readingFolder + '/')) {
      const rk = readingDate(f.path, f.ctime);
      (readingDays[rk] = readingDays[rk] || []).push(f.path);
    }
  }

  // File dates only stand in for days before tracking began. After that, a day with
  // no tracked activity had none: a bulk rename or an outside edit is not study.
  const firstTracked = Object.keys(tracked).sort()[0] || today;
  const days = {};
  for (const k of new Set([...Object.keys(est), ...Object.keys(tracked)])) {
    const t = tracked[k];
    if (!t && k >= firstTracked) continue;
    days[k] = t ? Object.assign(emptyDay(), t, { est: false }) : Object.assign(est[k], { est: true });
  }
  const codes = courseList(st);
  const recordings = (ctx.recordings || []).filter((r) => codes.includes(r.course));
  const lectureMin = {};
  for (const r of recordings) lectureMin[r.date] = (lectureMin[r.date] || 0) + r.minutes;
  for (const k in readingDays) if (!days[k]) days[k] = Object.assign(emptyDay(), { est: true });
  for (const k in recall) if (!days[k] && recall[k].reviews) days[k] = Object.assign(emptyDay(), { est: false });
  for (const k in lectureMin) if (!days[k]) days[k] = Object.assign(emptyDay(), { est: false });
  for (const k in days) {
    const d = days[k];
    d.reading = (readingDays[k] || []).length;
    d.reviews = (recall[k] && recall[k].reviews) || 0;
    d.lecture = Math.round(lectureMin[k] || 0);
    d.readMin = Math.round((d.readSec || 0) / 60);
    d.score = scoreOf(d, k);
  }

  // Streaks over all days
  const active = (k) => days[k] && days[k].score > 0;
  let cur = 0;
  let cursor = active(today) ? now : addDays(now, -1);
  while (active(dkey(cursor))) { cur++; cursor = addDays(cursor, -1); }
  let longest = 0, run = 0;
  const allKeys = Object.keys(days).sort();
  if (allKeys.length) {
    for (let d = parseKey(allKeys[0]); dkey(d) <= today; d = addDays(d, 1)) {
      run = active(dkey(d)) ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
  }

  // Courses
  const courses = courseList(st).map((code, i) => {
    const prefix = `${st.courseRoot}/${code}/`;
    const cf = files.filter((f) => f.path.startsWith(prefix));
    let done = 0, open = 0, words = 0;
    for (const f of cf) { const c = cache[f.path] || {}; done += c.done || 0; open += c.open || 0; words += c.w || 0; }
    const last = cf.slice().sort((a, b) => b.mtime - a.mtime)[0];
    const home = cf.find((f) => /课程主页/.test(f.path)) || cf.find((f) => /笔记/.test(f.path));
    const spark = [];
    for (let j = 13; j >= 0; j--) {
      const d = days[dkey(addDays(now, -j))];
      spark.push(d ? d.areas[code] || 0 : 0);
    }
    const homeInfo = (texts.courseHomes || {})[code] || {};
    const resolve = ctx.resolve || (() => null);
    const isGuide = (lt) => { const p = resolve(lt, homeInfo.path || ''); return !!p && p !== homeInfo.path && isReading(p); };
    const items = lectureStatus(parseStatusItems(homeInfo.text), now, isGuide, {
      heard: new Set(recordings.filter((r) => r.course === code).map((r) => r.date)),
      readMin: (lt) => (((ctx.reading || {})[resolve(lt, homeInfo.path || '')]) || 0) / 60,
    });
    const sDone = items.filter((x) => x.done).length;
    const sDoing = items.filter((x) => x.status === 'doing').length;
    const sAttended = items.filter((x) => x.status === 'attended').length;
    const overdue = items.filter((x) => x.status === 'overdue').length;
    const current = items.find((x) => x.status === 'doing') || items.find((x) => x.inWeek);
    const upNext = items.find((x) => !x.done && x !== current && !x.past && !x.inWeek);
    const progress = items.length ? (sDone + 0.5 * (sDoing + sAttended)) / items.length : 0;
    return { code, color: AREA_COLORS[i % AREA_COLORS.length], notes: cf.length, guides: items.reduce((a, x) => a + x.guides, 0),
      done, open, words, last, home, homePath: homeInfo.path, spark, progress, items, sDone, sDoing, sAttended, overdue, current, next: upNext };
  });

  const habits = (k) => HABITS.map((hb) => {
    const prog = hb.progress(days[k] || emptyDay(), codes);
    return { key: hb.key, label: hb.label, icon: hb.icon, hint: hb.hint, done: prog.frac >= 1, prog };
  });
  const phase = (k) => habits(k).filter((x) => x.done).length / HABITS.length;

  const milestones = milestoneStatus((texts.plans || []).flatMap((p) => parseMilestones(p.code, p.path, p.text, now)), now);

  return {
    now, today, days, streak: cur, longest, courses, milestones,
    deadlines: parseDeadlines(texts.schedule, now).filter((d) => d.due >= new Date(now.getFullYear(), now.getMonth(), now.getDate())),
    week: weeklyPlan(courses, parseDeadlines(texts.schedule, now), parseWeekTasks(texts.schedule), now, milestones),
    moons: { habits, phase },
    allDeadlines: parseDeadlines(texts.schedule, now),
    settings: st,
    pomo: ctx.pomo,
    backup: ctx.backup || null,
  };
}

function withGame(model) { model.game = computeGame(model); return model; }
