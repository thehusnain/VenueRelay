import { attachRealtime } from './realtime.ts';
import type { ApplicationBackend } from './backend.ts';
import { PushService, pushSettings } from './push.ts';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { Store } from './database.ts';
import { handleAccountRoute } from './accounts.ts';
import { emailSettings, type EmailSettings, checkEmailDomain } from './email.ts';
import { currentUser, requireUser, hash, id, now, publicUser, sessionValue } from './auth.ts';
import { ApiError, ensure, text } from './errors.ts';
import {
  context,
  bootstrap,
  seedDemo,
  snapshot,
  execute,
  createEvent,
  invite,
  acceptInvitation,
  createApiKey,
  integrity,
  organiser,
} from './domain.ts';
import type { Member, Activity } from '../../shared/contracts.ts';
interface Options {
  store?: Store;
  backend?: ApplicationBackend;
  staticDir?: string;
  secureCookies?: boolean;
  allowedOrigins?: string[];
  emailSettings?: EmailSettings;
  checkEmailDomain?: typeof checkEmailDomain;
  push?: PushService;
}
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
function serveFile(
  res: ServerResponse,
  file: string,
  method: string | undefined,
  headers: Record<string, string>,
) {
  const stream = createReadStream(file);
  stream.once('open', () => {
    if (res.destroyed) {
      stream.destroy();
      return;
    }
    res.writeHead(200, headers);
    if (method === 'HEAD') {
      stream.destroy();
      res.end();
    } else stream.pipe(res);
  });
  stream.once('error', () => {
    if (res.destroyed) return;
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.writeHead(503, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'Retry-After': '1',
    });
    res.end('VenueRelay is updating. Refresh this page in a moment.');
  });
  res.once('close', () => stream.destroy());
}
async function body(req: IncomingMessage) {
  ensure(
    req.headers['content-type']?.split(';')[0] === 'application/json',
    415,
    'UNSUPPORTED_MEDIA_TYPE',
    'Send application/json.',
  );
  req.setEncoding('utf8');
  let value = '';
  for await (const chunk of req) {
    value += chunk;
    ensure(value.length <= 32000, 413, 'BODY_TOO_LARGE', 'The request is too large.');
  }
  try {
    const parsed = JSON.parse(value || '{}');
    ensure(
      parsed && typeof parsed === 'object' && !Array.isArray(parsed),
      400,
      'INVALID_JSON',
      'Send a JSON object.',
    );
    return parsed as Record<string, unknown>;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(400, 'INVALID_JSON', 'The request contains invalid JSON.');
  }
}
export function createApp(options: Options) {
  const store = options.store!;
  ensure(store || options.backend, 500, 'STORAGE_CONFIG', 'Configure a database backend.');
  const mailSettings = options.emailSettings ?? emailSettings();
  const allowedOrigins = new Set(options.allowedOrigins ?? []);
  const push = options.push ?? (store ? new PushService(store, pushSettings()) : undefined);
  const browserPush = push?.settings ?? pushSettings();
  const server = createServer(async (req, res) => {
    res.once('finish', () => {
      if (
        !options.backend &&
        ['POST', 'DELETE', 'PUT', 'PATCH'].includes(req.method ?? '') &&
        res.statusCode < 400
      )
        live.invalidate();
    });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    const origin = req.headers.origin;
    const ownOrigin = `${options.secureCookies ? 'https' : 'http'}://${req.headers.host}`;
    if (origin && origin !== ownOrigin && allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, Idempotency-Key, X-Rally-Persona, X-Rally-Client, X-Rally-Expected-Actor',
      );
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    const send = (data: unknown, status = 200) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify(data));
    };
    try {
      const url = new URL(req.url ?? '/', ownOrigin),
        path = url.pathname,
        method = req.method;
      if (path.startsWith('/api/')) {
        if (method !== 'GET')
          ensure(
            !origin || origin === ownOrigin || allowedOrigins.has(origin),
            403,
            'INVALID_ORIGIN',
            'This origin cannot change event data.',
          );
        if (path === '/api/health') {
          if (options.backend) {
            let healthy = false;
            try {
              healthy = await options.backend.health();
            } catch {}
            ensure(
              healthy,
              503,
              'DATABASE_UNAVAILABLE',
              'The database is temporarily unavailable. Please retry.',
            );
          }
          send({ status: 'ok', storage: options.backend?.storage ?? 'sqlite', time: now() });
          return;
        }
        if (path === '/api/openapi.json' && method === 'GET') {
          send(
            JSON.parse(readFileSync(new URL('../../docs/openapi.json', import.meta.url), 'utf8')),
          );
          return;
        }
        if (path === '/api/v1/push/public-key' && method === 'GET') {
          send({ enabled: !!browserPush, publicKey: browserPush?.publicKey ?? null });
          return;
        }
        if (path === '/api/docs' || path === '/api/docs/') {
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Security-Policy':
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
          });
          res.end(
            '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VenueRelay API</title><link rel="stylesheet" href="/api/docs/swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="/api/docs/swagger-ui-bundle.js"></script><script src="/api/docs/setup.js"></script></body></html>',
          );
          return;
        }
        if (path === '/api/docs/setup.js') {
          res.writeHead(200, { 'Content-Type': 'text/javascript' });
          res.end(
            "SwaggerUIBundle({url:'/api/openapi.json',dom_id:'#swagger-ui',deepLinking:true,validatorUrl:null});",
          );
          return;
        }
        if (['/api/docs/swagger-ui.css', '/api/docs/swagger-ui-bundle.js'].includes(path)) {
          const file = resolve('node_modules/swagger-ui-dist', path.split('/').pop()!);
          serveFile(res, file, method, { 'Content-Type': mime[extname(file)] });
          return;
        }
        if (options.backend) {
          await options.backend.handle(req, res, path, method, () => body(req), send);
          return;
        }
        if (path.startsWith('/api/v1/auth/')) {
          await handleAccountRoute({
            store,
            settings: mailSettings,
            req,
            res,
            route: path.slice('/api/v1/auth/'.length),
            method,
            body: () => body(req),
            secureCookies: options.secureCookies,
            checkDomain: options.checkEmailDomain,
          });
          return;
        }
        if (path === '/api/v1/bootstrap' && method === 'POST') {
          const user = requireUser(store, req);
          const existing = store.get<{ id: string }>(
            'SELECT e.id FROM events e JOIN members m ON e.id=m.event_id WHERE m.user_id=? ORDER BY e.is_demo ASC,e.created_at DESC LIMIT 1',
            user.id,
          );
          if (user.email && !existing) {
            send({ requiresSetup: true, user: publicUser(user) });
            return;
          }
          const eventId = existing?.id ?? store.transaction(() => bootstrap(store, user));
          const ctx = context(store, req, user, eventId);
          store.transaction(() =>
            seedDemo(store, {
              ...ctx,
              me: store.get<Member>(
                'SELECT * FROM members WHERE event_id=? AND user_id=?',
                eventId,
                user.id,
              )!,
            }),
          );
          send(snapshot(store, ctx));
          return;
        }
        if (path === '/api/v1/events' && method === 'POST') {
          const user = requireUser(store, req);
          ensure(
            user.email,
            403,
            'ACCOUNT_REQUIRED',
            'Create an account and confirm your email to start a real event.',
          );
          send({ eventId: createEvent(store, user, await body(req)) }, 201);
          return;
        }
        if (path === '/api/v1/invitations/accept' && method === 'POST') {
          const user = requireUser(store, req),
            p = await body(req);
          send(acceptInvitation(store, user, text(p.token, 'Invitation token', 200)));
          return;
        }
        const match = path.match(/^\/api\/v1\/events\/([^/]+)(?:\/(.*))?$/);
        ensure(match, 404, 'NOT_FOUND', 'Endpoint not found.');
        const ctx = context(store, req, currentUser(store, req), decodeURIComponent(match[1])),
          resource = match[2] ?? 'snapshot';
        if (resource === 'push/subscription' && method === 'GET') {
          send({
            enabled: !!store.get(
              'SELECT id FROM push_subscriptions WHERE member_id=? AND session_hash=?',
              ctx.me.id,
              hash(sessionValue(req) ?? ''),
            ),
          });
          return;
        }
        if (resource === 'push/subscription' && method === 'POST') {
          push!.subscribe(ctx, req, await body(req));
          send({ ok: true });
          return;
        }
        if (resource === 'push/subscription' && method === 'DELETE') {
          push!.unsubscribe(ctx, await body(req));
          send({ ok: true });
          return;
        }
        if (resource === 'snapshot' && method === 'GET') {
          send(snapshot(store, ctx));
          return;
        }
        if (resource === 'commands' && method === 'POST') {
          const expectedActor = req.headers['x-rally-expected-actor'];
          ensure(
            !expectedActor || expectedActor === ctx.me.id,
            409,
            'ACTOR_CHANGED',
            'Your signed-in account changed. Sign in with the account that saved this change.',
          );
          const p = await body(req);
          ensure(typeof p.action === 'string', 422, 'VALIDATION_ERROR', 'An action is required.');
          const result = execute(
            store,
            ctx,
            String(req.headers['idempotency-key'] ?? ''),
            p as unknown as Parameters<typeof execute>[3],
          );
          send(result);
          return;
        }
        if (resource === 'activity' && method === 'GET') {
          const after = Number(url.searchParams.get('after') ?? 0),
            limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 50)));
          ensure(
            Number.isInteger(after) && after >= 0 && Number.isInteger(limit),
            422,
            'VALIDATION_ERROR',
            'Use integer pagination values.',
          );
          const data = store.all<Activity>(
            "SELECT * FROM activity WHERE event_id=? AND id>? AND (?='organiser' OR entity_type IN ('schedule','announcement') OR (entity_type='task' AND entity_id IN (SELECT id FROM tasks WHERE event_id=? AND (reporter_id=? OR owner_id=?)))) ORDER BY id LIMIT ?",
            ctx.event.id,
            after,
            ctx.me.role,
            ctx.event.id,
            ctx.me.id,
            ctx.me.id,
            limit + 1,
          );
          send({
            items: data.slice(0, limit),
            nextCursor: data.length > limit ? data[limit - 1].id : null,
          });
          return;
        }
        if (resource === 'notifications/read' && method === 'POST') {
          const p = await body(req);
          ensure(
            Array.isArray(p.ids) &&
              p.ids.length <= 100 &&
              p.ids.every((x) => typeof x === 'string'),
            422,
            'VALIDATION_ERROR',
            'Supply up to 100 notification IDs.',
          );
          store.transaction(() => {
            for (const notificationId of p.ids as string[])
              store.run(
                'UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND member_id=?',
                now(),
                notificationId,
                ctx.me.id,
              );
          });
          send({ ok: true });
          return;
        }
        if (resource === 'invitations' && method === 'POST') {
          send(invite(store, ctx, await body(req)), 201);
          return;
        }
        if (resource === 'integrity' && method === 'GET') {
          send(integrity(store, ctx));
          return;
        }
        if (resource === 'api-keys' && method === 'GET') {
          organiser(ctx);
          send({
            items: store.all(
              'SELECT id,name,created_at,revoked_at FROM api_keys WHERE event_id=? ORDER BY created_at DESC',
              ctx.event.id,
            ),
          });
          return;
        }
        if (resource === 'api-keys' && method === 'POST') {
          const p = await body(req);
          send(createApiKey(store, ctx, text(p.name, 'Token name', 80, 2)), 201);
          return;
        }
        if (resource.startsWith('api-keys/') && method === 'DELETE') {
          organiser(ctx);
          ensure(!ctx.isIntegration, 403, 'FORBIDDEN', 'Use a signed-in account to revoke tokens.');
          const keyId = resource.slice(9);
          store.transaction(() => {
            const old = store.get<{ id: string; name: string; revoked_at: string | null }>(
              'SELECT id,name,revoked_at FROM api_keys WHERE id=? AND event_id=?',
              keyId,
              ctx.event.id,
            );
            ensure(old, 404, 'NOT_FOUND', 'Token not found.');
            if (!old.revoked_at) {
              store.run('UPDATE api_keys SET revoked_at=? WHERE id=?', now(), keyId);
              const commandId = id(),
                stamp = now();
              store.run(
                'INSERT INTO commands VALUES (?,?,?,?,?,?,?)',
                commandId,
                ctx.event.id,
                ctx.me.id,
                `revoke-${keyId}`,
                hash(keyId),
                '{}',
                stamp,
              );
              store.run(
                'INSERT INTO activity (event_id,command_id,actor_id,entity_id,entity_type,action,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
                ctx.event.id,
                commandId,
                ctx.me.id,
                keyId,
                'integration',
                'integration.revoke',
                JSON.stringify(old),
                JSON.stringify({ ...old, revoked_at: stamp }),
                stamp,
              );
            }
          });
          send({ ok: true });
          return;
        }
        if (resource === 'export' && method === 'GET') {
          organiser(ctx);
          send({
            event: ctx.event,
            tasks: store.all('SELECT * FROM tasks WHERE event_id=?', ctx.event.id),
            activity: store.all(
              'SELECT * FROM activity WHERE event_id=? ORDER BY id',
              ctx.event.id,
            ),
            exportedAt: now(),
          });
          return;
        }
        throw new ApiError(404, 'NOT_FOUND', 'Endpoint not found.');
      }
      if (method !== 'GET' && method !== 'HEAD')
        throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use GET.');
      if (!options.staticDir) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(
          process.env.NODE_ENV === 'production'
            ? 'VenueRelay API is running. Open the website to use your event.'
            : 'VenueRelay API is running. Start the frontend with npm run dev.',
        );
        return;
      }
      let file = resolve(options.staticDir, '.' + decodeURIComponent(path));
      ensure(
        file === resolve(options.staticDir) || file.startsWith(resolve(options.staticDir) + sep),
        403,
        'FORBIDDEN',
        'Invalid path.',
      );
      if (!existsSync(file) || !statSync(file).isFile())
        file = resolve(options.staticDir, 'index.html');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self' ws: wss:; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      );
      serveFile(res, file, method, {
        'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': file.includes(`${sep}assets${sep}`)
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
      });
    } catch (error) {
      if (error instanceof ApiError) {
        if (
          error.status === 429 &&
          typeof error.details === 'object' &&
          error.details !== null &&
          'retryAfter' in error.details
        )
          res.setHeader('Retry-After', String(Math.max(1, Number(error.details.retryAfter) || 60)));
        send(
          { error: { code: error.code, message: error.message, details: error.details } },
          error.status,
        );
      } else {
        console.error('Request failed:', error instanceof Error ? error.message : 'Unknown error');
        send(
          {
            error: {
              code: 'INTERNAL_ERROR',
              message: 'The action could not be confirmed. Retry with the same request ID.',
            },
          },
          500,
        );
      }
    }
  });
  const live = options.backend
    ? options.backend.attach(server, allowedOrigins, !!options.secureCookies)
    : attachRealtime(server, store, allowedOrigins, options.secureCookies);
  return server;
}
