'use strict';
require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*'
  }
});
console.log('[socket] attached:', io.engine !== undefined);

app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
app.use(express.static(require('path').join(__dirname, '..', 'public')));

// ---------- Database ----------
const hasDb = Boolean(process.env.DATABASE_URL);

const pool = hasDb
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true'
        ? { rejectUnauthorized: false }
        : false,
    })
  : null;

async function initDb() {
  if (!pool) {
    console.warn('[warn] DATABASE_URL غير مضبوط: لوحة الصدارة معطّلة.');
    return;
  }

  // اختبار الاتصال بقاعدة البيانات
  await pool.query('SELECT 1');
  console.log('[db] connected successfully');
}

// ---------- Get or Create Player ----------
async function getOrCreatePlayer(client, username) {
  // منع إنشاء سجلين للاسم نفسه في الوقت نفسه
  await client.query(
    'SELECT pg_advisory_xact_lock(hashtext($1)::bigint)',
    [username]
  );

  const result = await client.query(
    'SELECT id FROM players WHERE username = $1 LIMIT 1',
    [username]
  );

  if (result.rows.length > 0) {
    return result.rows[0].id;
  }

  const inserted = await client.query(
    `INSERT INTO players (username, created_at)
     VALUES ($1, NOW())
     RETURNING id`,
    [username]
  );

  return inserted.rows[0].id;
}

// ---------- Simple Rate Limit ----------
const hits = new Map();

function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const now = Date.now();
    const rec = hits.get(req.ip) || {
      n: 0,
      reset: now + windowMs
    };

    if (now > rec.reset) {
      rec.n = 0;
      rec.reset = now + windowMs;
    }

    rec.n++;
    hits.set(req.ip, rec);

    if (rec.n > max) {
      return res.status(429).json({
        error: 'too_many_requests'
      });
    }

    next();
  };
}

setInterval(() => {
  const now = Date.now();

  for (const [ip, r] of hits) {
    if (now > r.reset) hits.delete(ip);
  }
}, 60000).unref();

// ---------- Online Players ----------
const onlinePlayers = new Map();

io.on('connection', (socket) => {
  console.log('[socket] player connected:', socket.id);

  socket.on('joinGame', (username) => {
    const name = String(username || '')
      .replace(/[\u0000-\u001f<>]/g, '')
      .trim()
      .slice(0, 20);

    if (!name) return;

    onlinePlayers.set(socket.id, name);

    io.emit('onlinePlayers', [...new Set(onlinePlayers.values())]);
  });

  socket.on('disconnect', () => {
    onlinePlayers.delete(socket.id);

    io.emit('onlinePlayers', [...new Set(onlinePlayers.values())]);

    console.log('[socket] player disconnected:', socket.id);
  });
});

// ---------- API ----------

// Health Check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, db: hasDb });
});

// Leaderboard
app.get('/api/leaderboard', async (_req, res) => {
  if (!pool) {
    return res.status(503).json({
      error: 'db_not_configured'
    });
  }

  try {
    const { rows } = await pool.query(`
      SELECT
        players.username AS name,
        scores.score AS coins,
        scores.level
      FROM scores
      JOIN players
        ON scores.player_id = players.id
      ORDER BY scores.score DESC, scores.created_at ASC
      LIMIT 3
    `);

    res.json(rows);

  } catch (err) {
    console.error('[leaderboard error]', err.message);

    res.status(500).json({
      error: 'server_error'
    });
  }
});

// Save Score
app.post('/api/scores', rateLimit(10, 60000), async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      error: 'db_not_configured'
    });
  }

  const name = String(req.body.name ?? '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .slice(0, 20);

  const coins = Number(req.body.coins);
  const level = Number(req.body.level);

  if (!name) {
    return res.status(400).json({
      error: 'invalid_name'
    });
  }

  if (!Number.isInteger(coins) || coins < 0 || coins > 100000) {
    return res.status(400).json({
      error: 'invalid_coins'
    });
  }

  if (!Number.isInteger(level) || level < 1 || level > 10000) {
    return res.status(400).json({
      error: 'invalid_level'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // البحث عن اللاعب أو إنشاؤه
    const playerId = await getOrCreatePlayer(client, name);

    // حفظ النتيجة
    await client.query(
      `INSERT INTO scores
        (player_id, score, level, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [playerId, coins, level]
    );

    await client.query('COMMIT');

    res.status(201).json({
      ok: true
    });

  } catch (err) {
    await client.query('ROLLBACK');

    console.error('[save score error]', err.message);

    res.status(500).json({
      error: 'server_error'
    });

  } finally {
    client.release();
  }
});

// ---------- Save Game State ----------
app.post('/api/save', rateLimit(20, 60000), async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: 'db_not_configured' });
  }

  const name = String(req.body.name ?? '').trim().slice(0, 20);
  const gameState = req.body.gameState;

  if (!name) {
    return res.status(400).json({ error: 'invalid_name' });
  }

  if (!gameState || typeof gameState !== 'object' || Array.isArray(gameState)) {
    return res.status(400).json({ error: 'invalid_game_state' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const playerId = await getOrCreatePlayer(client, name);

    await client.query(
      `INSERT INTO game_saves (player_id, game_state, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (player_id)
       DO UPDATE SET
         game_state = EXCLUDED.game_state,
         updated_at = NOW()`,
      [playerId, JSON.stringify(gameState)]
    );

    await client.query('COMMIT');

    res.json({ ok: true, message: 'game_saved' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[save game error]', err.message);
    res.status(500).json({ error: 'server_error' });

  } finally {
    client.release();
  }
});

// ---------- Load Game State ----------
app.get('/api/save', async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: 'db_not_configured' });
  }

  const name = String(req.query.name ?? '').trim().slice(0, 20);

  if (!name) {
    return res.status(400).json({ error: 'invalid_name' });
  }

  try {
    const result = await pool.query(
      `SELECT game_saves.game_state, game_saves.updated_at
       FROM game_saves
       JOIN players ON game_saves.player_id = players.id
       WHERE players.username = $1
       LIMIT 1`,
      [name]
    );

    if (result.rows.length === 0) {
      return res.json({ saved: false });
    }

    res.json({
      saved: true,
      gameState: result.rows[0].game_state,
      updatedAt: result.rows[0].updated_at
    });

  } catch (err) {
    console.error('[load game error]', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// ---------- Start ----------
initDb()
  .catch((err) => {
    console.error('[db] connection failed:', err.message);
  })
  .finally(() => {
    server.listen(PORT, () => {
     console.log(`Server running on port ${PORT}`);
    });
  });