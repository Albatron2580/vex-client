-- Long-lived, reusable phone-app codes for Google Play's app reviewers (admins make them).
ALTER TABLE pair_codes ADD COLUMN reusable INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pair_codes ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0;
