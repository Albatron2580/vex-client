-- VEX online v2.4: remember whether Mojang confirmed the Minecraft name (admins by name need a confirmed name).
ALTER TABLE users ADD COLUMN name_verified INTEGER NOT NULL DEFAULT 0;
