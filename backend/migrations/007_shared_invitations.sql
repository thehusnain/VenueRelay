ALTER TABLE invitations ADD COLUMN reusable INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invitations ADD COLUMN join_count INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX invitation_role_link ON invitations(event_id, role) WHERE reusable=1 AND revoked_at IS NULL;
PRAGMA user_version=7;
