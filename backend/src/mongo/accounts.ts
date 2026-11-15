import type { IncomingMessage, ServerResponse } from 'node:http';
import { MongoStore } from './store.ts';
import {
  hash,
  normaliseUsername,
  accountIdentity,
  id,
  now,
  token,
  passwordHash,
  passwordMatches,
  passwordInput,
  recoveryCode,
  recoveryHash,
  publicUser,
  requireVerified,
  sessionValue,
  type User,
} from '../auth.ts';
import {
  normaliseEmail,
  checkEmailDomain,
  sendMail,
  emailReady,
  mailRetryDelay,
  type EmailSettings,
  type MailJob,
} from '../email.ts';
import { ensure, text, ApiError } from '../errors.ts';
export class MongoAccounts {
  constructor(
    readonly store: MongoStore,
    readonly mail: EmailSettings,
    readonly secure: boolean,
    readonly checkDomain = checkEmailDomain,
  ) {}
  async user(req: IncomingMessage) {
    const raw = sessionValue(req);
    if (!raw) return;
    return this.userForSession(hash(raw));
  }
  async userForSession(sessionHash: string, store = this.store) {
    const rows = await store
      .collection('sessions')
      .aggregate(
        [
          { $match: { token_hash: sessionHash, expires_at: { $gt: now() } } },
          { $lookup: { from: 'users', localField: 'user_id', foreignField: 'id', as: 'account' } },
          { $unwind: '$account' },
          { $replaceWith: '$account' },
          { $project: { _id: 0 } },
        ],
        { session: store.session },
      )
      .toArray();
    return rows[0] as unknown as User | undefined;
  }
  async require(req: IncomingMessage) {
    const user = await this.user(req);
    ensure(user, 401, 'UNAUTHENTICATED', 'Sign in to continue.');
    return requireVerified(user);
  }
  async limit(key: string, maximum: number, windowMs: number) {
    const consume = () =>
      this.store.transaction(async (tx) => {
        const k = hash(key),
          stamp = now(),
          row = await tx.get<{ attempts: number; window_ends: string }>('auth_rate_limits', {
            key: k,
          });
        if (!row || row.window_ends <= stamp)
          await tx.update(
            'auth_rate_limits',
            { key: k },
            { $set: { attempts: 1, window_ends: new Date(Date.now() + windowMs).toISOString() } },
            true,
          );
        else {
          ensure(
            row.attempts < maximum,
            429,
            'RATE_LIMIT',
            'Please wait a little before trying again.',
            { retryAfter: Math.ceil((Date.parse(row.window_ends) - Date.now()) / 1000) },
          );
          await tx.update('auth_rate_limits', { key: k }, { $inc: { attempts: 1 } });
        }
      });
    try {
      await consume();
    } catch (error) {
      if ((error as { code?: number }).code === 11000) await consume();
      else throw error;
    }
  }
  async record(tx: MongoStore, userId: string, action: string) {
    await tx.insert('account_activity', { id: id(), user_id: userId, action, created_at: now() });
  }
  async cancelProofs(tx: MongoStore, userId: string, purpose: string) {
    const proofs = await tx.all<{ id: string }>('account_tokens', { user_id: userId, purpose });
    await tx.updateMany(
      'email_outbox',
      {
        user_id: userId,
        token_id: { $in: proofs.map((p) => p.id) },
        status: { $in: ['pending', 'sending', 'failed', 'preview'] },
      },
      { $set: { status: 'cancelled', body: '', lease_id: null, lease_until: null } },
    );
    await tx.updateMany(
      'account_tokens',
      { user_id: userId, purpose, used_at: null },
      { $set: { used_at: now() } },
    );
  }
  async proof(tx: MongoStore, user: User, purpose: 'verify' | 'reset') {
    ensure(
      this.mail.mode !== 'disabled',
      503,
      'EMAIL_NOT_CONFIGURED',
      'Email delivery is not connected yet.',
    );
    const secret = token(),
      tokenId = id(),
      stamp = now();
    await this.cancelProofs(tx, user.id, purpose);
    await tx.insert('account_tokens', {
      id: tokenId,
      user_id: user.id,
      purpose,
      token_hash: hash(secret),
      expires_at: new Date(Date.now() + (purpose === 'verify' ? 30 : 60) * 60000).toISOString(),
      used_at: null,
      created_at: stamp,
    });
    const link = `${this.mail.origin}/${purpose === 'verify' ? 'verify-email' : 'reset-password'}?token=${encodeURIComponent(secret)}`;
    await tx.insert('email_outbox', {
      id: id(),
      user_id: user.id,
      token_id: tokenId,
      recipient: user.email,
      subject:
        purpose === 'verify'
          ? 'Confirm your email for VenueRelay'
          : 'Reset your VenueRelay password',
      body: `Hi ${user.name},\n\n${purpose === 'verify' ? 'Confirm your email address' : 'Choose a new password'}:\n${link}\n\nThis link is single-use and expires in ${purpose === 'verify' ? '30 minutes' : 'one hour'}. If you did not request it, ignore this message.\n\nThe VenueRelay team`,
      status: 'pending',
      attempts: 0,
      next_attempt_at: stamp,
      lease_id: null,
      lease_until: null,
      last_error: null,
      created_at: stamp,
      sent_at: null,
    });
    await this.record(
      tx,
      user.id,
      purpose === 'verify' ? 'verification_requested' : 'password_reset_requested',
    );
  }
  async revokeSessions(tx: MongoStore, userId: string) {
    const sessions = await tx.all<{ token_hash: string }>('sessions', { user_id: userId });
    const subscriptions = await tx.all<{ id: string }>('push_subscriptions', {
      session_hash: { $in: sessions.map((s) => s.token_hash) },
    });
    await tx.remove('push_deliveries', {
      subscription_id: { $in: subscriptions.map((s) => s.id) },
    });
    await tx.remove('push_subscriptions', { user_id: userId });
    await tx.remove('sessions', { user_id: userId });
  }
  async endSession(tx: MongoStore, req: IncomingMessage) {
    const raw = sessionValue(req);
    if (!raw) return;
    const sessionHash = hash(raw);
    const subscriptions = await tx.all<{ id: string }>('push_subscriptions', {
      session_hash: sessionHash,
    });
    await tx.remove('push_deliveries', {
      subscription_id: { $in: subscriptions.map((s) => s.id) },
    });
    await tx.remove('push_subscriptions', { session_hash: sessionHash });
    await tx.remove('sessions', { token_hash: sessionHash });
  }
  cookie(value: string, clear = false) {
    return `rally_session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${clear ? 0 : 604800}${this.secure ? '; Secure' : ''}`;
  }
  async handle(
    req: IncomingMessage,
    res: ServerResponse,
    route: string,
    method: string | undefined,
    p: Record<string, unknown>,
  ) {
    const delivery = {
      mode: this.mail.mode,
      connected: emailReady(this.mail),
    };
    if (route === 'me' && method === 'GET') {
      const user = await this.user(req);
      ensure(user, 401, 'UNAUTHENTICATED', 'Sign in to continue.');
      return { user: publicUser(user), delivery };
    }
    ensure(method === 'POST', 405, 'METHOD_NOT_ALLOWED', 'Use POST.');
    if (route === 'logout') {
      await this.store.transaction((tx) => this.endSession(tx, req));
      res.setHeader('Set-Cookie', this.cookie('', true));
      return { ok: true };
    }
    const ip = req.socket.remoteAddress ?? 'unknown';
    await this.limit('global:' + ip, 2000, 3600000);
    if (route === 'recovery-code') {
      const user = await this.user(req);
      ensure(
        (user?.username || user?.email) && !(user as User & { is_demo?: boolean }).is_demo,
        403,
        'ACCOUNT_REQUIRED',
        'Sign in to your own account first.',
      );
      await this.limit('rotate-recovery:' + user.id, 5, 3600000);
      ensure(
        user.password_hash &&
          (await passwordMatches(passwordInput(p.password, 1), user.password_hash)),
        401,
        'INVALID_CREDENTIALS',
        'Your current password is incorrect.',
      );
      const secret = recoveryCode();
      await this.store.transaction(async (tx) => {
        const current = await tx.get<User>('users', { id: user.id });
        ensure(
          current?.password_hash === user.password_hash,
          401,
          'INVALID_CREDENTIALS',
          'Your password changed. Sign in again.',
        );
        await tx.update(
          'users',
          { id: user.id },
          { $set: { recovery_code_hash: recoveryHash(secret) } },
        );
        await this.record(tx, user.id, 'recovery_code_replaced');
      });
      return { recoveryCode: secret };
    }
    if (route === 'recover-account') {
      const identity = accountIdentity(p);
      await this.limit('recovery-ip:' + ip, 20, 900000);
      await this.limit('recovery:' + identity.value, 5, 900000);
      const proof = recoveryHash(p.recoveryCode);
      const saved = await passwordHash(passwordInput(p.password));
      const next = recoveryCode();
      await this.store.transaction(async (tx) => {
        const user = await tx.get<User>('users', {
          [identity.field]: identity.value,
          recovery_code_hash: proof,
          is_demo: { $ne: true },
        });
        ensure(user, 401, 'INVALID_RECOVERY', 'Username, email or recovery code is incorrect.');
        await tx.update(
          'users',
          { id: user.id },
          { $set: { password_hash: saved, recovery_code_hash: recoveryHash(next) } },
        );
        await this.cancelProofs(tx, user.id, 'reset');
        await this.revokeSessions(tx, user.id);
        await this.record(tx, user.id, 'password_recovered');
      });
      res.setHeader('Set-Cookie', this.cookie('', true));
      return { ok: true, recoveryCode: next };
    }
    if (route === 'verify-email') {
      await this.limit('verify:' + ip, 30, 900000);
      await this.store.transaction(async (tx) => {
        const proof = await tx.get<{ user_id: string }>('account_tokens', {
          token_hash: hash(text(p.token, 'Confirmation link', 200)),
          purpose: 'verify',
          used_at: null,
          expires_at: { $gt: now() },
        });
        ensure(
          proof,
          410,
          'LINK_EXPIRED',
          'This link is expired or has already been used. Request a new email.',
        );
        await tx.update('users', { id: proof.user_id }, { $set: { email_verified_at: now() } });
        await this.cancelProofs(tx, proof.user_id, 'verify');
        await this.record(tx, proof.user_id, 'email_verified');
      });
      return { ok: true, emailVerified: true };
    }
    if (route === 'resend-verification') {
      const user = await this.user(req);
      ensure(user, 401, 'UNAUTHENTICATED', 'Sign in to continue.');
      ensure(
        !user.email_verified_at,
        409,
        'ALREADY_VERIFIED',
        'This account is already confirmed.',
      );
      await this.limit('resend:' + user.id, 5, 3600000);
      await this.store.transaction(async (tx) => {
        const recent = (
          await tx.all<{ created_at: string }>(
            'account_tokens',
            { user_id: user.id, purpose: 'verify' },
            { created_at: -1 },
            1,
          )
        )[0];
        ensure(
          !recent || Date.now() - Date.parse(recent.created_at) >= 60000,
          429,
          'RESEND_COOLDOWN',
          'Please wait a minute before requesting another email.',
          { retryAfter: 60 },
        );
        await this.proof(tx, user, 'verify');
      });
      return { ok: true, delivery, retryAfter: 60 };
    }
    if (route === 'forgot-password') {
      const email = normaliseEmail(p.email);
      await this.limit('reset:' + email, 5, 900000);
      ensure(
        this.mail.mode !== 'disabled',
        503,
        'EMAIL_NOT_CONFIGURED',
        'Password recovery needs email delivery to be connected.',
      );
      await this.store.transaction(async (tx) => {
        const user = await tx.get<User & { is_demo?: boolean }>('users', { email });
        if (user && !user.is_demo) {
          const recent = (
            await tx.all<{ created_at: string }>(
              'account_tokens',
              { user_id: user.id, purpose: 'reset' },
              { created_at: -1 },
              1,
            )
          )[0];
          if (!recent || Date.now() - Date.parse(recent.created_at) > 60000)
            await this.proof(tx, user, 'reset');
        }
      });
      return {
        ok: true,
        delivery,
        message: 'If an account exists, a reset message has been prepared.',
      };
    }
    if (route === 'reset-password') {
      await this.limit('reset-proof:' + ip, 15, 900000);
      const saved = await passwordHash(passwordInput(p.password));
      await this.store.transaction(async (tx) => {
        const proof = await tx.get<{ user_id: string }>('account_tokens', {
          token_hash: hash(text(p.token, 'Reset link', 200)),
          purpose: 'reset',
          used_at: null,
          expires_at: { $gt: now() },
        });
        ensure(proof, 410, 'LINK_EXPIRED', 'This link is expired or has already been used.');
        await tx.update('users', { id: proof.user_id }, { $set: { password_hash: saved } });
        await this.cancelProofs(tx, proof.user_id, 'reset');
        await this.revokeSessions(tx, proof.user_id);
        await this.record(tx, proof.user_id, 'password_reset');
      });
      res.setHeader('Set-Cookie', this.cookie('', true));
      return { ok: true };
    }
    let user: User;
    let recoverySecret: string | undefined;
    if (route === 'register') {
      const username = p.username !== undefined ? normaliseUsername(p.username) : null;
      const email = username ? null : normaliseEmail(p.email),
        name = text(p.name, 'Name', 80, 2),
        password = passwordInput(p.password);
      await this.limit('register:' + (username ?? email), 5, 3600000);
      if (email && this.mail.mode !== 'disabled') await this.checkDomain(email);
      const saved = await passwordHash(password);
      recoverySecret = recoveryCode();
      try {
        user = await this.store.transaction(async (tx) => {
          ensure(
            !(await tx.get('users', username ? { username } : { email })),
            409,
            username ? 'USERNAME_EXISTS' : 'EMAIL_EXISTS',
            'This sign-in name already has an account. Sign in or reset your password.',
          );
          const created = {
            id: id(),
            email,
            username,
            name,
            email_verified_at: null,
            access_approved_at: username || this.mail.mode === 'disabled' ? now() : null,
          };
          await tx.insert('users', {
            ...created,
            password_hash: saved,
            created_at: now(),
            is_demo: false,
            recovery_code_hash: recoverySecret ? recoveryHash(recoverySecret) : null,
          });
          await this.record(tx, created.id, 'registered');
          if (email && this.mail.mode !== 'disabled') await this.proof(tx, created, 'verify');
          return created;
        });
      } catch (e) {
        if ((e as { code?: number }).code === 11000)
          throw new ApiError(
            409,
            username ? 'USERNAME_EXISTS' : 'EMAIL_EXISTS',
            'This sign-in name already has an account.',
          );
        throw e;
      }
    } else if (route === 'login') {
      const identity = accountIdentity(p),
        password = passwordInput(p.password, 1);
      await this.limit(
        'login:' + identity.value,
        identity.value === 'demo@rally.local' ? 100 : 10,
        900000,
      );
      const found = await this.store.get<User>('users', { [identity.field]: identity.value });
      const saved =
        found?.password_hash ??
        'invalid:00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
      const matches = await passwordMatches(password, saved);
      ensure(
        found?.password_hash && matches,
        401,
        'INVALID_CREDENTIALS',
        'Username or password is incorrect. Check your details or reset your password.',
      );
      const nextRecovery = recoveryCode();
      user = await this.store.transaction(async (tx) => {
        const latest = await tx.get<User>('users', { id: found.id });
        ensure(
          latest?.password_hash === saved,
          401,
          'INVALID_CREDENTIALS',
          'Your password changed. Sign in again.',
        );
        let current = latest;
        recoverySecret = undefined;
        if (
          this.mail.mode === 'disabled' &&
          !current.email_verified_at &&
          !current.access_approved_at
        ) {
          recoverySecret = nextRecovery;
          current = { ...current, access_approved_at: now() };
          await tx.update(
            'users',
            { id: current.id },
            {
              $set: {
                access_approved_at: current.access_approved_at,
                recovery_code_hash: recoveryHash(nextRecovery),
              },
            },
          );
          await this.record(tx, current.id, 'account_access_enabled');
        }
        if (
          current.email &&
          !current.email_verified_at &&
          this.mail.mode !== 'disabled' &&
          !(await tx.get('account_tokens', {
            user_id: current.id,
            purpose: 'verify',
            used_at: null,
            expires_at: { $gt: now() },
          }))
        )
          await this.proof(tx, current, 'verify');
        await this.record(tx, current.id, 'signed_in');
        return current;
      });
    } else throw new ApiError(404, 'NOT_FOUND', 'Endpoint not found.');
    const raw = token();
    await this.store.transaction(async (tx) => {
      const current = await tx.get<User>('users', { id: user.id });
      ensure(
        current?.password_hash === user.password_hash || route === 'register',
        401,
        'INVALID_CREDENTIALS',
        'Your password changed. Sign in again.',
      );
      await tx.update('users', { id: user.id }, { $inc: { session_version: 1 } });
      await this.endSession(tx, req);
      await tx.insert('sessions', {
        token_hash: hash(raw),
        user_id: user.id,
        expires_at: new Date(Date.now() + 604800000).toISOString(),
      });
    });
    res.setHeader('Set-Cookie', this.cookie(raw));
    return {
      user: publicUser(user),
      delivery,
      ...(recoverySecret ? { recoveryCode: recoverySecret } : {}),
      ...(req.headers['x-rally-client'] === 'api' ? { sessionToken: raw } : {}),
    };
  }
  async deliver(send?: (job: MailJob) => Promise<void>) {
    if (this.mail.mode === 'disabled') return false;
    const job = await this.store.transaction(async (tx) => {
      const stamp = now(),
        candidate = (
          await tx.all<MailJob & { status: string }>(
            'email_outbox',
            {
              $or: [
                { status: 'pending', next_attempt_at: { $lte: stamp } },
                { status: 'sending', lease_until: { $lt: stamp } },
              ],
            },
            { created_at: 1 },
            1,
          )
        )[0];
      if (!candidate) return;
      const proof = await tx.get('account_tokens', {
        id: candidate.token_id,
        used_at: null,
        expires_at: { $gt: stamp },
      });
      if (!proof) {
        await tx.update(
          'email_outbox',
          { id: candidate.id },
          { $set: { status: 'cancelled', body: '', lease_id: null, lease_until: null } },
        );
        return;
      }
      const lease = id();
      await tx.update(
        'email_outbox',
        { id: candidate.id },
        {
          $set: {
            status: 'sending',
            lease_id: lease,
            lease_until: new Date(Date.now() + 60000).toISOString(),
          },
          $inc: { attempts: 1 },
        },
      );
      return { ...candidate, lease_id: lease, attempts: candidate.attempts + 1 };
    });
    if (!job) return false;
    try {
      await (send ? send(job) : sendMail(this.mail, job));
      await this.store.update(
        'email_outbox',
        { id: job.id, lease_id: job.lease_id, status: 'sending' },
        {
          $set: {
            status: this.mail.mode === 'preview' ? 'preview' : 'sent',
            body: '',
            sent_at: now(),
            lease_id: null,
            lease_until: null,
            last_error: null,
          },
        },
      );
    } catch (error) {
      await this.store.update(
        'email_outbox',
        { id: job.id, lease_id: job.lease_id, status: 'sending' },
        {
          $set: {
            status: job.attempts >= 8 ? 'failed' : 'pending',
            next_attempt_at: new Date(
              Date.now() + mailRetryDelay(error, job.attempts),
            ).toISOString(),
            lease_id: null,
            lease_until: null,
            last_error: 'Delivery could not be confirmed. Check the provider and retry.',
          },
        },
      );
    }
    return true;
  }
}
