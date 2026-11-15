import type { Invitation, Member, Role } from '../../shared/contracts.ts';
import { ensure } from './errors.ts';

export interface InvitationRecord {
  id: string;
  event_id: string;
  name: string;
  role: Role;
  expires_at: string;
  used_by: string | null;
  created_at?: string | null;
  revoked_at?: string | null;
}

export const invitationName = (value: string) =>
  value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');

export function ensureInvitable(
  name: string,
  members: Member[],
  invitations: InvitationRecord[],
  exceptId?: string,
) {
  const key = invitationName(name);
  ensure(
    !members.some((m) => !m.user_id.startsWith('guest:') && invitationName(m.name) === key) &&
      !invitations.some((row) => row.used_by && invitationName(row.name) === key),
    409,
    'ALREADY_MEMBER',
    'A team member with this name has already joined your event.',
  );
  const existing = invitations.find(
    (row) =>
      row.id !== exceptId &&
      invitationName(row.name) === key &&
      invitationView(row).status === 'pending',
  );
  ensure(
    !existing,
    409,
    'ALREADY_INVITED',
    'An invitation for this name is already pending. Find it in Your team to replace or cancel its link.',
    existing ? { invitationId: existing.id } : undefined,
  );
}

export function invitationView(row: InvitationRecord): Invitation {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    expiresAt: row.expires_at,
    createdAt: row.created_at ?? null,
    status: row.used_by
      ? 'accepted'
      : row.revoked_at
        ? 'cancelled'
        : row.expires_at <= new Date().toISOString()
          ? 'expired'
          : 'pending',
  };
}
