// ── 校园场景：天空跟着时间，树跟着季节，钟楼显示真实时间。
function sceneDeco(model) {
  return Object.assign({}, model.game, { sound: model.settings.sound, streak: model.streak, term: termLabel(model.now), today: model.today });
}

function renderScene(parent, now, compact, size, deco) {
  const H = compact ? 40 : 52;
  const wrap = h('div', 'sp-scene' + (compact ? ' is-compact' : ''), parent);
  // Widen the viewBox to the pane's aspect ratio so wide panes show more scenery instead of cropping the sky.
  const cw = size ? size.w : wrap.clientWidth, ch = size ? size.h : wrap.clientHeight;
  const W = Math.max(192, Math.round((H * (cw || 0)) / (ch || 1)));
  // Code blocks render before they are attached; redraw once the real size is known.
  if (!cw) requestAnimationFrame(() => {
    if (!wrap.isConnected || !wrap.clientWidth) return;
    wrap.replaceWith(renderScene(document.createElement('div'), now, compact, { w: wrap.clientWidth, h: wrap.clientHeight }, deco));
  });
  const ox = Math.floor((W - 192) / 2);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMax slice', 'shape-rendering': 'crispEdges' }, wrap);
  const px = (x, y, w, hh, fill, g) => s('rect', { x, y, width: w, height: Math.max(0, hh), fill }, g || svg);
  let town = null; // created after the sky and hills so buildings paint on top
  const tpx = (x, y, w, hh, fill, g) => px(x, y, w, hh, fill, g || town);
  const rnd = mulberry32(7);
  const hr = now.getHours() + now.getMinutes() / 60;
  const month = now.getMonth() + 1;
  const phase = scenePhase(now, deco);
  const SKY = {
    night: ['#0b1230', '#1b2756', '#2e3c78'], dawn: ['#9fb8e6', '#f6c9b0', '#f7a98f'],
    day: ['#5d9bd8', '#9cc7ef', '#d8ecfb'], dusk: ['#36306e', '#b0607f', '#f2a66a'],
  }[phase];
  const ground = H - 14;

  // Dithered sky bands
  const bands = Math.ceil(ground / 3);
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    const col = t < 0.5 ? lerpColor(SKY[0], SKY[1], t * 2) : lerpColor(SKY[1], SKY[2], (t - 0.5) * 2);
    px(0, i * 3, W, 3, col);
    if (i % 2) for (let x = (i * 5) % 7; x < W; x += 7) px(x, i * 3 + 2, 1, 1, lerpColor(col, SKY[Math.min(2, Math.floor(t * 2) + 1)], 0.5));
  }

  if (phase === 'night') {
    for (let i = 0; i < 40; i++) px(Math.floor(rnd() * W), Math.floor(rnd() * (ground - 12)), 1, 1, rnd() > 0.7 ? '#fff7c2' : '#c9d4ff');
  }

  // Sun or moon on an arc
  const isNight = phase === 'night';
  const t = isNight ? ((hr + 4) % 24) / 9 : Math.min(1, Math.max(0, (hr - 5) / 15));
  const cx = Math.round(14 + t * (W - 28));
  const cy = Math.round(8 + Math.pow(t - 0.5, 2) * 40);
  const r = 4;
  // Click the sun / moon to flip between day and night.
  const sunG = hitGroup(svg, () => {
    blip(deco, [[isNight ? 523 : 392, 0, 0.12], [isNight ? 784 : 262, 0.12, 0.2]], 'sine');
    wrap.replaceWith(renderScene(document.createElement('div'), now, compact, { w: wrap.clientWidth, h: wrap.clientHeight }, Object.assign({}, deco, { forcePhase: isNight ? 'day' : 'night' })));
  }, isNight ? '月亮：点一下天亮' : '太阳：点一下天黑');
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.round(Math.sqrt(r * r - dy * dy));
    px(cx - w, cy + dy, 2 * w + 1, 1, isNight ? '#f4efd2' : phase === 'day' ? '#ffd75e' : '#ffb36b', sunG);
  }
  if (isNight) { px(cx + 1, cy - 2, 2, 2, '#d8d2b0', sunG); px(cx - 2, cy + 1, 1, 1, '#d8d2b0', sunG); }
  else for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    px(Math.round(cx + Math.cos(a) * 7), Math.round(cy + Math.sin(a) * 7), 1, 1, '#ffe9a0', sunG);
  }

  // Clouds drifting
  const cloudCol = { night: '#3a4677', dawn: '#ffe3d6', day: '#ffffff', dusk: '#f0b7b0' }[phase];
  const CLOUD = ['..xxxx......', '.xxxxxxx.xx.', 'xxxxxxxxxxxx', '.xxxxxxxxxx.'];
  const cloudN = Math.max(4, Math.round(W / 48));
  for (let i = 0; i < cloudN; i++) {
    const x0 = Math.round((i / cloudN) * W), y0 = 3 + ((i * 7) % 12), delay = -((i * 37) % 90);
    const g = s('g', { class: 'sp-cloud', style: `--sp-d:${W + 60}px;animation-delay:${delay}s;animation-duration:${110 + (i % 4) * 25}s` }, svg);
    CLOUD.forEach((row, ry) => [...row].forEach((ch, rx) => { if (ch === 'x') px(x0 + rx * 2, y0 + ry * 2, 2, 2, cloudCol, g); }));
  }

  // Distant hills
  const hill = { night: '#1d2a52', dawn: '#a4a9c9', day: '#9db7d0', dusk: '#6a5a8c' }[phase];
  for (let x = 0; x < W; x += 2) {
    const hh = 4 + Math.round(3 * Math.sin(x / 17) + 2 * Math.sin(x / 7 + 1));
    px(x, ground - hh, 2, hh, hill);
  }

  // A generic campus: main hall with a clock tower, a domed library, a modern block, a dorm.
  const stone = { night: '#28305a', dawn: '#d9c3b0', day: '#e8dcc6', dusk: '#8d6f86' }[phase];
  const shade = { night: '#1c2246', dawn: '#b9a08f', day: '#c9b79c', dusk: '#6e5470' }[phase];
  const roof = { night: '#2a2440', dawn: '#a86e5e', day: '#b5654d', dusk: '#6b4560' }[phase];
  const glass = { night: '#2b3a6e', dawn: '#a9bfe0', day: '#8fb6dc', dusk: '#6a6c9e' }[phase];
  const win = isNight ? '#ffd76a' : phase === 'day' ? '#7d8fae' : '#5a4b6c';
  town = s('g', { transform: `translate(${ox} 0)` }, svg);
  // Main hall, two wings and a central clock tower
  const hx = 70, tx = 93;
  tpx(hx, ground - 10, 52, 10, stone);
  tpx(hx - 1, ground - 11, 54, 1, shade);
  tpx(tx, ground - 24, 8, 24, stone);
  tpx(tx - 1, ground - 25, 10, 1, shade);
  for (let k = 0; k < 4; k++) tpx(tx + k, ground - 26 - k, 8 - 2 * k, 1, roof);
  tpx(tx + 3.5, ground - 31, 1, 2, shade);
  // The clock shows the real hour.
  const ccx = tx + 4, ccy = ground - 19;
  tpx(ccx - 2, ccy - 2, 5, 5, '#f4efd2'); tpx(ccx - 2.5, ccy - 1.5, 6, 3, '#f4efd2');
  const ang = ((now.getHours() % 12) + now.getMinutes() / 60) / 12 * Math.PI * 2;
  tpx(ccx, ccy, 1, 1, '#2b2f4a');
  tpx(ccx + Math.round(Math.sin(ang) * 1.6), ccy - Math.round(Math.cos(ang) * 1.6), 1, 1, '#2b2f4a');
  tpx(ccx, ccy - 2, 1, 1, '#2b2f4a');
  tpx(tx + 3, ground - 4, 2, 4, shade);
  const lit = isNight || SCENE_STATE.lit;
  const winG = hitGroup(town, () => { SCENE_STATE.lit = !SCENE_STATE.lit; blip(deco, [[988, 0, 0.06], [1318, 0.07, 0.08]]); [...winG.querySelectorAll('rect')].forEach((el) => el.setAttribute('fill', SCENE_STATE.lit || isNight ? '#ffd76a' : win)); }, '教学楼：点亮窗户');
  for (let k = 0; k < 10; k++) { const x = hx + 3 + k * 5 + (k >= 5 ? 2 : 0); if (x < tx - 1 || x > tx + 8) tpx(x, ground - 8, 2, 5, lit ? '#ffd76a' : win, winG); }
  for (let k = 0; k < 2; k++) tpx(tx + 1.5 + k * 3, ground - 14, 2, 3, lit ? '#ffd76a' : win, winG);
  // Domed library with columns
  const lx = 36;
  tpx(lx, ground - 8, 26, 8, stone);
  tpx(lx - 1, ground - 9, 28, 1, shade);
  for (let dy = 0; dy < 5; dy++) { const w = Math.round(Math.sqrt(25 - dy * dy) * 1.4); tpx(lx + 13 - w, ground - 10 - dy, 2 * w, 1, dy === 4 ? shade : glass); }
  tpx(lx + 12.5, ground - 16, 1, 2, shade);
  for (let k = 0; k < 6; k++) tpx(lx + 2 + k * 4.4, ground - 7, 1.4, 7, shade);
  // Modern teaching block
  const mx = 130;
  tpx(mx, ground - 17, 18, 17, shade);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) tpx(mx + 1.5 + c * 4, ground - 15 + r * 4, 3, 2.5, isNight && (r + c) % 3 ? '#ffd76a' : glass);
  // Dorm with a pitched roof
  const dx0 = 154;
  tpx(dx0, ground - 8, 14, 8, stone);
  for (let k = 0; k < 4; k++) tpx(dx0 - 1 + k * 1.5, ground - 9 - k, 16 - 3 * k, 1, roof);
  tpx(dx0 + 3, ground - 6, 2, 3, win); tpx(dx0 + 9, ground - 6, 2, 3, win);

  // Seasonal trees
  const palette = month >= 9 && month <= 11 ? ['#d9692f', '#e8a23a', '#b8442c', '#c98b2e']
    : month === 12 || month <= 2 ? ['#9aa3b5', '#c8d0de', '#eef2f8', '#7d8698']
      : month <= 5 ? ['#f2a7c3', '#e889ab', '#8cc56b', '#f7c6d8'] : ['#4f9a4c', '#6cb35d', '#3d7f3f', '#86c470'];
  const trunk = isNight ? '#2a2233' : '#6b4a35';
  const treeAt = [4, 14, 26, 33, 70, 120, 146, 172, 184].map((x) => x + ox);
  for (let x = ox - 10; x > 2; x -= 9 + Math.floor(rnd() * 8)) treeAt.push(x);
  for (let x = ox + 196; x < W - 2; x += 9 + Math.floor(rnd() * 8)) treeAt.push(x);
  treeAt.forEach((x, i) => {
    const tr = 3 + (i % 3);
    // Click a tree and a handful of leaves falls.
    const tg = hitGroup(svg, () => { burst(svg, x, ground - 3 - tr, palette, 10, tr + 2, true); blip(deco, [[[700, 400], 0, 0.15]], 'sine'); }, '树');
    px(x - tr, ground - 3 - 2 * tr, 2 * tr + 1, 2 * tr + 3, 'transparent', tg);
    px(x, ground - 3, 1, 3, trunk);
    for (let dy = -tr; dy <= tr; dy++) {
      const w = Math.round(Math.sqrt(tr * tr - dy * dy));
      for (let dx = -w; dx <= w; dx++) {
        if (rnd() > 0.15) px(x + dx, ground - 3 - tr + dy, 1, 1, isNight ? lerpColor(palette[Math.floor(rnd() * 4)], '#1b2040', 0.6) : palette[Math.floor(rnd() * 4)]);
      }
    }
  });

  // Bank + river
  px(0, ground, W, 2, isNight ? '#253025' : '#6f9a54');
  const water = { night: ['#141d40', '#24306a'], dawn: ['#9bb4dc', '#f3c2b0'], day: ['#4f8cc9', '#8fc1ea'], dusk: ['#4a3f7d', '#d58a84'] }[phase];
  for (let y = ground + 2; y < H; y++) px(0, y, W, 1, lerpColor(water[0], water[1], (y - ground) / 14 * 0.6));
  for (let i = 0; i < 26; i++) {
    const g = s('g', { class: 'sp-shimmer', style: `animation-delay:${(i % 7) * 0.6}s` }, svg);
    px(Math.floor(rnd() * W), ground + 3 + Math.floor(rnd() * 10), 3 + Math.floor(rnd() * 4), 1, water[1], g);
  }
  // A rowing boat, and a duck
  const punt = s('g', { class: 'sp-punt' }, svg);
  const puntHit = hitGroup(punt, () => { punt.classList.toggle('is-fast'); sceneBubble(svg, ox + 27, ground + 1, punt.classList.contains('is-fast') ? '划快点！' : '慢慢划～'); blip(deco, [[[220, 330], 0, 0.15]], 'triangle'); }, '小船');
  const pu = ox + 20;
  px(pu, ground + 7, 13, 2, '#7a4b2a', puntHit); px(pu + 1, ground + 9, 11, 1, '#5a361e', puntHit);
  px(pu + 6, ground + 3, 2, 4, isNight ? '#3a3350' : '#d0573f', puntHit); px(pu + 6, ground + 2, 2, 1, '#f1c9a5', puntHit);
  px(pu + 2, ground + 6, 4, 1, '#a0886c', puntHit); px(pu + 8, ground + 6, 4, 1, '#a0886c', puntHit);
  px(pu + 1, ground + 7, 1, 2, '#a0886c', puntHit); px(pu + 12, ground + 7, 1, 2, '#a0886c', puntHit);
  const duck = s('g', { class: 'sp-duck' }, svg);
  const du = ox + 150;
  // Click the duck: it quacks and hops.
  const duckHit = hitGroup(duck, () => {
    blip(deco, [[[620, 420], 0, 0.09], [[600, 380], 0.13, 0.09]]);
    const b = duckHit.getBoundingClientRect(), p = svgPoint(svg, { clientX: b.x + b.width / 2, clientY: b.y });
    sceneBubble(svg, p.x, p.y - 1, '嘎！');
    duckHit.classList.remove('sp-jump'); void duckHit.getBoundingClientRect(); duckHit.classList.add('sp-jump');
  }, '小鸭子');
  px(du - 1, ground + 5, 8, 6, 'transparent', duckHit);
  px(du, ground + 8, 4, 2, '#ffd23f', duckHit); px(du + 3, ground + 6, 2, 2, '#ffd23f', duckHit); px(du + 5, ground + 7, 1, 1, '#f08a24', duckHit);

  svg.addEventListener('click', (e) => {
    const p = svgPoint(svg, e);
    if (p.y > ground - 4) return;
    burst(svg, p.x, p.y, ['#ffd75e', '#ff7aa8', '#7ad0ff', '#9be27a', '#ffffff'], 18, 6);
    blip(deco, [[[180, 90], 0, 0.15], [[1200, 900], 0.1, 0.2]], 'triangle');
  });
  // ── Level unlocks (see UNLOCKS)
  const has = (key) => !!(deco && deco.has && deco.has.has(`scene:${key}`));
  if (has('flags')) [[tx + 3.5, ground - 31, '#5b6bd5'], [lx + 12.5, ground - 16, '#e07a5f'], [mx + 8, ground - 17, '#3d9a8b']].forEach(([x, top, col]) => {
    tpx(x, top - 6, 1, 6, '#5a4b3a'); tpx(x + 1, top - 6, 4, 2, col); tpx(x + 1, top - 4, 3, 1, col);
  });
  if (has('rainbow') && phase === 'day') ['#ff6b6b', '#ffb36b', '#ffe26b', '#7bd67b', '#6bb6ff', '#a98bff'].forEach((col, k) => {
    s('path', { d: `M${W * 0.08} ${ground} A ${30 - k * 2} ${26 - k * 2} 0 0 1 ${W * 0.08 + 2 * (30 - k * 2)} ${ground}`, fill: 'none', stroke: col, 'stroke-width': 1.6, opacity: 0.35 }, svg);
  });
  if (has('aurora') && isNight) ['#5cf2b0', '#5cc8f2'].forEach((col, k) => {
    s('path', { d: `M0 ${10 + k * 4} Q ${W * 0.25} ${2 + k * 6} ${W * 0.5} ${9 + k * 3} T ${W} ${6 + k * 4}`, fill: 'none', stroke: col, 'stroke-width': 3, opacity: 0.22, class: 'sp-aurora' }, svg);
  });
  if (has('lamps')) for (let x = 6; x < W - 4; x += 26) {
    px(x, ground - 4, 1, 4, '#4a4040');
    if (isNight) s('circle', { cx: x + 0.5, cy: ground - 4.5, r: 2.4, fill: '#ffd76a', opacity: 0.28 }, svg);
    px(x - 0.5, ground - 5, 2, 1.5, isNight ? '#ffe08a' : '#c9b26a');
  }
  if (has('bikes')) [ox + 60, ox + 144, ox + 150].forEach((x) => {
    px(x, ground - 2, 2, 2, '#2b2f4a'); px(x + 4, ground - 2, 2, 2, '#2b2f4a'); px(x + 1, ground - 3, 4, 1, '#c0392b'); px(x + 4, ground - 4, 1, 1, '#2b2f4a');
  });
  if (has('boat2')) {
    const p2 = s('g', { class: 'sp-punt sp-punt2' }, svg), b = ox + 120;
    px(b, ground + 10, 12, 2, '#8a5a32', p2); px(b + 1, ground + 12, 10, 1, '#5a361e', p2);
    px(b + 5, ground + 6, 2, 4, isNight ? '#4a3a5a' : '#2f6fb3', p2); px(b + 5, ground + 5, 2, 1, '#f1c9a5', p2);
    px(b + 1, ground + 9, 4, 1, '#a0886c', p2); px(b + 7, ground + 9, 4, 1, '#a0886c', p2);
  }
  if (has('rowing')) {
    const rw = s('g', { class: 'sp-rowing' }, svg), b = ox + 30;
    px(b, ground + 12, 22, 1, '#e8e2d0', rw);
    for (let k = 0; k < 4; k++) { px(b + 3 + k * 5, ground + 10, 1, 2, '#2f6fb3', rw); px(b + 2 + k * 5, ground + 12, 1, 2, '#a0886c', rw); }
  }
  if (has('swans')) {
    const sw = s('g', { class: 'sp-duck sp-swan' }, svg), sx = ox + 80;
    px(sx, ground + 10, 5, 2, '#ffffff', sw); px(sx + 4, ground + 6, 1, 4, '#ffffff', sw); px(sx + 5, ground + 6, 1, 1, '#f08a24', sw);
  }
  if (has('kite') && !isNight) {
    const kt = s('g', { class: 'sp-kite' }, svg), kx = Math.round(W * 0.22), ky = 12;
    [[0, -2], [-1, -1], [0, -1], [1, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]].forEach(([dx, dy]) => px(kx + dx, ky + dy, 1, 1, dx + dy > 0 ? '#e0573f' : '#ffd23f', kt));
    for (let k = 1; k < 10; k++) px(kx + k, ky + 2 + k * 2, 1, 1, '#ffffff', kt);
  }
  if (has('balloon')) {
    const bl = s('g', { class: 'sp-balloon' }, svg), bx = Math.round(W * 0.7), by = 8;
    for (let dy = -4; dy <= 4; dy++) {
      const w = Math.round(Math.sqrt(16 - dy * dy));
      for (let dx = -w; dx <= w; dx++) px(bx + dx, by + dy, 1, 1, Math.abs(dx) % 3 === 0 ? '#ffffff' : '#e0573f', bl);
    }
    px(bx - 1, by + 7, 3, 2, '#7a4b2a', bl); px(bx - 2, by + 5, 1, 2, '#7a4b2a', bl); px(bx + 2, by + 5, 1, 2, '#7a4b2a', bl);
  }
  if (has('fireflies') && isNight) for (let k = 0; k < 14; k++) {
    const ff = s('g', { class: 'sp-firefly', style: `animation-delay:${(k % 5) * 0.7}s` }, svg);
    px(Math.floor(rnd() * W), ground - 2 - Math.floor(rnd() * 8), 1, 1, '#eaff7a', ff);
  }
  if (has('meteor') && isNight) {
    const mt = s('g', { class: 'sp-meteor' }, svg), mx0 = Math.round(W * 0.6);
    for (let k = 0; k < 5; k++) px(mx0 + k * 2, 4 + k, 2, 1, k === 4 ? '#ffffff' : '#c9d4ff', mt);
  }
  if (has('skylanterns') && isNight) for (let k = 0; k < 5; k++) {
    const sl = s('g', { class: 'sp-skylantern', style: `animation-delay:${k * 2.3}s` }, svg);
    px(Math.round(W * (0.15 + k * 0.17)), ground - 6, 2, 2, '#ffb04a', sl);
  }
  if (has('fireworks') && isNight) [[0.25, 6], [0.55, 4], [0.82, 8]].forEach(([fx, fy], k) => {
    const fw = s('g', { class: 'sp-firework', style: `animation-delay:${k * 1.1}s` }, svg), cx0 = Math.round(W * fx);
    for (let a = 0; a < 8; a++) px(cx0 + Math.round(Math.cos(a * Math.PI / 4) * 4), fy + Math.round(Math.sin(a * Math.PI / 4) * 4), 1, 1, ['#ffd75e', '#ff7aa8', '#7ad0ff'][k], fw);
  });
  return wrap;
}
