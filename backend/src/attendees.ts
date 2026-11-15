import type { IncomingMessage } from 'node:http';
import type {
  AttendeeRequestInput,
  AttendeeRequestView,
  Event,
  Member,
  Task,
  Activity,
} from '../../shared/contracts.ts';
import { hash, id, now, token } from './auth.ts';
import { ensure, text, choice } from './errors.ts';
import { append, canonical, execute, type Context } from './domain.ts';
import { organiser } from './permissions.ts';
import { Store } from './database.ts';

export interface AttendeeLink {
  id: string;
  event_id: string;
  token_hash: string;
  created_at: string;
  revoked_at: string | null;
}
export interface AttendeeReceipt {
  token_hash: string;
  event_id: string;
  link_id: string;
  member_id: string;
  task_id: string;
  request_key: string;
  request_hash: string;
  created_at: string;
}
export interface AttendeePort {
  event(eventId: string, secret: string): unknown | Promise<unknown>;
  submit(
    eventId: string,
    secret: string,
    key: string,
    input: Record<string, unknown>,
  ): unknown | Promise<unknown>;
  track(secret: string): AttendeeRequestView | Promise<AttendeeRequestView>;
}
export function publicEvent(event: Event) {
  return { id: event.id, name: event.name, venue: event.venue, date: event.date };
}
export function attendeeInput(p: Record<string, unknown>, key: string) {
  ensure(
    /^[A-Za-z0-9_-]{8,100}$/.test(key),
    400,
    'IDEMPOTENCY_REQUIRED',
    'A stable request ID is required.',
  );
  const receiptKey = typeof p.receiptKey === 'string' ? p.receiptKey : '';
  ensure(
    /^[A-Za-z0-9_-]{43}$/.test(receiptKey),
    422,
    'RECEIPT_REQUIRED',
    'Keep a private tracking key for this request.',
  );
  const input: Required<AttendeeRequestInput> = {
    name: text(p.name || 'Event attendee', 'Name', 80, 2),
    title: text(p.title, 'Request', 140, 3),
    location: text(p.location, 'Location', 120),
    description: text(p.description ?? '', 'Details', 2000, 0),
    priority: choice(p.priority ?? 'normal', ['normal', 'high', 'urgent'] as const, 'Priority'),
    receiptKey,
  };
  return { input, digest: hash(canonical(input)), receiptHash: hash(receiptKey) };
}
export function attendeeView(event: Event, task: Task, activity: Activity[]): AttendeeRequestView {
  const { id, title, description, location, priority, status, resolution, created_at, updated_at } =
    task;
  return {
    event: publicEvent(event),
    request: {
      id,
      title,
      description,
      location,
      priority,
      status,
      resolution,
      created_at,
      updated_at,
    },
    updates: activity
      .filter((a) => a.entity_id === task.id && a.entity_type === 'task')
      .map((a) => {
        const after = JSON.parse(a.after_json) as Task;
        return { status: after.status, createdAt: a.created_at };
      }),
  };
}
export function publicSecret(value: unknown) {
  ensure(
    typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value),
    404,
    'NOT_FOUND',
    'This link is unavailable. Ask the event team for a new link.',
  );
  return value;
}
export function guestContext(event: Event, name: string): Context {
  const memberId = id();
  const me: Member = {
    id: memberId,
    event_id: event.id,
    user_id: 'guest:' + memberId,
    name,
    role: 'attendee',
    team: 'Guest requests',
  };
  return { event, me, user: { id: me.user_id, name, email: null } };
}
export async function publicAttendeeRoute(options: {
  path: string;
  method: string | undefined;
  req: IncomingMessage;
  service: AttendeePort;
  body: () => Promise<Record<string, unknown>>;
  send: (value: unknown, status?: number) => void;
  limit: (key: string, maximum: number, windowMs: number) => void | Promise<void>;
}) {
  const { path, method, req, service, send, limit } = options;
  if (path === '/api/v1/attendee-requests') {
    ensure(method === 'GET', 405, 'METHOD_NOT_ALLOWED', 'Use GET.');
    await limit('guest-read-peer:' + (req.socket.remoteAddress ?? 'unknown'), 1200, 60000);
    const secret = publicSecret(req.headers.authorization?.match(/^Bearer vr_guest_(.+)$/)?.[1]);
    send(await service.track(secret));
    return true;
  }
  const match = path.match(/^\/api\/v1\/attendee-events\/([^/]+)(\/requests)?$/);
  if (!match) return false;
  const eventId = decodeURIComponent(match[1]),
    secret = publicSecret(req.headers['x-venuerelay-event-key']);
  if (!match[2]) {
    ensure(method === 'GET', 405, 'METHOD_NOT_ALLOWED', 'Use GET.');
    await limit('guest-read-peer:' + (req.socket.remoteAddress ?? 'unknown'), 1200, 60000);
    send(await service.event(eventId, secret));
    return true;
  }
  ensure(method === 'POST', 405, 'METHOD_NOT_ALLOWED', 'Use POST.');
  // Each event has a fixed write budget. Changing a client header cannot evade it.
  await limit('guest-write-peer:' + (req.socket.remoteAddress ?? 'unknown'), 60, 60000);
  await limit('guest-write-event:' + eventId, 120, 60000);
  send(
    await service.submit(
      eventId,
      secret,
      String(req.headers['idempotency-key'] ?? ''),
      await options.body(),
    ),
    201,
  );
  return true;
}

