// ── Pixel scenes: the sky follows the time of day, the trees follow the season.
/* ── scene helpers ── */

// Session memory for toggles (the lit windows) so periodic redraws keep them.
const SCENE_STATE = { lit: false };

function svgPoint(svg, e) {
  const p = svg.createSVGPoint();
  p.x = e.clientX; p.y = e.clientY;
  const m = svg.getScreenCTM();
  return m ? p.matrixTransform(m.inverse()) : { x: 0, y: 0 };
}

function hitGroup(parent, onClick, title) {
  const g = s('g', { class: 'sp-hit' }, parent);
  if (title) s('title', {}, g).textContent = title;
  g.addEventListener('click', (e) => { e.stopPropagation(); onClick(e); });
  return g;
}

function sceneBubble(svg, x, y, text) {
  const g = s('g', { class: 'sp-bubble' }, svg);
  const w = [...text].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? 4.2 : 2.5), 4);
  s('rect', { x: x - w / 2, y: y - 7, width: w, height: 6, rx: 1.5, fill: '#ffffff', opacity: 0.94 }, g);
  s('rect', { x: x - 0.8, y: y - 1.2, width: 1.6, height: 1.4, fill: '#ffffff', opacity: 0.94 }, g);
  const tx = s('text', { x, y: y - 2.6, 'text-anchor': 'middle', class: 'sp-bubble-text' }, g);
  tx.textContent = text;
  setTimeout(() => g.remove(), 1900);
}

function burst(svg, x, y, colors, n, spread, fall) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, d = (0.4 + Math.random()) * spread;
    const dx = Math.cos(a) * d, dy = fall ? Math.abs(Math.sin(a)) * d + 4 : Math.sin(a) * d;
    const r = s('rect', { x, y, width: 1, height: 1, fill: colors[i % colors.length], class: 'sp-particle',
      style: `--dx:${dx.toFixed(1)}px;--dy:${dy.toFixed(1)}px;animation-duration:${(0.8 + Math.random() * 0.7).toFixed(2)}s` }, svg);
    setTimeout(() => r.remove(), 1600);
  }
}

function blip(deco, notes, type) {
  if (deco && deco.sound === false) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    notes.forEach(([freq, at, dur], i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      const t0 = ctx.currentTime + at;
      o.type = type || 'square'; o.frequency.setValueAtTime(freq[0] || freq, t0);
      if (freq[1]) o.frequency.exponentialRampToValueAtTime(freq[1], t0 + dur);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + dur + 0.05);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch (e) { console.warn('[term-compass] blip failed', e); }
}

function scenePhase(now, deco) {
  if (deco && deco.forcePhase) return deco.forcePhase;
  const hr = now.getHours() + now.getMinutes() / 60;
  return hr < 5 || hr >= 20 ? 'night' : hr < 8 ? 'dawn' : hr < 17 ? 'day' : 'dusk';
}

const SKY_COLORS = { night: ['#0b1230', '#1b2756', '#2e3c78'], dawn: ['#9fb8e6', '#f6c9b0', '#f7a98f'],
  day: ['#5d9bd8', '#9cc7ef', '#d8ecfb'], dusk: ['#36306e', '#b0607f', '#f2a66a'] };

function leafPalette(month) {
  return month >= 9 && month <= 11 ? ['#d9692f', '#e8a23a', '#b8442c', '#c98b2e']
    : month === 12 || month <= 2 ? ['#9aa3b5', '#c8d0de', '#eef2f8', '#7d8698']
      : month <= 5 ? ['#f2a7c3', '#e889ab', '#8cc56b', '#f7c6d8'] : ['#4f9a4c', '#6cb35d', '#3d7f3f', '#86c470'];
}
