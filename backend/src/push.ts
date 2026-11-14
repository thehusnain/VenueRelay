import * as webpush from 'web-push';
import type { PushSubscription } from 'web-push';
import type { IncomingMessage } from 'node:http';
import type { Store } from './database.ts';
import type { Context } from './domain.ts';
import { hash, id, now, sessionValue } from './auth.ts';
import { ApiError, ensure, text } from './errors.ts';
export interface PushSettings {
  publicKey: string;
  privateKey: string;
  subject: string;
}
export function pushSettings(): PushSettings | undefined {
  const {
    VAPID_PUBLIC_KEY: publicKey,
    VAPID_PRIVATE_KEY: privateKey,
    VAPID_SUBJECT: subject,
  } = process.env;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : undefined;
}
export class PushService {
  constructor(
    private store: Store,
    readonly settings?: PushSettings,
    private deliver = webpush.sendNotification,
  ) {}
  subscribe(ctx: Context, req: IncomingMessage, p: Record<string, unknown>) {
    ensure(
      this.settings,
      503,
      'PUSH_UNAVAILABLE',
      'Browser push is not configured. Updates remain available in Rally.',
    );
    ensure(
      !ctx.isIntegration && ctx.me.user_id === ctx.user.id,
      403,
      'FORBIDDEN',
      'Use your own signed-in event membership.',
    );
    const endpoint = text(p.endpoint, 'Push endpoint', 2000);
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      throw new ApiError(422, 'INVALID_PUSH_ENDPOINT', 'Use a browser push subscription URL.');
    }
    ensure(
      url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        !url.port &&
        (url.hostname === 'fcm.googleapis.com' ||
          url.hostname === 'updates.push.services.mozilla.com' ||
          url.hostname.endsWith('.push.services.mozilla.com') ||
          url.hostname.endsWith('.push.apple.com') ||
          url.hostname.endsWith('.notify.windows.com')),
      422,
      'INVALID_PUSH_ENDPOINT',
      'Use a subscription provided by a supported browser.',
    );
    const keys = p.keys as Record<string, unknown> | undefined;
    ensure(
      keys &&
        typeof keys.p256dh === 'string' &&
        /^[A-Za-z0-9_-]{87}=?$/.test(keys.p256dh) &&
        typeof keys.auth === 'string' &&
        /^[A-Za-z0-9_-]{22}={0,2}$/.test(keys.auth),
      422,
      'VALIDATION_ERROR',
      'The push subscription keys are invalid.',
    );
    const sessionToken = sessionValue(req);
    ensure(sessionToken, 401, 'UNAUTHENTICATED', 'Sign in again.');
    this.store.transaction(() => {
      const existing = this.store.get<{ user_id: string }>(
        'SELECT user_id FROM push_subscriptions WHERE endpoint=?',
        endpoint,
      );
      const count = this.store.get<{ n: number }>(
        'SELECT COUNT(*) n FROM push_subscriptions WHERE user_id=?',
        ctx.user.id,
      )!.n;
      ensure(existing || count < 20, 422, 'PUSH_LIMIT', 'Remove an old device subscription first.');
      if (existing) this.store.run('DELETE FROM push_subscriptions WHERE endpoint=?', endpoint);
      this.store.run(
        'INSERT INTO push_subscriptions VALUES (?,?,?,?,?,?,?,?,?)',
        id(),
        endpoint,
        ctx.user.id,
        ctx.event.id,
        ctx.me.id,
        hash(sessionToken),
        keys.p256dh as string,
        keys.auth as string,
        now(),
      );
    });
  }
  unsubscribe(ctx: Context, p: Record<string, unknown>) {
    this.store.run(
      'DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?',
      text(p.endpoint, 'Push endpoint', 2000),
      ctx.user.id,
    );
  }
  async runBatch() {
    if (!this.settings) return;
    this.store.run(
      'DELETE FROM push_subscriptions WHERE session_hash IN (SELECT token_hash FROM sessions WHERE expires_at<=?)',
      now(),
    );
    this.store.run(
      'INSERT OR IGNORE INTO push_deliveries (notification_id,subscription_id) SELECT n.id,s.id FROM notifications n JOIN push_subscriptions s ON s.member_id=n.member_id JOIN members m ON m.id=s.member_id AND m.user_id=s.user_id WHERE n.read_at IS NULL AND n.created_at>=s.created_at',
    );
    this.store.run(
      "UPDATE push_deliveries SET state='sent' WHERE notification_id IN (SELECT id FROM notifications WHERE read_at IS NOT NULL)",
    );
    const jobs = this.store.all<{
      notification_id: string;
      subscription_id: string;
      attempts: number;
      endpoint: string;
      p256dh: string;
      auth: string;
      task_id: string;
    }>(
      "SELECT d.*,s.endpoint,s.p256dh,s.auth,n.task_id FROM push_deliveries d JOIN push_subscriptions s ON s.id=d.subscription_id JOIN notifications n ON n.id=d.notification_id JOIN members m ON m.id=s.member_id AND m.user_id=s.user_id JOIN sessions a ON a.token_hash=s.session_hash WHERE d.state='pending' AND d.next_attempt_at<=? AND d.lease_until<=? AND a.expires_at>? LIMIT 10",
      Date.now(),
      Date.now(),
      now(),
    );
    for (const job of jobs) {
      const claimed = this.store.run(
        "UPDATE push_deliveries SET lease_until=? WHERE notification_id=? AND subscription_id=? AND state='pending' AND lease_until<=?",
        Date.now() + 30000,
        job.notification_id,
        job.subscription_id,
        Date.now(),
      );
      if (!claimed.changes) continue;
      try {
        const subscription: PushSubscription = {
          endpoint: job.endpoint,
          keys: { p256dh: job.p256dh, auth: job.auth },
        };
        await this.deliver(
          subscription,
          JSON.stringify({
            id: job.notification_id,
            url: job.task_id ? '/tasks/' + job.task_id : '/',
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
        this.store.run(
          "UPDATE push_deliveries SET state='sent',lease_until=0 WHERE notification_id=? AND subscription_id=?",
          job.notification_id,
          job.subscription_id,
        );
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410)
          this.store.run('DELETE FROM push_subscriptions WHERE id=?', job.subscription_id);
        else
          this.store.run(
            'UPDATE push_deliveries SET attempts=attempts+1,next_attempt_at=?,lease_until=0,state=? WHERE notification_id=? AND subscription_id=?',
            Date.now() + Math.min(300000, 5000 * 2 ** Math.min(job.attempts, 6)),
            job.attempts >= 7 ? 'failed' : 'pending',
            job.notification_id,
            job.subscription_id,
          );
      }
    }
  }
  start() {
    let running: Promise<void> | undefined;
    const tick = () => {
      if (!running)
        running = this.runBatch()
          .catch((e) => console.error('Push retry deferred:', e.message))
          .finally(() => {
            running = undefined;
          });
    };
    const timer = setInterval(tick, 5000);
    timer.unref();
    return async () => {
      clearInterval(timer);
      await running;
    };
  }
}