export class SqliteAttendees implements AttendeePort {
  constructor(readonly store: Store) {}
  links(ctx: Context) {
    organiser(ctx);
    return this.store.all<Pick<AttendeeLink, 'id' | 'created_at' | 'revoked_at'>>(
      'SELECT id,created_at,revoked_at FROM attendee_links WHERE event_id=? ORDER BY created_at DESC',
      ctx.event.id,
    );
  }
  createLink(ctx: Context) {
    organiser(ctx);
    ensure(
      !ctx.isIntegration,
      403,
      'FORBIDDEN',
      'Use your signed-in account to share attendee access.',
    );
    const secret = token(),
      linkId = id();
    this.store.transaction(() => {
      const count = this.store.get<{ n: number }>(
        'SELECT count(*) n FROM attendee_links WHERE event_id=? AND revoked_at IS NULL',
        ctx.event.id,
      )!.n;
      ensure(
        count < 10,
        422,
        'LINK_LIMIT',
        'Disable an old attendee link before creating another.',
      );
      this.store.run(
        'INSERT INTO attendee_links VALUES (?,?,?,?,NULL)',
        linkId,
        ctx.event.id,
        hash(secret),
        now(),
      );
      append(
        this.store,
        ctx,
        'public-link-' + linkId,
        hash(linkId),
        { id: linkId },
        'attendee_link',
        linkId,
        'attendee_link.create',
        null,
        { id: linkId },
        [],
        '',
      );
    });
    return { id: linkId, token: secret };
  }
  revoke(ctx: Context, linkId: string) {
    organiser(ctx);
    ensure(!ctx.isIntegration, 403, 'FORBIDDEN', 'Use your signed-in account.');
    this.store.transaction(() => {
      const link = this.store.get<AttendeeLink>(
        'SELECT * FROM attendee_links WHERE id=? AND event_id=?',
        linkId,
        ctx.event.id,
      );
      ensure(link, 404, 'NOT_FOUND', 'Attendee link not found.');
      if (link.revoked_at) return;
      this.store.run('UPDATE attendee_links SET revoked_at=? WHERE id=?', now(), linkId);
      append(
        this.store,
        ctx,
        'public-revoke-' + linkId,
        hash(linkId),
        { id: linkId },
        'attendee_link',
        linkId,
        'attendee_link.revoke',
        null,
        { id: linkId },
        [],
        '',
      );
    });
    return { ok: true };
  }
  find(eventId: string, secret: string, active = true) {
    const link = this.store.get<AttendeeLink>(
      'SELECT * FROM attendee_links WHERE event_id=? AND token_hash=?',
      eventId,
      hash(secret),
    );
    ensure(link, 404, 'NOT_FOUND', 'This attendee link is unavailable.');
    if (active)
      ensure(
        !link.revoked_at,
        410,
        'LINK_DISABLED',
        'The organiser disabled this attendee link. Existing tracking links still work.',
      );
    const event = this.store.get<Event>('SELECT * FROM events WHERE id=?', eventId);
    ensure(event, 404, 'NOT_FOUND', 'Event not found.');
    return { link, event };
  }
  event(eventId: string, secret: string) {
    return publicEvent(this.find(eventId, secret).event);
  }
  submit(eventId: string, secret: string, key: string, p: Record<string, unknown>) {
    const { input, digest, receiptHash } = attendeeInput(p, key);
    return this.store.transaction(() => {
      const { link, event } = this.find(eventId, secret, false);
      const previous = this.store.get<AttendeeReceipt>(
        'SELECT * FROM attendee_receipts WHERE event_id=? AND request_key=?',
        eventId,
        key,
      );
      if (previous) {
        ensure(
          previous.request_hash === digest && previous.link_id === link.id,
          409,
          'IDEMPOTENCY_MISMATCH',
          'This request ID belongs to a different request.',
        );
        return { requestId: previous.task_id, replayed: true };
      }
      ensure(
        !this.store.get('SELECT token_hash FROM attendee_receipts WHERE token_hash=?', receiptHash),
        409,
        'RECEIPT_USED',
        'This tracking key already belongs to another request.',
      );
      ensure(!link.revoked_at, 410, 'LINK_DISABLED', 'The organiser disabled this attendee link.');
      const ctx = guestContext(event, input.name);
      this.store.run(
        'INSERT INTO members VALUES (?,?,?,?,?,?)',
        ctx.me.id,
        eventId,
        ctx.me.user_id,
        ctx.me.name,
        ctx.me.role,
        ctx.me.team,
      );
      const result = execute(this.store, ctx, key, {
        action: 'task.create',
        payload: {
          title: input.title,
          description: input.description,
          location: input.location,
          priority: input.priority,
        },
      });
      this.store.run(
        'INSERT INTO attendee_receipts VALUES (?,?,?,?,?,?,?,?)',
        receiptHash,
        eventId,
        link.id,
        ctx.me.id,
        result.entityId,
        key,
        digest,
        now(),
      );
      return { requestId: result.entityId, replayed: false };
    });
  }
  track(secret: string) {
    const receipt = this.store.get<AttendeeReceipt>(
      'SELECT * FROM attendee_receipts WHERE token_hash=?',
      hash(secret),
    );
    ensure(
      receipt,
      404,
      'NOT_FOUND',
      'This request is unavailable. Check your private tracking link.',
    );
    const event = this.store.get<Event>('SELECT * FROM events WHERE id=?', receipt.event_id)!;
    const task = this.store.get<Task>(
      'SELECT * FROM tasks WHERE id=? AND event_id=?',
      receipt.task_id,
      receipt.event_id,
    )!;
    ensure(event && task, 404, 'NOT_FOUND', 'Request unavailable.');
    return attendeeView(
      event,
      task,
      this.store.all<Activity>(
        'SELECT * FROM activity WHERE event_id=? AND entity_id=? ORDER BY id',
        event.id,
        task.id,
      ),
    );
  }
}
