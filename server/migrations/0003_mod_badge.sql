-- VEX online v2.2: the in-game mod says "I'm playing with VEX" so other VEX players see the grey V badge.
ALTER TABLE users ADD COLUMN mod_seen INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS users_mod_seen ON users (mod_seen);
