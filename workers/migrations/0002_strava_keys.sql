CREATE TABLE IF NOT EXISTS strava_keys (
  user_id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  client_secret_enc TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
