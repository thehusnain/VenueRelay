import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { ApplicationBackend } from '../backend.ts';
import { MongoStore } from './store.ts';
import { publicAttendeeRoute } from '../attendees.ts';
import { MongoAttendees } from './attendees.ts';
import { MongoAccounts } from './accounts.ts';
import { MongoDomain } from './domain.ts';
import { MongoPush } from './push.ts';
import { attachMongoRealtime } from './realtime.ts';
import { organiser } from '../permissions.ts';
import { demoScript } from '../demo-script.ts';
import { demoCredentials, type Member } from '../../../shared/contracts.ts';
import { id, token, hash, now, passwordHash, publicUser, sessionValue } from '../auth.ts';
import { ApiError, ensure, text } from '../errors.ts';
import { emailSettings, type EmailSettings, checkEmailDomain } from '../email.ts';
import { pushSettings, type PushSettings } from '../push.ts';
import type { CommandInput } from '../mutations.ts';
export class MongoBackend implements ApplicationBackend {
  readonly storage = 'mongodb';
  readonly accounts: MongoAccounts;
  readonly domain: MongoDomain;
  readonly push: MongoPush;
  private live?: ReturnType<typeof attachMongoRealtime>;
  private preparing?: Promise<void>;
  private wakeDelivery?: () => void;
  constructor(
    readonly store: MongoStore,
    readonly settings: {
      mail?: EmailSettings;
      secure?: boolean;
      demo?: boolean;
      checkDomain?: typeof checkEmailDomain;
      push?: PushSettings;
    } = {},
  ) {
    this.accounts = new MongoAccounts(
      store,
      settings.mail ?? emailSettings(),
      !!settings.secure,
      settings.checkDomain,
    );
    this.domain = new MongoDomain(store, this.accounts);
    this.push = new MongoPush(store, settings.push ?? pushSettings());
  }
  health() {
    return this.store.ping();
  }
  prepare() {
    return (this.preparing ??= this.push.configure(this.accounts.mail.origin).catch((error) => {
      this.preparing = undefined;
      throw error;
    }));
  }
  async pushConfiguration() {
    await this.prepare();
    return { enabled: !!this.push.settings, publicKey: this.push.settings?.publicKey ?? null };
  }
  stopLive() {
    this.live?.stop();
  }
  attach(server: Server, allowed: Set<string>, secure: boolean) {
    this.live = attachMongoRealtime(server, this.domain, allowed, secure);
    return this.live;
  }
  private changed(eventId?: string) {
    void this.live?.invalidate(eventId).catch(() => console.error('Live refresh deferred'));
  }
  async ensureDemo() {
    if (!this.settings.demo) return;
    const saved = await passwordHash(demoCredentials.password);
    try {
      await this.store.transaction(async (tx) => {
        let user = await tx.get<import('../auth.ts').User>('users', {
          email: demoCredentials.email,
        });
        if (!user) {
          user = {
            id: id(),
            email: demoCredentials.email,
            name: 'Demo organiser',
            email_verified_at: now(),
          };
          await tx.insert('users', {
            ...user,
            password_hash: saved,
            created_at: now(),
            is_demo: true,
          });
        }
        const accounts = new MongoAccounts(
            tx,
            this.accounts.mail,
            this.accounts.secure,
            this.settings.checkDomain,
          ),
          domain = new MongoDomain(tx, accounts);
        const existing = await domain.eventForUser(user.id, tx);
        const eventId =
          existing?.id ??
          (await domain.createEvent(
            user,
            {
              name: 'Riverside Makers Festival',
              venue: 'Riverside Park, Lahore',
              date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
            },
            true,
            tx,
          ));
        if (await tx.get('tasks', { event_id: eventId })) return;
        const req = { headers: {} } as IncomingMessage,
          ctx = await domain.context(req, eventId, tx, user),
          members = await tx.all<Member>('members', { event_id: eventId });
        const script = demoScript(ctx.event, members);
        let step = script.next();
        while (!step.done)
          step = script.next(await domain.execute(ctx, step.value.key, step.value.input));
      });
    } catch (error) {
      if (
        (error as { code?: number }).code !== 11000 ||
        !(await this.store.get('users', { email: demoCredentials.email }))
      )
        throw error;
    }
  }
  async handle(
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
    method: string | undefined,
    body: () => Promise<Record<string, unknown>>,
    send: (value: unknown, status?: number) => void,
  ) {
    const attendees = new MongoAttendees(this.store, this.accounts);
    if (
      await publicAttendeeRoute({
        path,
        method,
        req,
        service: attendees,
        body,
        send,
        limit: (key, max, window) => this.accounts.limit(key, max, window),
      })
    ) {
      if (method === 'POST') {
        const requestEvent = path.match(/^\/api\/v1\/attendee-events\/([^/]+)\/requests$/)?.[1];
        this.changed(requestEvent ? decodeURIComponent(requestEvent) : undefined);
        this.wakeDelivery?.();
      }
      return;
    }
    if (path.startsWith('/api/v1/auth/')) {
      const route = path.slice('/api/v1/auth/'.length);
      const result = await this.accounts.handle(
        req,
        res,
        route,
        method,
        method === 'POST' ? await body() : {},
      );
      send(result);
      if (['logout', 'reset-password', 'recover-account', 'login'].includes(route)) this.changed();
      return;
    }
    if (path === '/api/v1/bootstrap' && method === 'POST') {
      const user = await this.accounts.require(req),
        event = await this.domain.eventForUser(user.id);
      if (!event) {
        send({ requiresSetup: true, user: publicUser(user) });
        return;
      }
      const ctx = await this.domain.context(req, event.id, this.store, user);
      send(await this.domain.snapshot(ctx));
      return;
    }
    if (path === '/api/v1/events' && method === 'POST') {
      const user = await this.accounts.require(req);
      ensure(
        user.email || user.username,
        403,
        'ACCOUNT_REQUIRED',
        'Create and verify an account to start an event.',
      );
      await this.domain.realUser(user);
      send({ eventId: await this.domain.createEvent(user, await body()) }, 201);
      return;
    }
    if (path === '/api/v1/invitations/accept' && method === 'POST') {
      const user = await this.accounts.require(req),
        p = await body(),
        result = await this.domain.accept(user, text(p.token, 'Invitation token', 200));
      send(result);
      this.changed(result.eventId);
      return;
    }
    const match = path.match(/^\/api\/v1\/events\/([^/]+)(?:\/(.*))?$/);
    ensure(match, 404, 'NOT_FOUND', 'Endpoint not found.');
    const ctx = await this.domain.context(req, decodeURIComponent(match[1])),
      resource = match[2] ?? 'snapshot';
    if (resource === 'attendee-links' && method === 'GET') {
      send({ items: await attendees.links(ctx) });
      return;
    }
    if (resource === 'attendee-links' && method === 'POST') {
      send(await attendees.createLink(ctx), 201);
      this.changed(ctx.event.id);
      return;
    }
    if (resource.startsWith('attendee-links/') && method === 'DELETE') {
      send(await attendees.revoke(ctx, resource.slice(15)));
      this.changed(ctx.event.id);
      return;
    }
    if (resource === 'snapshot' && method === 'GET') {
      send(await this.domain.snapshot(ctx));
      return;
    }
    if (resource === 'live-ticket' && method === 'POST') {
      ensure(!ctx.isIntegration, 403, 'FORBIDDEN', 'Use a browser session for live updates.');
      const raw = sessionValue(req);
      ensure(raw, 401, 'UNAUTHENTICATED', 'Sign in again.');
      const value = token();
      await this.store.insert('live_tickets', {
        token_hash: hash(value),
        session_hash: hash(raw),
        event_id: ctx.event.id,
        persona: String(req.headers['x-rally-persona'] ?? 'self'),
        origin: req.headers.origin ?? this.accounts.mail.origin,
        expires: new Date(Date.now() + 30000),
      });
      send({ ticket: value, expiresInSeconds: 30 });
      return;
    }
    if (resource === 'commands' && method === 'POST') {
      const expected = req.headers['x-rally-expected-actor'];
      ensure(
        !expected || expected === ctx.me.id,
        409,
        'ACTOR_CHANGED',
        'Your signed-in account changed. Sign in with the account that saved this change.',
      );
      const p = await body();
      ensure(typeof p.action === 'string', 422, 'VALIDATION_ERROR', 'An action is required.');
      send(
        await this.domain.execute(
          ctx,
          String(req.headers['idempotency-key'] ?? ''),
          p as unknown as CommandInput,
        ),
      );
      this.changed(ctx.event.id);
      this.wakeDelivery?.();
      return;
    }
    if (resource === 'activity' && method === 'GET') {
      const url = new URL(req.url ?? '/', this.accounts.mail.origin),
        after = Number(url.searchParams.get('after') ?? 0),
        limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 50)));
      ensure(
        Number.isInteger(after) && after >= 0 && Number.isInteger(limit),
        422,
        'VALIDATION_ERROR',
        'Use integer pagination values.',
      );
      const rows = await this.domain.activity(ctx, after, limit + 1);
      send({
        items: rows.slice(0, limit),
        nextCursor: rows.length > limit ? rows[limit - 1].id : null,
      });
      return;
    }
    if (resource === 'notifications/read' && method === 'POST') {
      ensure(
        !req.headers['x-rally-expected-actor'] ||
          req.headers['x-rally-expected-actor'] === ctx.me.id,
        409,
        'ACTOR_CHANGED',
        'Sign in with the account that saved this read status.',
      );
      const p = await body();
      ensure(
        Array.isArray(p.ids) && p.ids.length <= 100 && p.ids.every((x) => typeof x === 'string'),
        422,
        'VALIDATION_ERROR',
        'Supply up to 100 notification IDs.',
      );
      await this.store.updateMany(
        'notifications',
        { id: { $in: p.ids }, member_id: ctx.me.id, read_at: null },
        { $set: { read_at: now() } },
      );
      send({ ok: true });
      this.changed(ctx.event.id);
      return;
    }
    if (resource === 'invitations' && method === 'POST') {
      send(await this.domain.invite(ctx, await body()), 201);
      this.changed(ctx.event.id);
      return;
    }
    if (resource === 'invitations' && method === 'GET') {
      const url = new URL(req.url ?? '/', this.accounts.mail.origin),
        offset = Number(url.searchParams.get('offset') ?? 0),
        limit = Number(url.searchParams.get('limit') ?? 50);
      ensure(
        Number.isInteger(offset) &&
          offset >= 0 &&
          Number.isInteger(limit) &&
          limit >= 1 &&
          limit <= 100,
        422,
        'VALIDATION_ERROR',
        'Use a non-negative offset and a limit between 1 and 100.',
      );
      send(await this.domain.listInvitations(ctx, offset, limit));
      return;
    }
    const invitationAction = resource.match(/^invitations\/([^/]+)(\/renew)?$/);
    if (
      invitationAction &&
      ((method === 'DELETE' && !invitationAction[2]) || (method === 'POST' && invitationAction[2]))
    ) {
      send(await this.domain.manageInvitation(ctx, invitationAction[1], method === 'POST'));
      this.changed(ctx.event.id);
      return;
    }
    if (resource === 'integrity' && method === 'GET') {
      send(await this.domain.integrity(ctx));
      return;
    }
    if (resource === 'api-keys' && method === 'GET') {
      organiser(ctx);
      const rows = await this.store.all<{
        id: string;
        name: string;
        created_at: string;
        revoked_at: string | null;
      }>('api_keys', { event_id: ctx.event.id }, { created_at: -1 });
      send({
        items: rows.map(({ id, name, created_at, revoked_at }) => ({
          id,
          name,
          created_at,
          revoked_at,
        })),
      });
      return;
    }
    if (resource === 'api-keys' && method === 'POST') {
      const p = await body();
      send(await this.domain.createKey(ctx, text(p.name, 'Token name', 80, 2)), 201);
      this.changed(ctx.event.id);
      return;
    }
    if (resource.startsWith('api-keys/') && method === 'DELETE') {
      send(await this.domain.revokeKey(ctx, resource.slice(9)));
      this.changed(ctx.event.id);
      return;
    }
    if (resource === 'export' && method === 'GET') {
      organiser(ctx);
      send({
        event: ctx.event,
        tasks: await this.store.all('tasks', { event_id: ctx.event.id }),
        activity: await this.store.all('activity', { event_id: ctx.event.id }, { id: 1 }),
        exportedAt: now(),
      });
      return;
    }
    if (resource === 'push/subscription' && method === 'GET') {
      send({
        enabled: !!(await this.store.get('push_subscriptions', {
          member_id: ctx.me.id,
          session_hash: hash(sessionValue(req) ?? ''),
        })),
      });
      return;
    }
    if (resource === 'push/subscription' && method === 'POST') {
      await this.push.subscribe(ctx, req, await body());
      send({ ok: true });
      return;
    }
    if (resource === 'push/subscription' && method === 'DELETE') {
      await this.push.unsubscribe(ctx, await body());
      send({ ok: true });
      return;
    }
    throw new ApiError(404, 'NOT_FOUND', 'Endpoint not found.');
  }
  startWorkers() {
    let stopped = false,
      running: Promise<void> | undefined;
    const tick = () => {
      if (!stopped && !running)
        running = Promise.all([
          (async () => {
            for (let i = 0; i < 10 && !stopped; i++) if (!(await this.accounts.deliver())) break;
          })(),
          this.prepare().then(() => this.push.runBatch()),
        ])
          .then(() => {})
          .catch(() => console.error('Delivery worker will retry'))
          .finally(() => {
            running = undefined;
          });
    };
    const timer = setInterval(tick, 5000);
    this.wakeDelivery = tick;
    timer.unref();
    void tick();
    return async () => {
      stopped = true;
      this.wakeDelivery = undefined;
      clearInterval(timer);
      await running;
    };
  }
}
