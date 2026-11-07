PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, email TEXT UNIQUE, name TEXT NOT NULL, password_hash TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, venue TEXT NOT NULL,
 date TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0 CHECK(is_demo IN (0,1)), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), user_id TEXT NOT NULL, name TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('organiser','volunteer','vendor','attendee')), team TEXT NOT NULL,
 UNIQUE(event_id,user_id)
);
CREATE TABLE IF NOT EXISTS tasks (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), title TEXT NOT NULL, description TEXT NOT NULL,
 location TEXT NOT NULL, priority TEXT NOT NULL CHECK(priority IN ('urgent','high','normal')),
 status TEXT NOT NULL CHECK(status IN ('open','assigned','in_progress','blocked','resolved','closed')),
 owner_id TEXT REFERENCES members(id), reporter_id TEXT NOT NULL REFERENCES members(id), due_at TEXT,
 resolution TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tasks_event ON tasks(event_id);
CREATE TABLE IF NOT EXISTS commands (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), actor_id TEXT NOT NULL REFERENCES members(id),
 request_key TEXT NOT NULL, request_hash TEXT NOT NULL, response_json TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(actor_id,request_key)
);
CREATE TABLE IF NOT EXISTS activity (
 id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL REFERENCES events(id),
 command_id TEXT NOT NULL UNIQUE REFERENCES commands(id), actor_id TEXT NOT NULL REFERENCES members(id),
 entity_id TEXT NOT NULL, entity_type TEXT NOT NULL, action TEXT NOT NULL,
 before_json TEXT, after_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS activity_event ON activity(event_id,id);
CREATE TABLE IF NOT EXISTS notifications (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), member_id TEXT NOT NULL REFERENCES members(id),
 command_id TEXT NOT NULL REFERENCES commands(id), task_id TEXT NOT NULL, message TEXT NOT NULL, read_at TEXT, created_at TEXT NOT NULL,
 UNIQUE(member_id,command_id)
);
CREATE INDEX IF NOT EXISTS notification_inbox ON notifications(member_id,created_at);
CREATE TABLE IF NOT EXISTS invitations (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), token_hash TEXT NOT NULL UNIQUE,
 role TEXT NOT NULL CHECK(role IN ('volunteer','vendor','attendee')), name TEXT NOT NULL,
 expires_at TEXT NOT NULL, used_by TEXT REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS api_keys (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), member_id TEXT NOT NULL REFERENCES members(id),
 token_hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS schedule (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), title TEXT NOT NULL, location TEXT NOT NULL,
 starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS announcements (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), actor_id TEXT NOT NULL REFERENCES members(id),
 message TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS activity_no_update BEFORE UPDATE ON activity BEGIN SELECT RAISE(ABORT,'Activity is append-only'); END;
CREATE TRIGGER IF NOT EXISTS activity_no_delete BEFORE DELETE ON activity BEGIN SELECT RAISE(ABORT,'Activity is append-only'); END;
CREATE TRIGGER IF NOT EXISTS commands_no_update BEFORE UPDATE ON commands BEGIN SELECT RAISE(ABORT,'Commands are immutable'); END;
CREATE TRIGGER IF NOT EXISTS commands_no_delete BEFORE DELETE ON commands BEGIN SELECT RAISE(ABORT,'Commands are immutable'); END;
PRAGMA user_version = 1;
