import type { Event, Task, Activity } from '../../../shared/contracts.ts';
import { hash, id, now, token } from '../auth.ts';
import { ensure } from '../errors.ts';
import { organiser, activeEvent } from '../permissions.ts';
import type { Context } from '../domain.ts';
import {
  attendeeInput,
  attendeeView,
  publicEvent,
  guestContext,
  type AttendeePort,
  type AttendeeLink,
  type AttendeeReceipt,
} from '../attendees.ts';
import { MongoStore } from './store.ts';
import { MongoDomain } from './domain.ts';
import { MongoAccounts } from './accounts.ts';

export class MongoAttendees implements AttendeePort {
  constructor(
    readonly store: MongoStore,
    readonly accounts: MongoAccounts,
  ) {}
  async links(ctx: Context) {
    organiser(ctx);
    const links = await this.store.all<AttendeeLink>(
      'attendee_links',
      { event_id: ctx.event.id },
      { created_at: -1 },
    );
    return links.map(({ id, created_at, revoked_at }) => ({ id, created_at, revoked_at }));
  }
  async createLink(ctx: Context) {
    organiser(ctx);
    ensure(
      !ctx.isIntegration,
      403,
      'FORBIDDEN',
      'Use your signed-in account to share attendee access.',
    );
    const secret = token(),
      linkId = id();
    await this.store.transaction(async (tx) => {
      await tx.update('events', { id: ctx.event.id }, { $inc: { attendee_link_version: 1 } });
      const count = await tx
        .collection('attendee_links')
        .countDocuments({ event_id: ctx.event.id, revoked_at: null }, { session: tx.session });
      ensure(
        count < 10,
        422,
        'LINK_LIMIT',
        'Disable an old attendee link before creating another.',
      );
      await tx.insert('attendee_links', {
        id: linkId,
        event_id: ctx.event.id,
        token_hash: hash(secret),
        created_at: now(),
        revoked_at: null,
      });
      await new MongoDomain(tx, this.accounts).append(
        tx,
        ctx,
        'public-link-' + linkId,
        hash(linkId),
        { id: linkId },
        'attendee_link',
        linkId,
        'attendee_link.create',
        null,
        { id: linkId },
      );
    });
    return { id: linkId, token: secret };
  }
  async revoke(ctx: Context, linkId: string) {
    organiser(ctx);
    ensure(!ctx.isIntegration, 403, 'FORBIDDEN', 'Use your signed-in account.');
    await this.store.transaction(async (tx) => {
      const link = await tx.get<AttendeeLink>('attendee_links', {
        id: linkId,
        event_id: ctx.event.id,
      });
      ensure(link, 404, 'NOT_FOUND', 'Attendee link not found.');
      if (link.revoked_at) return;
      await tx.update('attendee_links', { id: link.id }, { $set: { revoked_at: now() } });
      await new MongoDomain(tx, this.accounts).append(
        tx,
        ctx,
        'public-revoke-' + linkId,
        hash(linkId),
        { id: linkId },
        'attendee_link',
        linkId,
        'attendee_link.revoke',
        null,
        { id: linkId },
      );
    });
    return { ok: true };
  }
  async find(tx: MongoStore, eventId: string, secret: string, active = true) {
    const link = await tx.get<AttendeeLink>('attendee_links', {
      event_id: eventId,
      token_hash: hash(secret),
    });
    ensure(link, 404, 'NOT_FOUND', 'This attendee link is unavailable.');
    if (active)
      ensure(
        !link.revoked_at,
        410,
        'LINK_DISABLED',
        'The organiser disabled this attendee link. Existing tracking links still work.',
      );
    const event = await tx.get<Event>('events', { id: eventId });
    ensure(event, 404, 'NOT_FOUND', 'Event not found.');
    if (active) activeEvent(event);
    return { link, event };
  }
  async event(eventId: string, secret: string) {
    return publicEvent((await this.find(this.store, eventId, secret)).event);
  }
  async submit(eventId: string, secret: string, key: string, p: Record<string, unknown>) {
    const { input, digest, receiptHash } = attendeeInput(p, key);
    const replay = (previous: AttendeeReceipt, link: AttendeeLink) => {
      ensure(
        previous.request_hash === digest && previous.link_id === link.id,
        409,
        'IDEMPOTENCY_MISMATCH',
        'This request ID belongs to a different request.',
      );
      return { requestId: previous.task_id, replayed: true };
    };
    try {
      return await this.store.transaction(async (tx) => {
        const { link, event } = await this.find(tx, eventId, secret, false);
        const previous = await tx.get<AttendeeReceipt>('attendee_receipts', {
          event_id: eventId,
          request_key: key,
        });
        if (previous) return replay(previous, link);
        ensure(
          !link.revoked_at,
          410,
          'LINK_DISABLED',
          'The organiser disabled this attendee link.',
        );
        await tx.update(
          'attendee_links',
          { id: link.id, revoked_at: null },
          { $inc: { requests_seen: 1 } },
        );
        const ctx = guestContext(event, input.name);
        await tx.insert('members', ctx.me);
        const result = await new MongoDomain(tx, this.accounts).execute(ctx, key, {
          action: 'task.create',
          payload: {
            title: input.title,
            description: input.description,
            location: input.location,
            priority: input.priority,
          },
        });
        await tx.insert('attendee_receipts', {
          token_hash: receiptHash,
          event_id: eventId,
          link_id: link.id,
          member_id: ctx.me.id,
          task_id: result.entityId,
          request_key: key,
          request_hash: digest,
          created_at: now(),
        });
        return { requestId: result.entityId, replayed: false };
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        const { link } = await this.find(this.store, eventId, secret, false);
        const previous = await this.store.get<AttendeeReceipt>('attendee_receipts', {
          event_id: eventId,
          request_key: key,
        });
        if (previous) return replay(previous, link);
        ensure(false, 409, 'RECEIPT_USED', 'This tracking key already belongs to another request.');
      }
      throw error;
    }
  }
  async track(secret: string) {
    return this.store.transaction(async (tx) => {
      const receipt = await tx.get<AttendeeReceipt>('attendee_receipts', {
        token_hash: hash(secret),
      });
      ensure(
        receipt,
        404,
        'NOT_FOUND',
        'This request is unavailable. Check your private tracking link.',
      );
      const event = await tx.get<Event>('events', { id: receipt.event_id });
      const task = await tx.get<Task>('tasks', { id: receipt.task_id, event_id: receipt.event_id });
      ensure(event && task, 404, 'NOT_FOUND', 'Request unavailable.');
      return attendeeView(
        event,
        task,
        await tx.all<Activity>('activity', { event_id: event.id, entity_id: task.id }, { id: 1 }),
      );
    });
  }
}
