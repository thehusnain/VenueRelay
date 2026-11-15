import { useEffect, useRef, type ReactNode } from 'react';
import { X, Check, UserRound } from 'lucide-react';
import type { Member, Activity } from '../../shared/contracts';
import { statusLabels } from '../../shared/contracts';
export function Avatar({
  member,
  size = 'normal',
}: {
  member?: Pick<Member, 'name' | 'role'>;
  size?: 'small' | 'normal' | 'large';
}) {
  return (
    <span className={`avatar ${size} ${member?.role ?? ''}`} title={member?.name ?? 'Unassigned'}>
      {member ? (
        member.name
          .split(' ')
          .map((x) => x[0])
          .slice(0, 2)
          .join('')
      ) : (
        <UserRound size={14} />
      )}
    </span>
  );
}
export const time = (value: string) =>
  new Intl.DateTimeFormat('en', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Karachi',
  }).format(new Date(value));
export const eventDate = (value: string) =>
  new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Karachi',
  }).format(new Date(value + 'T12:00:00Z'));
export function ago(value: string) {
  const n = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000));
  return n < 1
    ? 'Just now'
    : n < 60
      ? `${n}m ago`
      : n < 1440
        ? `${Math.floor(n / 60)}h ago`
        : `${Math.floor(n / 1440)}d ago`;
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useRef('dialog-' + Math.random().toString(36).slice(2));
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    el.showModal();
    const focusTarget =
      el.querySelector<HTMLElement>('[autofocus], input, textarea, select') ??
      el.querySelector<HTMLElement>('button');
    focusTarget?.focus({ preventScroll: true });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      el.close();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      className={`modal ${wide ? 'wide' : ''}`}
      ref={ref}
      aria-labelledby={titleId.current}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const focusable = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-head">
        <div>
          <h2 id={titleId.current}>{title}</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close dialog">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Check size={24} />
      </span>
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
    </div>
  );
}
export function ActivityList({
  items,
  members,
  onTask,
}: {
  items: Activity[];
  members: Member[];
  onTask?: (id: string) => void;
}) {
  return (
    <div className="activity-list">
      {items.map((a) => {
        const member = members.find((m) => m.id === a.actor_id);
        let entity: any = {};
        try {
          const parsed = JSON.parse(a.after_json);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) entity = parsed;
        } catch {}
        return (
          <div className="activity-item" key={a.id}>
            <Avatar member={member} size="small" />
            <div>
              <p>
                <strong>{member?.name ?? 'Event team'}</strong>{' '}
                {a.action === 'task.create'
                  ? 'reported a task'
                  : a.action === 'task.assign'
                    ? 'assigned a task'
                    : a.action === 'task.status'
                      ? `set a task to ${statusLabels[entity.status as keyof typeof statusLabels] ?? entity.status}`
                      : a.action === 'attendee_link.create'
                        ? 'created an attendee access link'
                        : a.action === 'attendee_link.revoke'
                          ? 'disabled an attendee access link'
                          : a.action === 'schedule.create'
                            ? 'added a programme session'
                            : a.action === 'announcement.create'
                              ? 'posted an announcement'
                              : a.action === 'member.join'
                                ? 'joined the event'
                                : a.action === 'invitation.create'
                                  ? 'created an invitation'
                                  : a.action === 'integration.create'
                                    ? 'created an integration token'
                                    : 'revoked an integration token'}
              </p>
              {a.entity_type === 'task' && onTask ? (
                <button className="text-link" onClick={() => onTask(a.entity_id)}>
                  {entity.title}
                </button>
              ) : (
                <span className="activity-entity">
                  {entity.title ?? entity.message ?? entity.name ?? ''}
                </span>
              )}
              <time dateTime={a.created_at}>{ago(a.created_at)}</time>
            </div>
            <span className="audit-id">#{a.id}</span>
          </div>
        );
      })}
    </div>
  );
}
