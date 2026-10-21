-- VEX online v2.3: sign-in through Mojang's session server (the launcher never sends its Minecraft token to VEX).
CREATE TABLE IF NOT EXISTS mc_challenges (
  id         TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
