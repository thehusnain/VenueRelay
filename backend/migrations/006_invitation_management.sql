ALTER TABLE invitations ADD COLUMN created_at TEXT;
ALTER TABLE invitations ADD COLUMN revoked_at TEXT;
CREATE INDEX IF NOT EXISTS invitation_event ON invitations(event_id, expires_at DESC);
PRAGMA user_version=6;
