ALTER TABLE users ADD COLUMN username TEXT;
CREATE UNIQUE INDEX users_username ON users(username) WHERE username IS NOT NULL;
CREATE TABLE attendee_links (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), token_hash TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL, revoked_at TEXT
);
CREATE INDEX attendee_links_event ON attendee_links(event_id);
CREATE TABLE attendee_receipts (
 token_hash TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), link_id TEXT NOT NULL REFERENCES attendee_links(id),
 member_id TEXT NOT NULL REFERENCES members(id), task_id TEXT NOT NULL REFERENCES tasks(id),
 request_key TEXT NOT NULL, request_hash TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(event_id,request_key)
);
PRAGMA user_version = 5;
