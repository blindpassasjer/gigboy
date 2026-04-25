-- Run once: wrangler d1 execute songbook --file=schema.sql

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  username     TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS songs (
  id                 TEXT PRIMARY KEY,
  title              TEXT NOT NULL,
  artist             TEXT,
  language           TEXT NOT NULL DEFAULT 'en',
  secondary_languages TEXT,   -- JSON array
  tags               TEXT,    -- JSON array
  chordpro           TEXT NOT NULL,
  capo               INTEGER,
  key                TEXT,
  tempo              INTEGER,
  time_signature     TEXT,
  created_at         TEXT DEFAULT (datetime('now')),
  updated_at         TEXT DEFAULT (datetime('now'))
);
