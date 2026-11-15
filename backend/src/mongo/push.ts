import * as webpush from 'web-push';
import type { IncomingMessage } from 'node:http';
import type { Context } from '../domain.ts';
import { validatePushSubscription, type PushSettings } from '../push.ts';
import { hash, id, now } from '../auth.ts';
import { ensure, text } from '../errors.ts';
import { MongoStore } from './store.ts';
export class MongoPush {
  constructor(
    readonly store: MongoStore,
    public settings?: PushSettings,
    readonly deliver = webpush.sendNotification,
  ) {}
  async configure(origin: string) {
    if (this.settings) return;
    const key = 'browser-push';
    let saved = await this.store.get<PushSettings>('server_settings', { key });
    if (!saved) {
      const pair = webpush.generateVAPIDKeys();
      try {
        await this.store.update(
          'server_settings',
          { key },
          {
            $setOnInsert: {
              key,
              ...pair,
              subject: origin.replace(/^http:/, 'https:'),
              created_at: now(),
            },
          },
          true,
        );
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
      }
      saved = await this.store.get<PushSettings>('server_settings', { key });
    }
    ensure(
      saved?.publicKey && saved.privateKey && saved.subject,
      503,
      'PUSH_UNAVAILABLE',
      'Notification setup could not be loaded. Please retry.',
    );
    this.settings = {
      publicKey: saved.publicKey,
      privateKey: saved.privateKey,
      subject: saved.subject,
    };
  }
  async removeSubscription(subscriptionId: string, store = this.store) {
    await store.remove('push_deliveries', { subscription_id: subscriptionId });
    await store.remove('push_subscriptions', { id: subscriptionId });
  }
  async subscribe(ctx: Context, req: IncomingMessage, p: Record<string, unknown>) {
    const { endpoint, keys, sessionToken } = validatePushSubscription(ctx, req, p, this.settings);
    await this.store.transaction(async (tx) => {
      const existing = await tx.get<{ id: string }>('push_subscriptions', { endpoint });
      const count = await tx
        .collection('push_subscriptions')
        .countDocuments({ user_id: ctx.user.id }, { session: tx.session });
      ensure(existing || count < 20, 422, 'PUSH_LIMIT', 'Remove an old device subscription first.');
      if (existing) await this.removeSubscription(existing.id, tx);
      await tx.insert('push_subscriptions', {
        id: id(),
        endpoint,
        user_id: ctx.user.id,
        event_id: ctx.event.id,
        member_id: ctx.me.id,
        session_hash: hash(sessionToken),
        p256dh: keys.p256dh,
        auth: keys.auth,
        created_at: now(),
      });
    });
  }
  async unsubscribe(ctx: Context, p: Record<string, unknown>) {
    const row = await this.store.get<{ id: string }>('push_subscriptions', {
      endpoint: text(p.endpoint, 'Push endpoint', 2000),
      user_id: ctx.user.id,
    });
    if (row) await this.removeSubscription(row.id);
  }
  async runBatch() {
    if (!this.settings) return;
    const subscriptions = await this.store.all<{
      id: string;
      member_id: string;
      user_id: string;
      session_hash: string;
      created_at: string;
    }>('push_subscriptions');
    for (const sub of subscriptions) {
      const auth = await this.store.get('sessions', {
          token_hash: sub.session_hash,
          user_id: sub.user_id,
          expires_at: { $gt: now() },
        }),
        member = await this.store.get('members', { id: sub.member_id, user_id: sub.user_id });
      if (!auth || !member) {
        await this.removeSubscription(sub.id);
        continue;
      }
      const unread = await this.store.all<{ id: string }>('notifications', {
        member_id: sub.member_id,
        read_at: null,
        created_at: { $gte: sub.created_at },
      });
      for (const note of unread)
        try {
          await this.store.update(
            'push_deliveries',
            { notification_id: note.id, subscription_id: sub.id },
            {
              $setOnInsert: {
                state: 'pending',
                attempts: 0,
                next_attempt_at: 0,
                lease_until: 0,
                lease_id: null,
              },
            },
            true,
          );
        } catch (error) {
          if ((error as { code?: number }).code !== 11000) throw error;
        }
    }
    for (let n = 0; n < 10; n++) {
      const lease = id();
      const job = await this.store.collection('push_deliveries').findOneAndUpdate(
        {
          state: 'pending',
          next_attempt_at: { $lte: Date.now() },
          lease_until: { $lte: Date.now() },
        },
        { $set: { lease_until: Date.now() + 30000, lease_id: lease } },
        { returnDocument: 'after' },
      );
      if (!job) break;
      const filter = {
        notification_id: job.notification_id,
        subscription_id: job.subscription_id,
        lease_id: lease,
      };
      const sub = await this.store.get<{
        id: string;
        endpoint: string;
        p256dh: string;
        auth: string;
        session_hash: string;
        member_id: string;
        user_id: string;
      }>('push_subscriptions', { id: job.subscription_id });
      const note = await this.store.get<{
        read_at: string | null;
        task_id: string;
        event_id: string;
      }>('notifications', { id: job.notification_id });
      if (
        !sub ||
        !note ||
        !(await this.store.get('sessions', {
          token_hash: sub.session_hash,
          user_id: sub.user_id,
          expires_at: { $gt: now() },
        })) ||
        !(await this.store.get('members', { id: sub.member_id, user_id: sub.user_id }))
      ) {
        await this.store.remove('push_deliveries', filter);
        continue;
      }
      if (note.read_at) {
        await this.store.update('push_deliveries', filter, {
          $set: { state: 'sent', lease_id: null, lease_until: 0 },
        });
        continue;
      }
      try {
        await this.deliver(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            id: job.notification_id,
            eventId: note.event_id,
            taskId: note.task_id || undefined,
            url: note.task_id ? '/tasks/' + note.task_id : '/',
          }),
          {
            TTL: 3600,
            timeout: 10000,
            vapidDetails: {
              subject: this.settings.subject,
              publicKey: this.settings.publicKey,
              privateKey: this.settings.privateKey,
            },
          },
        );
        await this.store.update('push_deliveries', filter, {
          $set: { state: 'sent', lease_id: null, lease_until: 0 },
        });
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await this.removeSubscription(sub.id);
        else
          await this.store.update('push_deliveries', filter, {
            $inc: { attempts: 1 },
            $set: {
              state: job.attempts >= 7 ? 'failed' : 'pending',
              next_attempt_at: Date.now() + Math.min(300000, 5000 * 2 ** Math.min(job.attempts, 6)),
              lease_id: null,
              lease_until: 0,
            },
          });
      }
    }
  }
}
