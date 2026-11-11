/* ───────────────────────────── pomodoro helpers ───────────────────────────── */

function pomoLeft(p, now) {
  if (!p || p.mode === 'idle') return 0;
  return p.paused ? p.left : Math.max(0, p.endsAt - now);
}
const fmtClock = (ms) => `${pad(Math.floor(ms / 60000))}:${pad(Math.floor((ms % 60000) / 1000))}`;

// Two soft sine notes, generated on the fly so no audio file is needed.
function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [[880, 0], [1318.5, 0.2]].forEach(([freq, at]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      const t0 = ctx.currentTime + at;
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
      o.connect(g).connect(ctx.destination);
      o.start(t0); o.stop(t0 + 1);
    });
    setTimeout(() => ctx.close(), 1600);
  } catch (e) { console.warn('[term-compass] chime failed', e); }
}

// Rising arpeggio for level-ups and unlocks.
function fanfare(notes) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    (notes || [523.3, 659.3, 784, 1046.5]).forEach((freq, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      const t0 = ctx.currentTime + i * 0.11;
      o.type = 'triangle'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(t0); o.stop(t0 + 0.6);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch (e) { console.warn('[term-compass] fanfare failed', e); }
}

// Stacked glass toasts in the bottom-right corner (game feedback, separate from Obsidian notices).
function gameToast(icon, title, sub, kind, onClick) {
  let host = document.querySelector('.sp-toasts');
  if (!host) host = h('div', 'sp-toasts', document.body);
  const el = h('div', 'sp-toast' + (kind ? ' is-' + kind : ''), host);
  h('div', 'sp-toast-icon', el, icon);
  const tx = h('div', '', el);
  h('div', 'sp-toast-title', tx, title);
  if (sub) h('div', 'sp-toast-sub', tx, sub);
  if (onClick) { el.classList.add('is-click'); el.onclick = () => { onClick(); el.remove(); }; }
  setTimeout(() => el.classList.add('is-out'), onClick ? 9000 : 5200);
  setTimeout(() => el.remove(), onClick ? 9600 : 5800);
}

// macOS notification centre; shows even when Obsidian is behind other apps.
function systemNotify(title, body) {
  if (!('Notification' in window) || Notification.permission === 'denied') return;
  if (Notification.permission === 'granted') { new Notification(title, { body, silent: true }); return; }
  Notification.requestPermission().then((perm) => { if (perm === 'granted') new Notification(title, { body, silent: true }); });
}

/* ───────────────────────────── renderers ───────────────────────────── */

function card(parent, icon, title, sub, badge) {
  const c = h('section', 'sp-card', parent);
  const head = h('div', 'sp-card-head', c);
  h('div', 'sp-card-icon', head, icon);
  const t = h('div', 'sp-card-titles', head);
  h('div', 'sp-card-title', t, title);
  if (sub) h('div', 'sp-card-sub', t, sub);
  if (badge) h('div', 'sp-badge', head, badge);
  return h('div', 'sp-card-body', c);
}

function chips(parent, items, active, onPick, cls) {
  const row = h('div', 'sp-chips ' + (cls || ''), parent);
  for (const [val, label] of items) {
    const b = h('button', 'sp-chip' + (val === active ? ' is-active' : ''), row, label);
    b.onclick = () => onPick(val);
  }
  return row;
}
