/* ───────────────────────────── semester ─────────────────────────────
 * Weeks run Monday to Sunday. Week 1 is the week the term starts in. Term dates
 * come from settings; until they are set, the term is guessed from the date.
 */

let TERM_SETTINGS = { termStart: '', termEnd: '', yearStartMonth: 9 };

/** Called by buildModel with the dashboard settings. */
function useTerm(st) {
  TERM_SETTINGS = { termStart: st.termStart || '', termEnd: st.termEnd || '', yearStartMonth: Number(st.yearStartMonth) || 9 };
}

const monday = (d) => { const x = day0(d); return addDays(x, -((x.getDay() + 6) % 7)); };
const parseYmd = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };

/** The current term. Unset: autumn runs Sep–Jan, spring Feb–Jun. */
function termFor(now) {
  const start = parseYmd(TERM_SETTINGS.termStart), end = parseYmd(TERM_SETTINGS.termEnd);
  if (start && end) return { start, end, guessed: false };
  const y = now.getFullYear(), m = now.getMonth();
  if (m >= 7) return { start: new Date(y, 8, 1), end: new Date(y + 1, 0, 31), guessed: true };
  if (m === 0) return { start: new Date(y - 1, 8, 1), end: new Date(y, 0, 31), guessed: true };
  return { start: new Date(y, 1, 1), end: new Date(y, 5, 30), guessed: true };
}

// Rounded, because a clock change makes one week an hour shorter or longer.
const termWeek = (d, now) => Math.round((monday(d) - monday(termFor(now || d).start)) / 6048e5) + 1;

function termLabel(now) {
  const t = termFor(now);
  if (day0(now) < day0(t.start)) return `开学前 · 还有 ${Math.round((day0(t.start) - day0(now)) / 864e5)} 天`;
  if (day0(now) > day0(t.end)) return `假期 · ${now.getMonth() + 1}月${now.getDate()}日`;
  return `第 ${termWeek(now, now)} 周`;
}
