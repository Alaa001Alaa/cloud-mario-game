(() => {
  'use strict';
// ---------- Online Players ----------
const socket = io();

socket.on('onlinePlayers', (players) => {
  const list = document.getElementById('onlinePlayers');

  if (!list) return;

  list.innerHTML = '';

  if (players.length === 0) {
    list.innerHTML = '<li>لا يوجد لاعبون متصلون</li>';
    return;
  }

  players.forEach((name) => {
    const li = document.createElement('li');
    li.textContent = name;
    list.appendChild(li);
  });
});
  // ───────── constants ─────────
  const W = 800, H = 500, GROUND = 390;
  const NUM_COINS = 15, NUM_ENEMIES = 6;
  const PIT_BASES = [200, 380, 560, 680];
  const PLATS = [
    { x: 100, y: 310, w: 120, h: 18, c: '#8b5a2b' },
    { x: 310, y: 260, w: 120, h: 18, c: '#8b5a2b' },
    { x: 530, y: 295, w: 100, h: 18, c: '#8b5a2b' },
    { x: 200, y: 210, w: 80,  h: 18, c: '#c87828' },
  ];

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

  // ───────── state ─────────
  let pl, coins, enemies, pits;
  let score, lives, level, frame, over, saved, started = false;
  const keys = { left: false, right: false, up: false, down: false };

  const pitWidth = () => Math.min(60, 35 + (level - 1) * 3);
  const setPits = () => { pits = PIT_BASES.map((x) => ({ x, w: pitWidth() })); };
  const inPit = (cx) => pits.some((p) => cx > p.x && cx < p.x + p.w);

  function newPlayer() {
    return { x: 80, y: GROUND - 50, w: 30, h: 50, vx: 0, vy: 0,
             jumping: false, sliding: false, inv: 0 };
  }

  function spawnCoins() {
    coins = [];
    for (let i = 0; i < NUM_COINS; i++) {
      let x;
      do { x = rnd(30, W - 30); } while (inPit(x));
      coins.push({ x, y: rnd(190, 350), phase: i * 0.4, got: false });
    }
  }

  function spawnEnemies() {
    enemies = [];
    for (let i = 0; i < NUM_ENEMIES; i++) {
      enemies.push({ x: rnd(W / 2, W + 200), y: GROUND - 30, w: 30, h: 30,
                     vy: 0, speed: 1.2 + level * 0.4 + i * 0.3 });
    }
  }

  function init() {
    score = 0; lives = 3; level = 1; frame = 0; over = false; saved = false;
    setPits(); spawnCoins(); spawnEnemies();
    pl = newPlayer();
    $('overlay').classList.add('hidden');
  }

  // ───────── game logic ─────────
  function loseLife() {
    lives--;
    pl = newPlayer();
    pl.inv = 100;
    if (lives <= 0) endGame();
  }

  function endGame() {
    over = true;
    $('finalCoins').textContent = score;
    $('finalLevel').textContent = level;
    $('buyBtn').classList.toggle('hidden', score < 50);
    $('saveRow').classList.remove('hidden');
    $('saveBtn').disabled = false;
    $('msg').textContent = '';
    saved = false;
    $('nameInput').value = $('startName').value.trim() || localStorage.getItem('mario-name') || '';
    $('overlay').classList.remove('hidden');
  }

  function buyLife() {
    if (!over || score < 50) return;
    score -= 50;
    lives = 1;
    over = false;
    pl = newPlayer();
    pl.inv = 100;
    spawnEnemies();
    $('overlay').classList.add('hidden');
  }

  function update() {
    if (over || !started) return;
    frame++;

    // movement
    const spd = pl.sliding ? 2.2 : 4.8;
    pl.vx = keys.left ? -spd : keys.right ? spd : 0;

    if (keys.up && !pl.jumping) { pl.vy = -13.5; pl.jumping = true; }

    const wantSlide = keys.down && !pl.jumping;
    const newH = wantSlide ? 28 : 50;
    if (newH !== pl.h) { pl.y += pl.h - newH; pl.h = newH; } // keep feet in place
    pl.sliding = wantSlide;

    const prevBottom = pl.y + pl.h;
    pl.vy += 0.55;
    pl.x += pl.vx;
    pl.y += pl.vy;
    pl.x = Math.max(0, Math.min(W - pl.w, pl.x));
    const bottom = pl.y + pl.h;

    // ground (with pits)
    const cx = pl.x + pl.w / 2;
    if (!inPit(cx) && prevBottom <= GROUND + 0.01 && bottom >= GROUND) {
      pl.y = GROUND - pl.h; pl.vy = 0; pl.jumping = false;
    }

    // platforms (land on top only)
    for (const p of PLATS) {
      if (pl.vy >= 0 && pl.x + pl.w > p.x && pl.x < p.x + p.w &&
          prevBottom <= p.y + 1 && pl.y + pl.h >= p.y) {
        pl.y = p.y - pl.h; pl.vy = 0; pl.jumping = false;
      }
    }

    // fell into a pit
    if (pl.y > H) { loseLife(); return; }

    if (pl.inv > 0) pl.inv--;

    // coins
    let got = 0;
    for (const c of coins) {
      if (c.got) { got++; continue; }
      c.phase += 0.08;
      const cy = c.y + 5 * Math.sin(c.phase);
      if (pl.x < c.x + 8 && pl.x + pl.w > c.x - 8 &&
          pl.y < cy + 8 && pl.y + pl.h > cy - 8) {
        c.got = true; got++; score++;
        const nl = 1 + Math.floor(score / 10);
        if (nl !== level) { level = nl; setPits(); }
      }
    }
    if (got === NUM_COINS) { spawnCoins(); spawnEnemies(); } // new wave

    // enemies
    for (const e of enemies) {
      e.x -= e.speed;
      // الوحوش تقفز فوق الحفر ولا تسقط فيها
      const cxE = e.x + e.w / 2;
      const pit = pits.find((p) => cxE > p.x && cxE < p.x + p.w);
      e.y = pit
        ? GROUND - 30 - 30 * Math.sin(Math.PI * (cxE - pit.x) / pit.w)
        : GROUND - 30;
      if (e.x < -35) { e.x = W + rnd(10, 200); e.y = GROUND - 30; }
      if (pl.inv > 0) continue;

      if (pl.x < e.x + e.w && pl.x + pl.w > e.x &&
          pl.y < e.y + e.h && pl.y + pl.h > e.y) {
        if (pl.vy > 0 && prevBottom <= e.y + 10) {    // stomp
          e.x = W + rnd(50, 300);
          pl.vy = -9; score += 2;
          const nl = 1 + Math.floor(score / 10);
          if (nl !== level) { level = nl; setPits(); }
        } else {
          loseLife();
          return;
        }
      }
    }
  }

  // ───────── drawing helpers ─────────
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const RR = (x, y, w, h, r, c) => {
    ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
  };
  const O = (x, y, rx, ry, c) => {
    ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  };
  const T = (s, x, y, c, size, align = 'left') => {
    ctx.fillStyle = c; ctx.font = `bold ${size}px Arial`;
    ctx.textAlign = align; ctx.textBaseline = 'top'; ctx.fillText(s, x, y);
  };

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, '#50a0ff'); g.addColorStop(1, '#8ad2ff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, GROUND);

    // clouds
    const span = W + 160;
    [50, 280, 560, 720].forEach((base, i) => {
      const cx = (((base - frame * 0.5) % span) + span) % span - 80;
      const cy = [55, 35, 70, 48][i];
      O(cx + 35, cy + 17, 35, 17, '#fff');
      O(cx + 40, cy + 2, 20, 20, '#fff');
      O(cx + 66, cy + 15, 24, 15, '#fff');
    });

    // mountains
    ctx.fillStyle = '#3c783c';
    [[0, 130, 260], [180, 340, 500], [450, 600, 750]].forEach(([a, b, c]) => {
      ctx.beginPath(); ctx.moveTo(a, 300); ctx.lineTo(b, 160); ctx.lineTo(c, 300); ctx.fill();
    });
    R(0, 300, W, GROUND - 300, '#3c783c');

    // ground
    R(0, GROUND, W, H - GROUND, '#50aa3c');
    R(0, GROUND, W, 12, '#64c846');
    ctx.strokeStyle = '#3c9632'; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x + .5, GROUND); ctx.lineTo(x + .5, H); ctx.stroke();
    }

    // pits
    for (const p of pits) {
      R(p.x, GROUND, p.w, H - GROUND, '#0a0a14');
      R(p.x, GROUND - 4, p.w, 4, '#32200a');
      ctx.strokeStyle = '#1e140a';
      for (let d = 10; d < H - GROUND; d += 15) {
        ctx.beginPath(); ctx.moveTo(p.x, GROUND + d); ctx.lineTo(p.x + p.w, GROUND + d); ctx.stroke();
      }
      R(p.x - 3, GROUND - 2, 4, 8, '#b45000');
      R(p.x + p.w - 1, GROUND - 2, 4, 8, '#b45000');
    }
  }

  function drawPlatforms() {
    for (const p of PLATS) {
      RR(p.x, p.y, p.w, p.h, 4, p.c);
      R(p.x, p.y, p.w, 5, '#64c846');
      R(p.x + 4, p.y + p.h, p.w - 4, 4, 'rgba(0,0,0,.45)');
    }
  }

  function drawCoins() {
    for (const c of coins) {
      if (c.got) continue;
      const cy = c.y + 5 * Math.sin(c.phase);
      O(c.x, cy, 9, 9, '#fff050');
      O(c.x, cy, 7, 7, '#ffc800');
      O(c.x - 2, cy - 3, 2.5, 2.5, '#ffffb4');
    }
  }

  function drawEnemies() {
    const body = `rgb(${Math.min(255, 180 + level * 8)},40,40)`;
    for (const e of enemies) {
      const x = Math.round(e.x), y = Math.round(e.y);
      RR(x, y, e.w, e.h, 6, body);
      R(x + 5, y + 5, 8, 7, '#fff'); R(x + 17, y + 5, 8, 7, '#fff');
      R(x + 5, y + 6, 4, 5, '#000'); R(x + 17, y + 6, 4, 5, '#000');
      ctx.strokeStyle = '#640000'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 6, y + 20); ctx.lineTo(x + 14, y + 23); ctx.lineTo(x + 24, y + 20); ctx.stroke();
      const lo = Math.floor(frame / 4) % 2 * 4;
      R(x, y + e.h, 12, 8 + lo, '#961414');
      R(x + e.w - 12, y + e.h, 12, 12 - lo, '#961414');
    }
  }

  function drawPlayer() {
    if (pl.inv > 0 && Math.floor(frame / 4) % 2) return;
    const x = Math.round(pl.x), y = Math.round(pl.y), w = pl.w, h = pl.h;
    if (pl.sliding) {
      R(x + 2, y, w - 4, 10, '#c83232');
      RR(x, y + 8, w, 16, 4, '#ffdc96');
      R(x + 5, y + 11, 6, 5, '#fff');  R(x + w - 11, y + 11, 6, 5, '#fff');
      R(x + 8, y + 12, 3, 4, '#000');  R(x + w - 8, y + 12, 3, 4, '#000');
      R(x, y + 22, w, h - 22, '#1e50c8');
      R(x + 3, y + 22, w - 6, 6, '#ff6400');
      return;
    }
    R(x + 4, y, w - 8, 10, '#c83232');
    R(x, y + 8, w, 5, '#c83232');
    RR(x + 2, y + 11, w - 4, 18, 4, '#ffdc96');
    R(x + 5, y + 21, w - 10, 4, '#784614');
    R(x + 6, y + 13, 6, 6, '#fff');  R(x + w - 12, y + 13, 6, 6, '#fff');
    R(x + 9, y + 15, 3, 4, '#000');  R(x + w - 9, y + 15, 3, 4, '#000');
    R(x, y + 28, w, h - 28, '#1e50c8');
    R(x + 4, y + 28, 7, 12, '#ff9600');
    R(x + w - 11, y + 28, 7, 12, '#ff9600');
    R(x + 5, y + 28, 5, 4, '#ffdc00');
    R(x + w - 10, y + 28, 5, 4, '#ffdc00');
    const ls = pl.jumping ? 0 : Math.round(4 * Math.sin(frame * 0.3));
    const lh = pl.jumping ? 14 : 16;
    R(x + 2, y + h - lh, 10, lh + ls, '#1e50c8');
    R(x + w - 12, y + h - lh, 10, lh - ls, '#1e50c8');
    RR(x, y + h - 4 + ls, 14, 8, 3, '#3c1e0a');
    RR(x + w - 14, y + h - 4 - ls, 14, 8, 3, '#3c1e0a');
  }

  function drawHUD() {
    R(0, 0, W, 38, '#000'); R(0, 36, W, 2, '#c89600');
    T('COINS: ' + score, 12, 8, '#ffdc00', 22);
    T('LVL ' + level, 180, 8, '#64ffc8', 22);
    T('LIVES:', 270, 8, '#fff', 22);
    for (let i = 0; i < lives && i < 6; i++) {
      const hx = 360 + i * 28;
      R(hx, 10, 16, 6, '#c83232');
      RR(hx - 1, 15, 18, 12, 3, '#ffdc96');
      R(hx + 2, 17, 5, 4, '#000');
    }
  }

  function draw() {
    drawBackground(); drawPlatforms(); drawCoins();
    drawEnemies(); drawPlayer(); drawHUD();
  }

  // ───────── loop (fixed 60 fps step) ─────────
  const STEP = 1000 / 60;
  let last = performance.now(), acc = 0;
  function loop(t) {
    acc += Math.min(100, t - last); last = t;
    while (acc >= STEP) { update(); acc -= STEP; }
    draw();
    requestAnimationFrame(loop);
  }

  // ───────── input ─────────
  const KEYMAP = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', ' ': 'up' };

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (KEYMAP[e.key]) { keys[KEYMAP[e.key]] = true; e.preventDefault(); }
    const k = e.key.toLowerCase();
    if (k === 'r' && over) init();
    if (k === 'b') buyLife();

    if (k === 's' && started && !over) saveGame();
    if (k === 'l') loadGame();
  });
  window.addEventListener('keyup', (e) => {
    if (KEYMAP[e.key]) keys[KEYMAP[e.key]] = false;
  });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  document.querySelectorAll('.touch button').forEach((b) => {
    const k = b.dataset.key;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); keys[k] = true; });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) =>
      b.addEventListener(ev, () => { keys[k] = false; }));
  });

  
  // ---------- Save & Load Game ----------

  function getGameState() {
    return {
      pl: { ...pl },
      coins: coins.map(c => ({ ...c })),
      enemies: enemies.map(e => ({ ...e })),
      pits: pits.map(p => ({ ...p })),
      score,
      lives,
      level,
      frame
    };
  }

  function getPlayerName() {
    return (
      $('startName').value.trim() ||
      localStorage.getItem('mario-name') ||
      ''
    );
  }

  async function saveGame() {
    const name = getPlayerName();

    if (!name) {
      alert('اكتب اسم اللاعب أولاً');
      return;
    }

    try {
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          gameState: getGameState()
        })
      });

      if (!res.ok) throw new Error('Save failed');

      alert('تم حفظ تقدمك بنجاح!');
    } catch (err) {
      console.error('[save game]', err);
      alert('تعذر حفظ اللعبة');
    }
  }

  async function loadGame() {
    const name = getPlayerName();

    if (!name) {
      alert('اكتب اسم اللاعب أولاً');
      return;
    }

    try {
      const res = await fetch(
        '/api/save?name=' + encodeURIComponent(name)
      );

      if (!res.ok) throw new Error('Load failed');

      const data = await res.json();

      if (!data.saved) {
        alert('لا يوجد تقدم محفوظ لهذا اللاعب');
        return;
      }

      const s = data.gameState;

      if (
        !s || !s.pl ||
        !Array.isArray(s.coins) ||
        !Array.isArray(s.enemies) ||
        !Array.isArray(s.pits) ||
        !Number.isInteger(s.score) ||
        !Number.isInteger(s.lives) ||
        !Number.isInteger(s.level) ||
        !Number.isInteger(s.frame)
      ) {
        throw new Error('Invalid saved game data');
      }

      pl = { ...newPlayer(), ...s.pl };
      coins = s.coins.map(c => ({ ...c }));
      enemies = s.enemies.map(e => ({ ...e }));
      pits = s.pits.map(p => ({ ...p }));

      score = s.score;
      lives = s.lives;
      level = s.level;
      frame = s.frame;

      over = false;
      saved = false;
      started = true;

      $('overlay').classList.add('hidden');
      $('startOverlay').classList.add('hidden');

      for (const k in keys) keys[k] = false;

      alert('تم استرجاع تقدمك بنجاح!');

    } catch (err) {
      console.error('[load game]', err);
      alert('تعذر استرجاع اللعبة');
    }
  }

  // ───────── leaderboard / server ─────────
  async function loadBoard() {
    const ol = $('leaderboard');
    try {
      const res = await fetch('/api/leaderboard');
      if (!res.ok) throw new Error();
      const rows = await res.json();
      ol.innerHTML = '';
      if (!rows.length) { ol.innerHTML = '<li>لا توجد نتائج بعد</li>'; return; }
      rows.forEach((r) => {
        const li = document.createElement('li');
        const a = document.createElement('span'); a.textContent = r.name;
        const b = document.createElement('span'); b.textContent = `${r.coins} 🪙 · LVL ${r.level}`;
        li.append(a, b); ol.append(li);
      });
    } catch {
      ol.innerHTML = '<li>لوحة الصدارة غير متاحة حالياً</li>';
    }
  }

  async function saveScore() {
    if (saved) return;
    const name = $('nameInput').value.trim();
    if (!name) { $('msg').textContent = 'اكتب اسمك أولاً'; return; }
    $('saveBtn').disabled = true;
    try {
      const res = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, coins: score, level }),
      });
      if (!res.ok) throw new Error();
      saved = true;
      localStorage.setItem('mario-name', name);
      $('msg').textContent = 'تم حفظ نتيجتك ✅';
      $('saveRow').classList.add('hidden');
      loadBoard();
    } catch {
      $('msg').textContent = 'تعذّر الحفظ، حاول مرة أخرى';
      $('saveBtn').disabled = false;
    }
  }

  $('saveBtn').addEventListener('click', saveScore);
  $('buyBtn').addEventListener('click', buyLife);
  $('restartBtn').addEventListener('click', init);

  // ───────── start screen ─────────
  function startGame() {
  const name = $('startName').value.trim();

  if (!name) {
    alert('اكتب اسم اللاعب أولاً');
    return;
  }

  localStorage.setItem('mario-name', name);

  // إرسال اسم اللاعب إلى الخادم
  socket.emit('joinGame', name);

  started = true;
  $('startOverlay').classList.add('hidden');
}
  $('startBtn').addEventListener('click', startGame);
  $('startName').addEventListener('keydown', (e) => { if (e.key === 'Enter') startGame(); });
  $('startName').value = localStorage.getItem('mario-name') || '';

  // ───────── start ─────────
  init();
  loadBoard();
  requestAnimationFrame(loop);
})();
