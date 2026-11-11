/* ───────────────────────────── utils ───────────────────────────── */

const pad = (n) => String(n).padStart(2, '0');
const dkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const day0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const fmt1 = (n) => (Math.round(n * 10) / 10).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function emptyDay() {
  return { words: 0, pasted: 0, notes: 0, edits: 0, tasks: 0, focus: 0, poms: 0, activeMin: 0, readSec: 0,
    hours: new Array(24).fill(0), files: {}, fileStats: {}, created: [], areas: {}, sessions: [], reading: 0 };
}

/**
 * Net per-file accounting for one day. Each file keeps typed (t) and pasted or
 * tool-written (p) words added today; deletions remove pasted words first, then typed ones, and a
 * file never goes below zero (deleting older text is not "negative writing").
 */
function applyWordDelta(d, path, area, delta, typed) {
  const st = d.fileStats[path] || (d.fileStats[path] = { t: 0, p: 0, area });
  if (delta > 0 && typed && delta <= PASTE_WORDS) st.t += delta;
  else if (delta > 0) st.p += delta;
  else if (delta < 0) {
    const fromPaste = Math.min(st.p, -delta);
    st.p -= fromPaste;
    st.t = Math.max(0, st.t - (-delta - fromPaste));
  }
  d.words = 0; d.pasted = 0; d.areas = {};
  for (const [fp, x] of Object.entries(d.fileStats)) {
    d.words += x.t; d.pasted += x.p;
    d.files[fp] = x.t + x.p;
    d.areas[x.area] = (d.areas[x.area] || 0) + x.t + x.p * 0.25;
  }
}

function h(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs, parent) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lerpColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = [16, 8, 0].map((sh) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
