ALTER TABLE users ADD COLUMN email_verified_at TEXT;
CREATE TABLE account_tokens (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), purpose TEXT NOT NULL CHECK(purpose IN ('verify','reset')),
 token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX account_tokens_user ON account_tokens(user_id,purpose,created_at);
CREATE TABLE email_outbox (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), token_id TEXT NOT NULL REFERENCES account_tokens(id),
 recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','sending','sent','preview','cancelled','failed')) DEFAULT 'pending',
 attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT NOT NULL, lease_id TEXT, lease_until TEXT,
 last_error TEXT, created_at TEXT NOT NULL, sent_at TEXT
);
CREATE INDEX email_outbox_due ON email_outbox(status,next_attempt_at);
CREATE TABLE auth_rate_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, window_ends TEXT NOT NULL);
CREATE TABLE account_activity (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TRIGGER account_activity_no_update BEFORE UPDATE ON account_activity BEGIN SELECT RAISE(ABORT,'Account history is append-only'); END;
CREATE TRIGGER account_activity_no_delete BEFORE DELETE ON account_activity BEGIN SELECT RAISE(ABORT,'Account history is append-only'); END;
PRAGMA user_version = 2;
