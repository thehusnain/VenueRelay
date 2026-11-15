ALTER TABLE users ADD COLUMN access_approved_at TEXT;
ALTER TABLE users ADD COLUMN recovery_code_hash TEXT;
PRAGMA user_version = 4;
