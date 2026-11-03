-- جدول لوحة الصدارة. يُنفَّذ تلقائياً عند تشغيل الخادم (IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS scores (
  id          SERIAL PRIMARY KEY,
  player_name VARCHAR(20) NOT NULL,
  coins       INTEGER     NOT NULL CHECK (coins >= 0),
  level       INTEGER     NOT NULL CHECK (level >= 1),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scores_coins ON scores (coins DESC, created_at ASC);
