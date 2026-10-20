-- Users are Modrinth accounts. We keep only what the friends list shows.
CREATE TABLE users (
  id            TEXT PRIMARY KEY,          -- Modrinth user id
  username      TEXT NOT NULL,
  username_lower TEXT NOT NULL,
  avatar_url    TEXT,
  created_at    INTEGER NOT NULL,
  last_seen     INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'offline',  -- online | playing
  detail        TEXT
);
CREATE INDEX users_username ON users (username_lower);

-- VEX sessions. Only a SHA-256 hash of each token is stored.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

-- Pending browser logins (state → the launcher's loopback port). Short-lived.
CREATE TABLE logins (
  id           TEXT PRIMARY KEY,
  port         INTEGER NOT NULL,
  client_state TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);

-- One row per pair, user_a < user_b. status: pending | accepted.
CREATE TABLE friendships (
  user_a     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  user_b     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  requester  TEXT NOT NULL,
  status     TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_a, user_b)
);
CREATE INDEX friendships_b ON friendships (user_b);
