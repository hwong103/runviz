CREATE TABLE IF NOT EXISTS week_vectors (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  week_key TEXT NOT NULL,
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  total_km REAL NOT NULL,
  run_count INTEGER NOT NULL,
  avg_pace_min_per_km REAL,
  avg_hr INTEGER,
  easy_runs INTEGER NOT NULL DEFAULT 0,
  steady_runs INTEGER NOT NULL DEFAULT 0,
  threshold_runs INTEGER NOT NULL DEFAULT 0,
  race_runs INTEGER NOT NULL DEFAULT 0,
  interval_runs INTEGER NOT NULL DEFAULT 0,
  load_ratio REAL,
  indexed_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_week_vectors_user ON week_vectors(user_id);
CREATE INDEX IF NOT EXISTS idx_week_vectors_week ON week_vectors(user_id, week_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_week_vectors_unique ON week_vectors(user_id, week_key);
