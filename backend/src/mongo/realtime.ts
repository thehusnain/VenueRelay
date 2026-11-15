import type { Server, IncomingMessage } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { hash, sessionValue } from '../auth.ts';
import { ApiError, ensure } from '../errors.ts';
import type { MongoDomain } from './domain.ts';
export function attachMongoRealtime(
  server: Server,
  domain: MongoDomain,
  allowed: Set<string>,
  secure: boolean,
) {
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: 1024,
    perMessageDeflate: false,
  });
  const peers = new Map<
    WebSocket,
    { req: IncomingMessage; eventId: string; sessionHash: string; alive: boolean }
  >();
  const check = async (peer: { req: IncomingMessage; eventId: string; sessionHash: string }) => {
    const user = await domain.accounts.userForSession(peer.sessionHash);
    ensure(user, 401, 'UNAUTHENTICATED', 'Sign in again.');
    await domain.context(peer.req, peer.eventId, domain.store, user);
  };
  server.on('upgrade', async (req, socket, head) => {
    try {
      const own = `${secure ? 'https' : 'http'}://${req.headers.host}`,
        url = new URL(req.url ?? '/', own),
        match = url.pathname.match(/^\/api\/v1\/events\/([^/]+)\/live$/);
      ensure(match, 404, 'NOT_FOUND', 'Not found');
      ensure(
        req.headers.origin && (req.headers.origin === own || allowed.has(req.headers.origin)),
        403,
        'INVALID_ORIGIN',
        'Origin denied',
      );
      ensure(peers.size < 300, 503, 'BUSY', 'Try again later');
      const eventId = decodeURIComponent(match[1]);
      let sessionHash: string;
      const ticket = url.searchParams.get('ticket');
      if (ticket) {
        const proof = await domain.store.collection('live_tickets').findOneAndDelete({
          token_hash: hash(ticket),
          event_id: eventId,
          expires: { $gt: new Date() },
          origin: req.headers.origin,
        });
        ensure(proof, 401, 'INVALID_TICKET', 'Reconnect using a new ticket');
        sessionHash = String(proof.session_hash);
        req.headers['x-rally-persona'] = String(proof.persona);
      } else {
        const raw = sessionValue(req);
        ensure(raw, 401, 'UNAUTHENTICATED', 'Sign in again');
        sessionHash = hash(raw);
        req.headers['x-rally-persona'] = url.searchParams.get('persona') ?? 'self';
      }
      const peer = { req, eventId, sessionHash, alive: true };
      await check(peer);
      if (socket.destroyed) return;
      sockets.handleUpgrade(req, socket, head, (ws) => {
        peers.set(ws, peer);
        ws.on('pong', () => {
          peer.alive = true;
        });
        ws.on('error', () => ws.close());
        ws.on('close', () => peers.delete(ws));
        ws.send(JSON.stringify({ type: 'connected', eventId }));
      });
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 503;
      socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\n\r\n`);
    }
  });
  let checking = false;
  const timer = setInterval(async () => {
    if (checking) return;
    checking = true;
    try {
      for (const [ws, peer] of peers) {
        if (!peer.alive) {
          ws.terminate();
          continue;
        }
        try {
          await check(peer);
        } catch {
          ws.close(4401, 'Sign in again');
          continue;
        }
        peer.alive = false;
        ws.ping();
      }
    } finally {
      checking = false;
    }
  }, 20000);
  timer.unref();
  const invalidate = async (eventId?: string) => {
    for (const [ws, peer] of peers) {
      if (eventId && peer.eventId !== eventId) continue;
      try {
        if (!eventId) await check(peer);
        if (eventId && ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ type: 'event.changed', eventId: peer.eventId }));
      } catch {
        ws.close(4401, 'Sign in again');
      }
    }
  };
  const stop = () => {
    clearInterval(timer);
    for (const ws of peers.keys()) ws.terminate();
    peers.clear();
    sockets.close();
  };
  server.once('close', stop);
  return { invalidate, stop };
}
