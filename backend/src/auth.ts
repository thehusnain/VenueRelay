import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Store } from './database.ts';
import { ApiError, ensure } from './errors.ts';
export const hash = (text: string) => createHash('sha256').update(text).digest('hex');
export const token = () => randomBytes(32).toString('base64url');
export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export interface User {
  id: string;
  email: string | null;
  name: string;
  password_hash?: string | null;
  email_verified_at?: string | null;
}
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key))),
  );
export async function passwordHash(password: string) {
  const salt = token();
  return `${salt}:${(await derive(password, salt)).toString('hex')}`;
}
export async function passwordMatches(password: string, saved: string) {
  const [salt, key] = saved.split(':');
  const actual = await derive(password, salt);
  const expected = Buffer.from(key, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function session(store: Store, userId: string) {
  const value = token();
  store.run(
    'INSERT INTO sessions VALUES (?,?,?)',
    hash(value),
    userId,
    new Date(Date.now() + 7 * 86400000).toISOString(),
  );
  return value;
}
export function sessionValue(req: IncomingMessage) {
  const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (bearer && !bearer.startsWith('rly_')) return bearer;
  return req.headers.cookie
    ?.split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith('rally_session='))
    ?.slice(14);
}
export function currentUser(store: Store, req: IncomingMessage): User | undefined {
  const value = sessionValue(req);
  if (!value) return;
  return store.get<User>(
    'SELECT u.id,u.email,u.name,u.email_verified_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',
    hash(value),
    now(),
  );
}
export function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: !user.email || !!user.email_verified_at,
  };
}
export function requireVerified(user: User) {
  ensure(
    !user.email || user.email_verified_at,
    403,
    'EMAIL_UNVERIFIED',
    'Please confirm your email address before continuing.',
  );
  return user;
}
export function requireUser(store: Store, req: IncomingMessage) {
  const user = currentUser(store, req);
  if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  return requireVerified(user);
}
export function endSession(store: Store, req: IncomingMessage) {
  const value = sessionValue(req);
  if (value) store.run('DELETE FROM sessions WHERE token_hash=?', hash(value));
}
export function passwordInput(value: unknown, min = 10) {
  ensure(
    typeof value === 'string' && value.length >= min && value.length <= 200 && /\S/.test(value),
    422,
    'VALIDATION_ERROR',
    `Password must be ${min}–200 characters.`,
  );
  return value;
}
