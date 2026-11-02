CREATE TABLE IF NOT EXISTS pass_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_type_id TEXT NOT NULL REFERENCES pass_types(id),
  token TEXT NOT NULL UNIQUE,
  email_status TEXT NOT NULL DEFAULT 'pending',
  email_error TEXT,
  emailed_at TEXT,
  checked_in_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_participants_pass ON participants(pass_type_id);
CREATE INDEX IF NOT EXISTS idx_participants_checkin ON participants(checked_in_at);
