import { Resolver } from 'node:dns/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import nodemailer from 'nodemailer';
import isEmail from 'validator/lib/isEmail.js';
import type { Store } from './database.ts';
import { id, now } from './auth.ts';
import { ApiError, ensure } from './errors.ts';

export type EmailMode = 'smtp' | 'brevo' | 'preview' | 'disabled';
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
  apiKey?: string;
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
export function emailSettings(env: NodeJS.ProcessEnv = process.env): EmailSettings {
  const mode = (env.EMAIL_TRANSPORT ?? 'disabled') as EmailMode;
  ensure(
    ['smtp', 'brevo', 'preview', 'disabled'].includes(mode),
    500,
    'EMAIL_CONFIG',
    'Invalid email transport setting.',
  );
  const origin = env.APP_ORIGIN ?? 'http://127.0.0.1:3001';
  const parsed = new URL(origin);
  ensure(
    ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password,
    500,
    'EMAIL_CONFIG',
    'APP_ORIGIN must be an HTTP origin.',
  );
  if (env.NODE_ENV === 'production')
    ensure(
      mode !== 'preview' && parsed.protocol === 'https:',
      500,
      'EMAIL_CONFIG',
      'Production requires HTTPS and SMTP, Brevo or disabled email delivery.',
    );
  const settings: EmailSettings = {
    mode,
    origin: parsed.origin,
    from: env.EMAIL_FROM ?? 'VenueRelay <hello@localhost>',
    previewDir: resolve(env.EMAIL_PREVIEW_DIR ?? 'data/mail-preview'),
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT ?? 587),
    secure: env.SMTP_SECURE === 'true',
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    apiKey: env.BREVO_API_KEY?.trim(),
  };
  if (mode === 'brevo') {
    ensure(settings.apiKey, 500, 'EMAIL_CONFIG', 'Set BREVO_API_KEY privately on the server.');
    emailSender(settings.from);
  }
  return settings;
}
export function emailSender(value: string) {
  const match = value.trim().match(/^([^<>]+)<([^<>]+)>$/);
  const email = (match?.[2] ?? value).trim();
  ensure(
    !/[\r\n]/.test(value) && isEmail(email, { require_tld: true, allow_ip_domain: false }),
    500,
    'EMAIL_CONFIG',
    'Set EMAIL_FROM to a real sender verified in your email provider.',
  );
  return { email, name: match?.[1].trim().replace(/^"(.*)"$/, '$1') || 'VenueRelay' };
}
export function emailReady(settings: EmailSettings) {
  if (settings.mode === 'brevo') {
    try {
      emailSender(settings.from);
      return !!settings.apiKey;
    } catch {
      return false;
    }
  }
  return settings.mode === 'smtp' && !!settings.host && !settings.from.includes('@localhost');
}
export function mailRetryDelay(error: unknown, attempts: number) {
  const hint =
    error instanceof ApiError
      ? (error.details as { retryAfterMs?: number } | undefined)?.retryAfterMs
      : undefined;
  return Math.max(
    Math.min(3600000, 30000 * 2 ** Math.max(0, attempts - 1)),
    Math.min(86400000, Math.max(0, Number(hint) || 0)),
  );
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
export async function sendMail(settings: EmailSettings, job: MailJob, http: typeof fetch = fetch) {
  if (settings.mode === 'brevo') {
    ensure(settings.apiKey, 503, 'EMAIL_CONFIG', 'Set BREVO_API_KEY privately on the server.');
    let response: Response;
    try {
      response = await http('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'api-key': settings.apiKey,
        },
        body: JSON.stringify({
          sender: emailSender(settings.from),
          to: [{ email: job.recipient }],
          subject: job.subject,
          textContent: job.body,
          headers: { idempotencyKey: job.id },
        }),
      });
    } catch {
      throw new ApiError(
        503,
        'EMAIL_NETWORK',
        'Email delivery could not be confirmed. The message will retry.',
      );
    }
    const value: unknown = await response.json().catch(() => null);
    const result =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
    if (
      response.status === 400 &&
      result?.code === 'duplicate_parameter' &&
      typeof result.message === 'string' &&
      /idempotenc/i.test(result.message)
    )
      return;
    if (response.status === 429) {
      const delay = response.headers.get('Retry-After'),
        seconds = delay && /^\d+$/.test(delay) ? Number(delay) : undefined;
      throw new ApiError(
        503,
        'EMAIL_RATE_LIMIT',
        'The email provider is temporarily rate limited.',
        {
          retryAfterMs:
            seconds !== undefined ? seconds * 1000 : delay ? Date.parse(delay) - Date.now() : 60000,
        },
      );
    }
    ensure(
      response.ok,
      503,
      [401, 403].includes(response.status) ? 'EMAIL_PROVIDER_ACCESS' : 'EMAIL_PROVIDER_UNAVAILABLE',
      'The email provider did not accept this message. Check the API key, verified sender and account sending access.',
    );
    ensure(
      typeof result?.messageId === 'string' && result.messageId.trim().length > 0,
      503,
      'EMAIL_PROVIDER_RESPONSE',
      'Email delivery could not be confirmed. The message will retry.',
    );
    return;
  }
  if (settings.mode === 'preview') {
    await mkdir(settings.previewDir, { recursive: true, mode: 0o700 });
    await writeFile(
      resolve(settings.previewDir, job.id + '.eml'),
      `To: ${job.recipient}\nFrom: ${settings.from}\nSubject: ${job.subject}\nMessage-ID: <${job.id}@rally.local>\nContent-Type: text/plain; charset=utf-8\n\n${job.body}`,
      { mode: 0o600 },
    );
  } else if (settings.mode === 'smtp') {
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
  } else throw new ApiError(503, 'EMAIL_NOT_CONFIGURED', 'Email delivery is disabled.');
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
  } catch (error) {
    const failed = job.attempts >= 8,
      next = new Date(Date.parse(stamp) + mailRetryDelay(error, job.attempts)).toISOString();
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
