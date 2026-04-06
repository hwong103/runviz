CREATE TABLE IF NOT EXISTS activity_vectors (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  strava_id INTEGER NOT NULL,
  activity_date TEXT NOT NULL,
  distance_km REAL NOT NULL,
  pace_min_per_km REAL,
  avg_hr INTEGER,
  max_hr INTEGER,
  elevation_per_km REAL,
  moving_time_mins REAL NOT NULL,
  run_profile TEXT,
  indexed_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_activity_vectors_user ON activity_vectors(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_vectors_date ON activity_vectors(user_id, activity_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_vectors_strava ON activity_vectors(user_id, strava_id);
