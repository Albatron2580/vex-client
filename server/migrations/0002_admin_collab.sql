-- VEX online v2: Minecraft account link (admin check), bans, announcements, featured server,
-- bug reports and Collab instance shares.
ALTER TABLE users ADD COLUMN mc_name TEXT;
ALTER TABLE users ADD COLUMN mc_uuid TEXT;
ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0;

CREATE TABLE announcements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'news',   -- news | update | warning
  author     TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE bug_reports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  version    TEXT,
  status     TEXT NOT NULL DEFAULT 'open',    -- open | fixed | wontfix
  created_at INTEGER NOT NULL
);
CREATE INDEX bug_reports_status ON bug_reports (status, created_at);

CREATE TABLE shares (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user  TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  to_user    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  payload    TEXT NOT NULL,                  -- JSON: instance recipe (name, version, loader, mods)
  created_at INTEGER NOT NULL
);
CREATE INDEX shares_to ON shares (to_user, created_at);
