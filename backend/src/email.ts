import { Resolver } from 'node:dns/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import nodemailer from 'nodemailer';
import isEmail from 'validator/lib/isEmail.js';
import type { Store } from './database.ts';
import { id, now } from './auth.ts';
import { ApiError, ensure } from './errors.ts';

export type EmailMode = 'smtp' | 'preview' | 'disabled';
export interface EmailSettings {
  mode: EmailMode;
  origin: string;
  from: string;
  previewDir: string;
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  password?: string;
}
export interface MailJob {
  id: string;
  user_id: string;
  token_id: string;
  recipient: string;
  subject: string;
  body: string;
  attempts: number;
  lease_id: string;
  created_at: string;
}
export function emailSettings(): EmailSettings {
  const mode = (process.env.EMAIL_TRANSPORT ??
    (process.env.NODE_ENV === 'production' ? 'disabled' : 'preview')) as EmailMode;
  ensure(
    ['smtp', 'preview', 'disabled'].includes(mode),
    500,
    'EMAIL_CONFIG',
    'Invalid email transport setting.',
  );
  const origin = process.env.APP_ORIGIN ?? 'http://127.0.0.1:3001';
  const parsed = new URL(origin);
  ensure(
    ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password,
    500,
    'EMAIL_CONFIG',
    'APP_ORIGIN must be an HTTP origin.',
  );
  if (process.env.NODE_ENV === 'production')
    ensure(
      mode !== 'preview' && parsed.protocol === 'https:',
      500,
      'EMAIL_CONFIG',
      'Production requires HTTPS and SMTP or disabled email delivery.',
    );
  return {
    mode,
    origin: parsed.origin,
    from: process.env.EMAIL_FROM ?? 'VenueRelay <hello@localhost>',
    previewDir: resolve(process.env.EMAIL_PREVIEW_DIR ?? 'data/mail-preview'),
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
  };
}
export function normaliseEmail(value: unknown) {
  ensure(typeof value === 'string', 422, 'INVALID_EMAIL', 'Enter your email address.');
  const email = value.trim().toLowerCase();
  ensure(
    isEmail(email, { allow_utf8_local_part: false, require_tld: true, allow_ip_domain: false }),
    422,
    'INVALID_EMAIL',
    'Enter a complete email address, such as name@example.com.',
  );
  return email;
}
interface DomainResolver {
  resolveMx(domain: string): Promise<{ exchange: string; priority: number }[]>;
  resolve4(domain: string): Promise<string[]>;
  resolve6(domain: string): Promise<string[]>;
  cancel(): void;
}
export async function checkEmailDomain(email: string, injected?: DomainResolver) {
  const domain = email.slice(email.lastIndexOf('@') + 1),
    resolver = injected ?? new Resolver({ timeout: 3000, tries: 1 });
  try {
    let records;
    try {
      records = await resolver.resolveMx(domain);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENODATA') {
        const addresses = await Promise.allSettled([
          resolver.resolve4(domain),
          resolver.resolve6(domain),
        ]);
        if (addresses.some((r) => r.status === 'fulfilled' && r.value.length)) return;
        const permanent = addresses.every(
          (r) =>
            r.status === 'fulfilled' ||
            ['ENOTFOUND', 'ENODATA'].includes((r.reason as NodeJS.ErrnoException).code ?? ''),
        );
        if (!permanent)
          throw new ApiError(
            503,
            'EMAIL_LOOKUP_UNAVAILABLE',
            'We could not check this email provider right now. Please try again.',
          );
        throw new ApiError(
          422,
          'EMAIL_DOMAIN',
          'This email domain cannot receive mail. Check the address.',
        );
      }
      throw error;
    }
    ensure(
      records.length && records.some((r) => r.exchange && r.exchange !== '.'),
      422,
      'EMAIL_DOMAIN',
      'This email domain does not accept mail. Check the address.',
    );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    if (['ENOTFOUND', 'ENODATA'].includes(code ?? ''))
      throw new ApiError(
        422,
        'EMAIL_DOMAIN',
        'This email domain could not be found. Check the spelling.',
      );
    throw new ApiError(
      503,
      'EMAIL_LOOKUP_UNAVAILABLE',
      'We could not check your email provider right now. Your details have been kept; please try again.',
    );
  } finally {
    resolver.cancel();
  }
}
export function claimMail(store: Store, stamp = now()): MailJob | undefined {
  return store.transaction(() => {
    store.run(
      "UPDATE email_outbox SET status='cancelled',body='',lease_id=NULL,lease_until=NULL WHERE status IN ('pending','sending') AND token_id IN (SELECT id FROM account_tokens WHERE expires_at<=? OR used_at IS NOT NULL)",
      stamp,
    );
    const job = store.get<MailJob>(
      "SELECT e.* FROM email_outbox e JOIN account_tokens t ON t.id=e.token_id WHERE ((e.status='pending' AND e.next_attempt_at<=?) OR (e.status='sending' AND e.lease_until<?)) AND t.used_at IS NULL AND t.expires_at>? ORDER BY e.created_at LIMIT 1",
      stamp,
      stamp,
      stamp,
    );
    if (!job) return;
    const lease = id();
    store.run(
      "UPDATE email_outbox SET status='sending',attempts=attempts+1,lease_id=?,lease_until=? WHERE id=?",
      lease,
      new Date(Date.parse(stamp) + 60000).toISOString(),
      job.id,
    );
    return { ...job, lease_id: lease, attempts: job.attempts + 1 };
  });
}
export async function sendMail(settings: EmailSettings, job: MailJob) {
  if (settings.mode === 'preview') {
    await mkdir(settings.previewDir, { recursive: true, mode: 0o700 });
    await writeFile(
      resolve(settings.previewDir, job.id + '.eml'),
      `To: ${job.recipient}\nFrom: ${settings.from}\nSubject: ${job.subject}\nMessage-ID: <${job.id}@rally.local>\nContent-Type: text/plain; charset=utf-8\n\n${job.body}`,
      { mode: 0o600 },
    );
  } else {
    ensure(
      settings.host && settings.from && !settings.from.includes('@localhost'),
      503,
      'EMAIL_CONFIG',
      'SMTP host and a verified sender are required.',
    );
    const transport = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      requireTLS: !settings.secure,
      auth: settings.user ? { user: settings.user, pass: settings.password } : undefined,
      connectionTimeout: 10000,
      socketTimeout: 20000,
      greetingTimeout: 10000,
    });
    const info = await transport.sendMail({
      from: settings.from,
      to: job.recipient,
      subject: job.subject,
      text: job.body,
      messageId: `<${job.id}@${new URL(settings.origin).hostname}>`,
    });
    ensure(
      info.accepted?.length,
      503,
      'EMAIL_REJECTED',
      'The email provider did not accept this recipient.',
    );
  }
}
export async function deliverMail(
  store: Store,
  settings: EmailSettings,
  send?: (job: MailJob) => Promise<void>,
  stamp = now(),
) {
  if (settings.mode === 'disabled') return false;
  const job = claimMail(store, stamp);
  if (!job) return false;
  try {
    if (send) await send(job);
    else await sendMail(settings, job);
    store.run(
      "UPDATE email_outbox SET status=?,body='',sent_at=?,lease_id=NULL,lease_until=NULL,last_error=NULL WHERE id=? AND lease_id=?",
      settings.mode === 'preview' ? 'preview' : 'sent',
      stamp,
      job.id,
      job.lease_id,
    );
  } catch {
    const failed = job.attempts >= 8,
      next = new Date(
        Date.parse(stamp) + Math.min(3600000, 30000 * 2 ** (job.attempts - 1)),
      ).toISOString();
    store.run(
      'UPDATE email_outbox SET status=?,next_attempt_at=?,lease_id=NULL,lease_until=NULL,last_error=? WHERE id=? AND lease_id=?',
      failed ? 'failed' : 'pending',
      next,
      'Delivery could not be confirmed. Check the provider and retry.',
      job.id,
      job.lease_id,
    );
  }
  return true;
}
export function startEmailWorker(store: Store, settings: EmailSettings) {
  let busy = false,
    stopped = false;
  const tick = async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      for (let i = 0; i < 10 && !stopped; i++) if (!(await deliverMail(store, settings))) break;
    } catch (error) {
      console.error('Email worker unavailable:', error instanceof Error ? error.name : 'Error');
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void tick(), 5000);
  timer.unref();
  void tick();
  return async () => {
    stopped = true;
    clearInterval(timer);
    while (busy) await new Promise((resolve) => setTimeout(resolve, 20));
  };
}
