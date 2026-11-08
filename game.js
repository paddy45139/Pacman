(() => {
  'use strict';

  // # wall, . pellet, o power pellet, - ghost door, space = empty
  const MAP = [
    '############################',
    '#............##............#',
    '#.####.#####.##.#####.####.#',
    '#o####.#####.##.#####.####o#',
    '#.####.#####.##.#####.####.#',
    '#..........................#',
    '#.####.##.########.##.####.#',
    '#.####.##.########.##.####.#',
    '#......##....##....##......#',
    '######.##### ## #####.######',
    '     #.##### ## #####.#     ',
    '     #.##          ##.#     ',
    '     #.## ###--### ##.#     ',
    '######.## #      # ##.######',
    '      .   #      #   .      ',
    '######.## #      # ##.######',
    '     #.## ######## ##.#     ',
    '     #.##          ##.#     ',
    '     #.## ######## ##.#     ',
    '######.## ######## ##.######',
    '#............##............#',
    '#.####.#####.##.#####.####.#',
    '#.####.#####.##.#####.####.#',
    '#o..##.......  .......##..o#',
    '###.##.##.########.##.##.###',
    '###.##.##.########.##.##.###',
    '#......##....##....##......#',
    '#.##########.##.##########.#',
    '#.##########.##.##########.#',
    '#..........................#',
    '############################',
  ];
  const COLS = MAP[0].length;
  const ROWS = MAP.length;

  const UP = { x: 0, y: -1 }, DOWN = { x: 0, y: 1 }, LEFT = { x: -1, y: 0 }, RIGHT = { x: 1, y: 0 };
  const DIR_ORDER = [UP, LEFT, DOWN, RIGHT];
  const PLAYER_START = { x: 13, y: 23 };
  const HOUSE_DOOR = { x: 13, y: 11 };
  const HOUSE_CENTER = { x: 13, y: 14 };
  const PLAYER_SPEED = 7.5;
  const FRIGHT_TIME = 7;
  const FLASH_TIME = 2;
  const FONT = '"Lucida Console", "Courier New", monospace';

  const GHOST_DEFS = [
    { name: 'blinky', color: '#ff3b4e', start: { x: 13, y: 11 }, inHouse: false, release: 0, scatter: { x: 25, y: -3 } },
    { name: 'pinky', color: '#ff8de1', start: { x: 13, y: 14 }, inHouse: true, release: 1, scatter: { x: 2, y: -3 } },
    { name: 'inky', color: '#3ff2ff', start: { x: 11, y: 14 }, inHouse: true, release: 4, scatter: { x: 27, y: 32 } },
    { name: 'clyde', color: '#ffad47', start: { x: 15, y: 14 }, inHouse: true, release: 7, scatter: { x: 0, y: 32 } },
  ];

  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const mazeCanvas = document.createElement('canvas');
  const mctx = mazeCanvas.getContext('2d');
  const menuArt = $('menu-art');
  const actx = menuArt.getContext('2d');
  const ui = {
    hud: $('hud'), score: $('score'), high: $('high'), level: $('level'), lives: $('lives'),
    menu: $('menu'), pause: $('pause'), over: $('gameover'),
    finalScore: $('final-score'), finalHigh: $('final-high'), finalLevel: $('final-level'),
  };

  let T = 20, PAD = 10, dpr = 1;
  let pellets = [], pelletsLeft = 0;
  let player, ghosts = [], particles = [], popups = [];

  const game = {
    state: 'menu', // menu | ready | play | dying | levelDone | over
    paused: false, score: 0, high: loadHigh(), lives: 3, level: 1,
    timer: 0, fright: 0, modeClock: 0, freeze: 0, time: 0,
  };

  function loadHigh() { try { return +localStorage.getItem('neonmaze_high') || 0; } catch (e) { return 0; } }
  function saveHigh() { try { localStorage.setItem('neonmaze_high', game.high); } catch (e) { /* ignore */ } }

  // ---------- Grid helpers ----------
  const wrapC = (c) => ((c % COLS) + COLS) % COLS;
  const tile = (c, r) => (r < 0 || r >= ROWS ? '#' : MAP[r][wrapC(c)]);
  const isWall = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS && MAP[r][c] === '#';
  const open = (c, r) => { const t = tile(c, r); return t !== '#' && t !== '-'; };
  const opposite = (a, b) => a.x === -b.x && a.y === -b.y;

  function resetPellets() {
    pellets = MAP.map((row) => [...row].map((ch) => (ch === '.' ? 1 : ch === 'o' ? 2 : 0)));
    pelletsLeft = pellets.flat().filter(Boolean).length;
  }

  function resetActors() {
    player = { x: PLAYER_START.x, y: PLAYER_START.y, dir: LEFT, next: LEFT, moving: true, mouthT: 0 };
    ghosts = GHOST_DEFS.map((d) => ({
      ...d, x: d.start.x, y: d.start.y, dir: LEFT, state: d.inHouse ? 'house' : 'normal',
      releaseT: d.release, fright: false, bob: Math.random() * 6,
    }));
    game.fright = 0;
    game.modeClock = 0;
    game.freeze = 0;
    particles = [];
    popups = [];
  }

  // Grid movement: advances entity e by dist tiles, calling choose(e, cx, cy) at each tile center.
  function step(e, dist, choose) {
    let guard = 0;
    while (dist > 1e-9 && guard++ < 50) {
      const cx = Math.round(e.x), cy = Math.round(e.y);
      if (Math.abs(e.x - cx) < 1e-6 && Math.abs(e.y - cy) < 1e-6) {
        e.x = cx; e.y = cy;
        if (!choose(e, cx, cy)) return;
      }
      const d = e.dir;
      const tx = d.x > 0 ? Math.floor(e.x) + 1 : d.x < 0 ? Math.ceil(e.x) - 1 : e.x;
      const ty = d.y > 0 ? Math.floor(e.y) + 1 : d.y < 0 ? Math.ceil(e.y) - 1 : e.y;
      const rem = Math.abs(tx - e.x) + Math.abs(ty - e.y);
      if (dist >= rem) {
        e.x = tx; e.y = ty; dist -= rem;
        if (e.x <= -1) e.x += COLS;
        else if (e.x >= COLS) e.x -= COLS;
      } else {
        e.x += d.x * dist; e.y += d.y * dist; dist = 0;
      }
    }
  }

  // Direct movement (used inside the ghost house): horizontal first, then vertical.
  function moveTo(e, tx, ty, dist) {
    const dx = tx - e.x;
    if (dx !== 0) {
      e.dir = dx > 0 ? RIGHT : LEFT;
      if (Math.abs(dx) > dist) { e.x += Math.sign(dx) * dist; return false; }
      e.x = tx; dist -= Math.abs(dx);
    }
    const dy = ty - e.y;
    if (dy === 0) return true;
    e.dir = dy > 0 ? DOWN : UP;
    if (Math.abs(dy) > dist) { e.y += Math.sign(dy) * dist; return false; }
    e.y = ty;
    return true;
  }

  // ---------- Player ----------
  function choosePlayer(p, cx, cy) {
    if (p.next && open(cx + p.next.x, cy + p.next.y)) p.dir = p.next;
    p.moving = open(cx + p.dir.x, cy + p.dir.y);
    return p.moving;
  }

  function updatePlayer(dt) {
    const p = player;
    if (p.next && opposite(p.next, p.dir)) { p.dir = p.next; p.moving = true; }
    step(p, PLAYER_SPEED * dt, choosePlayer);
    if (p.moving) p.mouthT += dt;

    const c = wrapC(Math.round(p.x)), r = Math.round(p.y);
    const v = pellets[r] && pellets[r][c];
    if (v) {
      pellets[r][c] = 0;
      pelletsLeft--;
      addScore(v === 2 ? 50 : 10);
      if (v === 2) startFright();
      if (pelletsLeft <= 0) levelComplete();
    }
  }

  // ---------- Ghosts ----------
  function ghostSpeed(g) {
    if (g.state === 'eaten') return 15;
    if (g.state !== 'normal') return 4;
    if (g.fright) return 4.2;
    let s = 6.8 * Math.min(1.3, 1 + 0.05 * (game.level - 1));
    if (Math.round(g.y) === 14 && (g.x < 5.5 || g.x > 21.5)) s *= 0.6;
    return s;
  }

  function ghostTarget(g) {
    if (g.state === 'eaten') return HOUSE_DOOR;
    const p = player;
    const pt = { x: Math.round(p.x), y: Math.round(p.y) };
    const scatter = game.modeClock < 84 && game.modeClock % 28 < 7;
    if (scatter) return g.scatter;
    switch (g.name) {
      case 'blinky': return pt;
      case 'pinky': return { x: pt.x + p.dir.x * 4, y: pt.y + p.dir.y * 4 };
      case 'inky': return Math.random() < 0.35 ? null : { x: pt.x + p.dir.x * 2, y: pt.y + p.dir.y * 2 };
      default: return (g.x - p.x) ** 2 + (g.y - p.y) ** 2 > 64 ? pt : g.scatter;
    }
  }

  function chooseGhost(g, cx, cy) {
    if (g.state === 'eaten' && cx === HOUSE_DOOR.x && cy === HOUSE_DOOR.y) { g.state = 'enter'; return false; }
    let opts = DIR_ORDER.filter((d) => !opposite(d, g.dir) && open(cx + d.x, cy + d.y));
    if (!opts.length) opts = [{ x: -g.dir.x, y: -g.dir.y }];
    const target = g.fright ? null : ghostTarget(g);
    if (!target) { g.dir = opts[Math.floor(Math.random() * opts.length)]; return true; }
    let best = opts[0], bestD = Infinity;
    for (const d of opts) {
      const dx = cx + d.x - target.x, dy = cy + d.y - target.y, dd = dx * dx + dy * dy;
      if (dd < bestD) { bestD = dd; best = d; }
    }
    g.dir = best;
    return true;
  }

  function updateGhost(g, dt) {
    const dist = ghostSpeed(g) * dt;
    switch (g.state) {
      case 'house':
        g.bob += dt;
        g.y = g.start.y + Math.sin(g.bob * 5) * 0.25;
        if ((g.releaseT -= dt) <= 0) g.state = 'leave';
        break;
      case 'leave':
        if (moveTo(g, HOUSE_DOOR.x, HOUSE_DOOR.y, dist)) { g.state = 'normal'; g.dir = LEFT; }
        break;
      case 'enter':
        if (moveTo(g, HOUSE_CENTER.x, HOUSE_CENTER.y, dist)) g.state = 'leave';
        break;
      default:
        step(g, dist, chooseGhost);
    }
  }

  function startFright() {
    game.fright = FRIGHT_TIME;
    for (const g of ghosts) {
      if (g.state === 'eaten' || g.state === 'enter') continue;
      g.fright = true;
      if (g.state === 'normal') g.dir = { x: -g.dir.x, y: -g.dir.y };
    }
  }

  function checkCollisions() {
    for (const g of ghosts) {
      if (g.state !== 'normal' && g.state !== 'leave') continue;
      let dx = Math.abs(g.x - player.x);
      dx = Math.min(dx, COLS - dx);
      const dy = Math.abs(g.y - player.y);
      if (dx * dx + dy * dy < 0.36) {
        if (g.fright) eatGhost(g);
        else { die(); return; }
      }
    }
  }

  function eatGhost(g) {
    g.state = 'eaten';
    g.fright = false;
    addScore(200);
    popups.push({ x: g.x, y: g.y, text: '200', life: 1 });
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 5;
      particles.push({ x: g.x, y: g.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6 + Math.random() * 0.4, color: i % 2 ? '#3d5bff' : '#bfe0ff' });
    }
    game.freeze = 0.4;
  }

  // ---------- Game flow ----------
  function addScore(n) {
    game.score += n;
    if (game.score > game.high) { game.high = game.score; saveHigh(); }
    updateHud();
  }

  function startGame() {
    if (game.state !== 'menu' && game.state !== 'over') return;
    game.score = 0; game.lives = 3; game.level = 1; game.paused = false;
    resetPellets();
    resetActors();
    game.state = 'ready'; game.timer = 2;
    ui.menu.classList.add('hidden'); ui.over.classList.add('hidden'); ui.pause.classList.add('hidden');
    document.activeElement && document.activeElement.blur();
    updateHud();
  }

  function die() {
    game.state = 'dying';
    game.timer = 1.6;
    game.lives--;
    updateHud();
  }

  function levelComplete() {
    game.state = 'levelDone';
    game.timer = 2.2;
  }

  function gameOver() {
    game.state = 'over';
    saveHigh();
    ui.finalScore.textContent = game.score;
    ui.finalHigh.textContent = game.high;
    ui.finalLevel.textContent = game.level;
    ui.over.classList.remove('hidden');
  }

  function togglePause() {
    if (!['ready', 'play', 'dying', 'levelDone'].includes(game.state)) return;
    game.paused = !game.paused;
    ui.pause.classList.toggle('hidden', !game.paused);
  }

  function updateHud() {
    ui.score.textContent = game.score;
    ui.high.textContent = game.high;
    ui.level.textContent = game.level;
    ui.lives.innerHTML = '<i class="life"></i>'.repeat(Math.max(0, game.lives));
  }

  function update(dt) {
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; p.life -= dt; }
    particles = particles.filter((p) => p.life > 0);
    for (const p of popups) { p.y -= dt * 0.8; p.life -= dt; }
    popups = popups.filter((p) => p.life > 0);

    switch (game.state) {
      case 'ready':
        if ((game.timer -= dt) <= 0) game.state = 'play';
        break;
      case 'play':
        if (game.freeze > 0) { game.freeze -= dt; break; }
        if (game.fright > 0) {
          game.fright -= dt;
          if (game.fright <= 0) ghosts.forEach((g) => { g.fright = false; });
        } else {
          game.modeClock += dt;
        }
        updatePlayer(dt);
        if (game.state !== 'play') break;
        checkCollisions();
        if (game.state !== 'play') break;
        ghosts.forEach((g) => updateGhost(g, dt));
        checkCollisions();
        break;
      case 'dying':
        if ((game.timer -= dt) <= 0) {
          if (game.lives <= 0) gameOver();
          else { resetActors(); game.state = 'ready'; game.timer = 1.6; }
        }
        break;
      case 'levelDone':
        if ((game.timer -= dt) <= 0) {
          game.level++;
          resetPellets();
          resetActors();
          game.state = 'ready'; game.timer = 1.6;
          updateHud();
        }
        break;
    }
  }

  // ---------- Rendering ----------
  function resize() {
    const aw = window.innerWidth - 16;
    const ah = window.innerHeight - ui.hud.offsetHeight - 24;
    T = Math.max(8, Math.floor(Math.min(aw / (COLS + 1), ah / (ROWS + 1))));
    PAD = T / 2;
    dpr = window.devicePixelRatio || 1;
    const W = COLS * T + PAD * 2, H = ROWS * T + PAD * 2;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ui.hud.style.width = W + 'px';
    document.documentElement.style.setProperty('--t', T + 'px');
    buildMaze(W, H);
  }

  function buildMaze(W, H) {
    mazeCanvas.width = canvas.width;
    mazeCanvas.height = canvas.height;
    const m = mctx;
    m.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = m.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
    bg.addColorStop(0, '#0a1030');
    bg.addColorStop(1, '#02030a');
    m.fillStyle = bg;
    m.fillRect(0, 0, W, H);
    m.translate(PAD, PAD);

    m.fillStyle = 'rgba(40, 80, 200, 0.12)';
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (isWall(c, r)) m.fillRect(c * T, r * T, T, T);

    m.beginPath();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!isWall(c, r)) continue;
        const x = c * T, y = r * T;
        if (!isWall(c, r - 1)) { m.moveTo(x, y); m.lineTo(x + T, y); }
        if (!isWall(c, r + 1)) { m.moveTo(x, y + T); m.lineTo(x + T, y + T); }
        if (!isWall(c - 1, r)) { m.moveTo(x, y); m.lineTo(x, y + T); }
        if (!isWall(c + 1, r)) { m.moveTo(x + T, y); m.lineTo(x + T, y + T); }
      }
    }
    m.lineCap = 'round';
    m.lineJoin = 'round';
    m.strokeStyle = '#2f7dff';
    m.shadowColor = '#2f7dff';
    m.shadowBlur = T * 0.7;
    m.lineWidth = T * 0.16;
    m.stroke();
    m.shadowBlur = 0;
    m.strokeStyle = '#a8ccff';
    m.lineWidth = T * 0.05;
    m.stroke();

    // ghost door
    m.strokeStyle = '#ff8de1';
    m.shadowColor = '#ff8de1';
    m.shadowBlur = T * 0.4;
    m.lineWidth = T * 0.18;
    m.beginPath();
    m.moveTo(13 * T, 12.5 * T);
    m.lineTo(15 * T, 12.5 * T);
    m.stroke();
    m.shadowBlur = 0;
  }

  function drawPac(c, x, y, r, angle, mouth) {
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    c.fillStyle = '#ffe600';
    c.shadowColor = '#ffcc00';
    c.shadowBlur = r * 0.9;
    c.beginPath();
    c.moveTo(0, 0);
    c.arc(0, 0, r, mouth, Math.PI * 2 - mouth);
    c.closePath();
    c.fill();
    c.restore();
  }

  function drawGhost(c, x, y, r, color, dir, look, t) {
    c.save();
    if (look !== 'eyes') {
      const body = look === 'fright' ? '#2b3dff' : look === 'flash' ? '#e8ecff' : color;
      c.fillStyle = body;
      c.shadowColor = body;
      c.shadowBlur = r * 0.9;
      c.beginPath();
      c.arc(x, y - r * 0.15, r, Math.PI, 0);
      const b = y + r * 0.85, n = 6, w = (2 * r) / n, ph = Math.floor(t * 8) % 2;
      c.lineTo(x + r, b);
      for (let i = 1; i <= n; i++) c.lineTo(x + r - i * w, b - ((i + ph) % 2 ? r * 0.28 : 0));
      c.closePath();
      c.fill();
      c.shadowBlur = 0;
    }
    if (look === 'fright' || look === 'flash') {
      const face = look === 'fright' ? '#ffd6d6' : '#ff3355';
      c.fillStyle = face;
      c.fillRect(x - r * 0.45, y - r * 0.4, r * 0.25, r * 0.25);
      c.fillRect(x + r * 0.2, y - r * 0.4, r * 0.25, r * 0.25);
      c.strokeStyle = face;
      c.lineWidth = r * 0.12;
      c.beginPath();
      for (let i = 0; i <= 6; i++) {
        const px = x - r * 0.6 + (i * r * 1.2) / 6, py = y + r * 0.3 + (i % 2 ? -r * 0.12 : r * 0.04);
        if (i) c.lineTo(px, py); else c.moveTo(px, py);
      }
      c.stroke();
    } else {
      for (const s of [-1, 1]) {
        const ex = x + s * r * 0.38, ey = y - r * 0.25;
        c.fillStyle = '#fff';
        c.beginPath();
        c.ellipse(ex + dir.x * r * 0.08, ey + dir.y * r * 0.08, r * 0.26, r * 0.32, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#1a2cff';
        c.beginPath();
        c.arc(ex + dir.x * r * 0.18, ey + dir.y * r * 0.2, r * 0.14, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.restore();
  }

  const px = (v) => (v + 0.5) * T;

  function drawText(text, color, row, size) {
    ctx.save();
    ctx.font = `bold ${T * size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = T * 0.6;
    ctx.fillText(text, (COLS * T) / 2, px(row));
    ctx.restore();
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(mazeCanvas, 0, 0, canvas.width / dpr, canvas.height / dpr);
    ctx.save();
    ctx.translate(PAD, PAD);
    ctx.beginPath();
    ctx.rect(-PAD * 0.5, 0, COLS * T + PAD, ROWS * T);
    ctx.clip();

    // pellets
    ctx.fillStyle = '#ffe2b8';
    ctx.shadowColor = '#ffb86b';
    ctx.shadowBlur = T * 0.35;
    ctx.beginPath();
    const pr = T * 0.1, pw = T * (0.26 + 0.06 * Math.sin(game.time * 6));
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const v = pellets[r][c];
        if (!v) continue;
        const rad = v === 2 ? pw : pr;
        ctx.moveTo(px(c) + rad, px(r));
        ctx.arc(px(c), px(r), rad, 0, Math.PI * 2);
      }
    }
    ctx.fill();
    ctx.shadowBlur = 0;

    const dying = game.state === 'dying';
    const showGhosts = !(dying && game.timer < 1.3) && game.state !== 'levelDone';
    if (showGhosts) {
      for (const g of ghosts) {
        let look = 'normal';
        if (g.state === 'eaten' || g.state === 'enter') look = 'eyes';
        else if (g.fright) look = game.fright < FLASH_TIME && Math.floor(game.time * 6) % 2 ? 'flash' : 'fright';
        drawGhost(ctx, px(g.x), px(g.y), T * 0.62, g.color, g.dir, look, game.time);
      }
    }

    // player
    const p = player;
    if (dying) {
      const k = Math.min(1, Math.max(0, (1.3 - game.timer) / 1.1));
      if (k < 1) drawPac(ctx, px(p.x), px(p.y), T * 0.6, -Math.PI / 2, 0.25 + (Math.PI - 0.25) * k);
    } else {
      const mouth = game.state === 'play' ? 0.06 + 0.7 * Math.abs(Math.sin(p.mouthT * 12)) : 0.45;
      drawPac(ctx, px(p.x), px(p.y), T * 0.6, Math.atan2(p.dir.y, p.dir.x), mouth);
    }

    for (const q of particles) {
      ctx.globalAlpha = Math.min(1, q.life * 2);
      ctx.fillStyle = q.color;
      ctx.fillRect(px(q.x) - T * 0.08, px(q.y) - T * 0.08, T * 0.16, T * 0.16);
    }
    ctx.globalAlpha = 1;
    for (const q of popups) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, q.life * 2);
      ctx.font = `bold ${T * 0.7}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#7ff7ff';
      ctx.shadowColor = '#3ff2ff';
      ctx.shadowBlur = T * 0.5;
      ctx.fillText(q.text, px(q.x), px(q.y));
      ctx.restore();
    }

    if (game.state === 'ready') drawText('READY!', '#ffe600', 17, 1);
    if (game.state === 'levelDone') {
      ctx.fillStyle = 'rgba(3, 5, 18, 0.75)';
      ctx.fillRect(T * 3, px(17) - T, T * (COLS - 6), T * 2);
      drawText('LEVEL COMPLETE', '#3ff2ff', 17, 1);
    }
    ctx.restore();
  }

  function drawMenuArt() {
    const w = menuArt.width, h = menuArt.height, t = game.time;
    actx.clearRect(0, 0, w, h);
    const span = w + 260;
    const x = ((t * 90) % span) - 40;
    actx.fillStyle = '#ffe2b8';
    for (let dx = 10; dx < w; dx += 24) if (dx > x) { actx.beginPath(); actx.arc(dx, h / 2, 3, 0, Math.PI * 2); actx.fill(); }
    drawPac(actx, x, h / 2, 15, 0, 0.06 + 0.7 * Math.abs(Math.sin(t * 10)));
    GHOST_DEFS.forEach((g, i) => drawGhost(actx, x - 50 - i * 40, h / 2, 15, g.color, RIGHT, 'normal', t));
  }

  // ---------- Input & loop ----------
  const KEY_DIRS = {
    ArrowUp: UP, KeyW: UP, ArrowDown: DOWN, KeyS: DOWN,
    ArrowLeft: LEFT, KeyA: LEFT, ArrowRight: RIGHT, KeyD: RIGHT,
  };

  window.addEventListener('keydown', (e) => {
    if (KEY_DIRS[e.code]) {
      e.preventDefault();
      if (!game.paused) player.next = KEY_DIRS[e.code];
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
      togglePause();
    } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      startGame();
    }
  });
  $('start-btn').addEventListener('click', startGame);
  $('restart-btn').addEventListener('click', startGame);
  window.addEventListener('resize', resize);

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!game.paused) {
      game.time += dt;
      const n = Math.max(1, Math.ceil(dt / 0.008));
      for (let i = 0; i < n; i++) update(dt / n);
    }
    render();
    if (game.state === 'menu') drawMenuArt();
    requestAnimationFrame(frame);
  }

  resetPellets();
  resetActors();
  updateHud();
  resize();
  requestAnimationFrame(frame);

  // Exposed for automated testing.
  window.__game = {
    game,
    get player() { return player; },
    get ghosts() { return ghosts; },
    get pellets() { return pellets; },
    get pelletsLeft() { return pelletsLeft; },
    set pelletsLeft(v) { pelletsLeft = v; },
  };
})();
