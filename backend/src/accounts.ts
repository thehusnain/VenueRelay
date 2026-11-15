import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Store } from './database.ts';
import {
  currentUser,
  endSession,
  hash,
  id,
  now,
  passwordHash,
  passwordInput,
  passwordMatches,
  recoveryCode,
  recoveryHash,
  publicUser,
  session,
  token,
  type User,
} from './auth.ts';
import { checkEmailDomain, normaliseEmail, emailReady, type EmailSettings } from './email.ts';
import { ApiError, ensure, text } from './errors.ts';
import { demoCredentials } from '../../shared/contracts.ts';

export function limitAttempt(
  store: Store,
  key: string,
  maximum: number,
  windowMs: number,
  stamp = now(),
) {
  store.transaction(() => {
    const row = store.get<{ attempts: number; window_ends: string }>(
      'SELECT * FROM auth_rate_limits WHERE key=?',
      hash(key),
    );
    if (!row || row.window_ends <= stamp)
      store.run(
        'INSERT INTO auth_rate_limits VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET attempts=excluded.attempts,window_ends=excluded.window_ends',
        hash(key),
        1,
        new Date(Date.parse(stamp) + windowMs).toISOString(),
      );
    else {
      ensure(
        row.attempts < maximum,
        429,
        'RATE_LIMIT',
        'Please wait a little before trying again.',
        { retryAfter: Math.ceil((Date.parse(row.window_ends) - Date.parse(stamp)) / 1000) },
      );
      store.run('UPDATE auth_rate_limits SET attempts=attempts+1 WHERE key=?', hash(key));
    }
  });
}
function record(store: Store, userId: string, action: string) {
  store.run(
    'INSERT INTO account_activity (user_id,action,created_at) VALUES (?,?,?)',
    userId,
    action,
    now(),
  );
}
function cancelTokens(store: Store, userId: string, purpose: 'verify' | 'reset', stamp = now()) {
  store.run(
    "UPDATE email_outbox SET status='cancelled',body='',lease_id=NULL,lease_until=NULL WHERE user_id=? AND token_id IN (SELECT id FROM account_tokens WHERE user_id=? AND purpose=?) AND status IN ('pending','sending','failed','preview')",
    userId,
    userId,
    purpose,
  );
  store.run(
    'UPDATE account_tokens SET used_at=? WHERE user_id=? AND purpose=? AND used_at IS NULL',
    stamp,
    userId,
    purpose,
  );
}
function issueProof(
  store: Store,
  user: User,
  purpose: 'verify' | 'reset',
  settings: EmailSettings,
) {
  ensure(user.email, 422, 'EMAIL_REQUIRED', 'An email account is required.');
  ensure(
    settings.mode !== 'disabled',
    503,
    'EMAIL_NOT_CONFIGURED',
    'Email delivery is not available yet. Please try again after it has been connected.',
  );
  const stamp = now(),
    secret = token(),
    tokenId = id(),
    mailId = id();
  cancelTokens(store, user.id, purpose, stamp);
  store.run(
    'INSERT INTO account_tokens VALUES (?,?,?,?,?,NULL,?)',
    tokenId,
    user.id,
    purpose,
    hash(secret),
    new Date(Date.parse(stamp) + (purpose === 'verify' ? 30 : 60) * 60000).toISOString(),
    stamp,
  );
  const link = `${settings.origin}/${purpose === 'verify' ? 'verify-email' : 'reset-password'}?token=${encodeURIComponent(secret)}`;
  const subject =
    purpose === 'verify' ? 'Confirm your email for VenueRelay' : 'Reset your VenueRelay password';
  const body =
    purpose === 'verify'
      ? `Hi ${user.name},\n\nConfirm this email address to create or join your event:\n${link}\n\nThis link expires in 30 minutes. If you did not create this account, you can ignore this email.\n\nThe VenueRelay team`
      : `Hi ${user.name},\n\nUse this link to choose a new password:\n${link}\n\nThis link expires in one hour and can only be used once. If you did not request this, you can ignore this email.\n\nThe VenueRelay team`;
  store.run(
    "INSERT INTO email_outbox (id,user_id,token_id,recipient,subject,body,status,attempts,next_attempt_at,created_at) VALUES (?,?,?,?,?,?,'pending',0,?,?)",
    mailId,
    user.id,
    tokenId,
    user.email,
    subject,
    body,
    stamp,
    stamp,
  );
  record(
    store,
    user.id,
    purpose === 'verify' ? 'verification_requested' : 'password_reset_requested',
  );
}
export async function registerAccount(
  store: Store,
  p: Record<string, unknown>,
  settings: EmailSettings,
  checkDomain = checkEmailDomain,
) {
  const email = normaliseEmail(p.email),
    name = text(p.name, 'Name', 80, 2),
    password = passwordInput(p.password);
  ensure(
    !store.get('SELECT id FROM users WHERE email=?', email),
    409,
    'EMAIL_EXISTS',
    'This email already has an account. Sign in or reset your password.',
  );
  if (settings.mode !== 'disabled') await checkDomain(email);
  const saved = await passwordHash(password);
  const secret = recoveryCode();
  return store.transaction(() => {
    ensure(
      !store.get('SELECT id FROM users WHERE email=?', email),
      409,
      'EMAIL_EXISTS',
      'This email already has an account. Sign in instead.',
    );
    const user: User = {
      id: id(),
      email,
      name,
      email_verified_at: null,
      access_approved_at: settings.mode === 'disabled' ? now() : null,
    };
    store.run(
      'INSERT INTO users (id,email,name,password_hash,created_at,email_verified_at,access_approved_at,recovery_code_hash) VALUES (?,?,?,?,?,NULL,?,?)',
      user.id,
      email,
      name,
      saved,
      now(),
      user.access_approved_at ?? null,
      secret ? recoveryHash(secret) : null,
    );
    record(store, user.id, 'registered');
    if (settings.mode !== 'disabled') issueProof(store, user, 'verify', settings);
    return { ...user, recoveryCode: secret };
  });
}
export function resendVerification(store: Store, user: User, settings: EmailSettings) {
  ensure(
    user.email && !user.email_verified_at,
    409,
    'ALREADY_VERIFIED',
    'This account is already confirmed.',
  );
  limitAttempt(store, 'verify-hour:' + user.id, 5, 3600000);
  const recent = store.get<{ created_at: string }>(
    'SELECT created_at FROM account_tokens WHERE user_id=? AND purpose=? ORDER BY created_at DESC LIMIT 1',
    user.id,
    'verify',
  );
  const remaining = recent
    ? 60 - Math.floor((Date.now() - Date.parse(recent.created_at)) / 1000)
    : 0;
  ensure(
    remaining <= 0,
    429,
    'RESEND_COOLDOWN',
    'Please wait a minute before requesting another email.',
    { retryAfter: remaining },
  );
  store.transaction(() => issueProof(store, user, 'verify', settings));
}
export function verifyEmail(store: Store, secret: string) {
  return store.transaction(() => {
    const proof = store.get<{ user_id: string; expires_at: string; used_at: string | null }>(
      'SELECT * FROM account_tokens WHERE token_hash=? AND purpose=?',
      hash(secret),
      'verify',
    );
    ensure(
      proof && proof.expires_at > now() && !proof.used_at,
      410,
      'LINK_EXPIRED',
      'This link is expired or has already been used. Request a new email.',
    );
    const stamp = now();
    store.run(
      'UPDATE users SET email_verified_at=COALESCE(email_verified_at,?) WHERE id=?',
      stamp,
      proof.user_id,
    );
    cancelTokens(store, proof.user_id, 'verify', stamp);
    record(store, proof.user_id, 'email_verified');
    return store.get<User>(
      'SELECT id,email,name,email_verified_at FROM users WHERE id=?',
      proof.user_id,
    )!;
  });
}
export function requestPasswordReset(store: Store, email: string, settings: EmailSettings) {
  const user = store.get<User>(
    'SELECT id,email,name,email_verified_at FROM users WHERE email=? AND password_hash IS NOT NULL',
    email,
  );
  if (user) {
    const recent = store.get<{ created_at: string }>(
      'SELECT created_at FROM account_tokens WHERE user_id=? AND purpose=? ORDER BY created_at DESC LIMIT 1',
      user.id,
      'reset',
    );
    if (!recent || Date.now() - Date.parse(recent.created_at) > 60000)
      store.transaction(() => issueProof(store, user, 'reset', settings));
  }
  return {
    ok: true,
    message: 'If an account exists for this email, a password reset message has been prepared.',
  };
}
export async function resetPassword(store: Store, secret: string, password: unknown) {
  const saved = await passwordHash(passwordInput(password));
  store.transaction(() => {
    const proof = store.get<{ user_id: string; expires_at: string; used_at: string | null }>(
      'SELECT * FROM account_tokens WHERE token_hash=? AND purpose=?',
      hash(secret),
      'reset',
    );
    ensure(
      proof && proof.expires_at > now() && !proof.used_at,
      410,
      'LINK_EXPIRED',
      'This link is expired or has already been used. Request another password reset.',
    );
    store.run('UPDATE users SET password_hash=? WHERE id=?', saved, proof.user_id);
    cancelTokens(store, proof.user_id, 'reset');
    store.run('DELETE FROM sessions WHERE user_id=?', proof.user_id);
    record(store, proof.user_id, 'password_reset');
  });
}
export async function handleAccountRoute(options: {
  store: Store;
  settings: EmailSettings;
  req: IncomingMessage;
  res: ServerResponse;
  route: string;
  method: string | undefined;
  body: () => Promise<Record<string, unknown>>;
  secureCookies?: boolean;
  checkDomain?: typeof checkEmailDomain;
}) {
  const { store, settings, req, res, route, method } = options;
  const cookie = (value: string, clear = false) =>
    `rally_session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${clear ? 0 : 604800}${options.secureCookies ? '; Secure' : ''}`;
  const send = (value: unknown) => {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(value));
  };
  const delivery = {
    mode: settings.mode,
    connected: emailReady(settings),
  };
  if (route === 'me' && method === 'GET') {
    const user = currentUser(store, req);
    ensure(user, 401, 'UNAUTHENTICATED', 'Sign in to continue.');
    send({ user: publicUser(user), delivery });
    return;
  }
  ensure(method === 'POST', 405, 'METHOD_NOT_ALLOWED', 'Use POST.');
  if (route === 'logout') {
    endSession(store, req);
    res.setHeader('Set-Cookie', cookie('', true));
    send({ ok: true });
    return;
  }
  const p = await options.body(),
    ip = req.socket.remoteAddress ?? 'unknown';
  limitAttempt(store, 'auth-global:' + ip, 200, 3600000);
  if (route === 'recovery-code') {
    const account = currentUser(store, req);
    ensure(
      account?.email && account.email !== demoCredentials.email,
      403,
      'ACCOUNT_REQUIRED',
      'Sign in to your own account first.',
    );
    limitAttempt(store, 'rotate-recovery:' + account.id, 5, 3600000);
    const user = store.get<User>('SELECT * FROM users WHERE id=?', account.id)!;
    ensure(
      user.password_hash &&
        (await passwordMatches(passwordInput(p.password, 1), user.password_hash)),
      401,
      'INVALID_CREDENTIALS',
      'Your current password is incorrect.',
    );
    const secret = recoveryCode();
    store.transaction(() => {
      ensure(
        store.get<User>('SELECT password_hash FROM users WHERE id=?', user.id)?.password_hash ===
          user.password_hash,
        401,
        'INVALID_CREDENTIALS',
        'Your password changed. Sign in again.',
      );
      store.run('UPDATE users SET recovery_code_hash=? WHERE id=?', recoveryHash(secret), user.id);
      record(store, user.id, 'recovery_code_replaced');
    });
    send({ recoveryCode: secret });
    return;
  }
  if (route === 'recover-account') {
    const email = normaliseEmail(p.email);
    limitAttempt(store, 'recovery-ip:' + ip, 20, 900000);
    limitAttempt(store, 'recovery:' + email, 5, 900000);
    const proof = recoveryHash(p.recoveryCode);
    const saved = await passwordHash(passwordInput(p.password));
    const next = recoveryCode();
    store.transaction(() => {
      const user = store.get<User>(
        'SELECT * FROM users WHERE email=? AND recovery_code_hash=?',
        email,
        proof,
      );
      ensure(user, 401, 'INVALID_RECOVERY', 'Email or recovery code is incorrect.');
      store.run(
        'UPDATE users SET password_hash=?,recovery_code_hash=? WHERE id=?',
        saved,
        recoveryHash(next),
        user.id,
      );
      cancelTokens(store, user.id, 'reset');
      store.run('DELETE FROM sessions WHERE user_id=?', user.id);
      record(store, user.id, 'password_recovered');
    });
    res.setHeader('Set-Cookie', cookie('', true));
    send({ ok: true, recoveryCode: next });
    return;
  }
  if (route === 'verify-email') {
    limitAttempt(store, 'verify-ip:' + ip, 30, 900000);
    verifyEmail(store, text(p.token, 'Confirmation link', 200));
    send({ ok: true, emailVerified: true });
    return;
  }
  if (route === 'resend-verification') {
    const user = currentUser(store, req);
    ensure(user, 401, 'UNAUTHENTICATED', 'Sign in to request a new email.');
    resendVerification(store, user, settings);
    send({ ok: true, delivery, retryAfter: 60 });
    return;
  }
  if (route === 'forgot-password') {
    const email = normaliseEmail(p.email);
    limitAttempt(store, 'reset:' + ip + email, 5, 900000);
    ensure(
      settings.mode !== 'disabled',
      503,
      'EMAIL_NOT_CONFIGURED',
      'Password recovery is not available until email delivery is connected.',
    );
    send({ ...requestPasswordReset(store, email, settings), delivery });
    return;
  }
  if (route === 'reset-password') {
    limitAttempt(store, 'reset-proof:' + ip, 15, 900000);
    await resetPassword(store, text(p.token, 'Reset link', 200), p.password);
    res.setHeader('Set-Cookie', cookie('', true));
    send({ ok: true });
    return;
  }
  let user: User;
  let recoverySecret: string | undefined;
  if (route === 'register') {
    limitAttempt(store, 'register:' + ip, 20, 3600000);
    const created = await registerAccount(store, p, settings, options.checkDomain);
    user = created;
    recoverySecret = created.recoveryCode;
  } else if (route === 'login') {
    const email = normaliseEmail(p.email),
      password = passwordInput(p.password, 1);
    limitAttempt(store, 'login:' + ip + email, 10, 900000);
    const found = store.get<User>('SELECT * FROM users WHERE email=?', email);
    const saved =
      found?.password_hash ??
      'not-a-real-salt:00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
    const matches = await passwordMatches(password, saved);
    ensure(
      found?.password_hash && matches,
      401,
      'INVALID_CREDENTIALS',
      'Email or password is incorrect. Check your details or reset your password.',
    );
    ensure(
      store.get<User>('SELECT password_hash FROM users WHERE id=?', found.id)?.password_hash ===
        saved,
      401,
      'INVALID_CREDENTIALS',
      'Your password changed. Sign in again.',
    );
    user = {
      id: found.id,
      email: found.email,
      name: found.name,
      email_verified_at: found.email_verified_at,
      access_approved_at: found.access_approved_at,
    };
    if (settings.mode === 'disabled' && !user.email_verified_at && !user.access_approved_at) {
      recoverySecret = recoveryCode();
      store.transaction(() => {
        user.access_approved_at = now();
        store.run(
          'UPDATE users SET access_approved_at=?,recovery_code_hash=? WHERE id=?',
          user.access_approved_at,
          recoveryHash(recoverySecret),
          user.id,
        );
        record(store, user.id, 'account_access_enabled');
      });
    }
    if (
      !user.email_verified_at &&
      settings.mode !== 'disabled' &&
      !store.get(
        'SELECT id FROM account_tokens WHERE user_id=? AND purpose=? AND used_at IS NULL AND expires_at>?',
        user.id,
        'verify',
        now(),
      )
    )
      store.transaction(() => issueProof(store, user, 'verify', settings));
    record(store, user.id, 'signed_in');
  } else if (route === 'demo') {
    limitAttempt(store, 'demo:' + ip, 30, 3600000);
    user = { id: id(), email: null, name: 'Demo organiser' };
    store.run(
      'INSERT INTO users (id,email,name,password_hash,created_at) VALUES (?,NULL,?,NULL,?)',
      user.id,
      user.name,
      now(),
    );
  } else throw new ApiError(404, 'NOT_FOUND', 'Endpoint not found.');
  endSession(store, req);
  const value = session(store, user.id);
  res.setHeader('Set-Cookie', cookie(value));
  send({
    user: publicUser(user),
    delivery,
    ...(recoverySecret ? { recoveryCode: recoverySecret } : {}),
    ...(['api', 'native'].includes(String(req.headers['x-rally-client']))
      ? { sessionToken: value }
      : {}),
  });
}
