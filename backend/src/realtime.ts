import type { Server, IncomingMessage } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { Store } from './database.ts';
import { context } from './domain.ts';
import { currentUser } from './auth.ts';
import { ApiError } from './errors.ts';
export function attachRealtime(server: Server, store: Store, allowed: Set<string>, secure = false) {
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: 1024,
    perMessageDeflate: false,
  });
  const peers = new Map<WebSocket, { req: IncomingMessage; eventId: string; alive: boolean }>();
  server.on('upgrade', (req, socket, head) => {
    try {
      const origin = `${secure ? 'https' : 'http'}://${req.headers.host}`,
        url = new URL(req.url ?? '/', origin),
        match = url.pathname.match(/^\/api\/v1\/events\/([^/]+)\/live$/);
      if (!match) throw new ApiError(404, 'NOT_FOUND', 'Not found');
      if (
        !req.headers.origin ||
        (req.headers.origin !== origin && !allowed.has(req.headers.origin))
      )
        throw new ApiError(403, 'INVALID_ORIGIN', 'Origin denied');
      if (peers.size >= 300) throw new ApiError(503, 'BUSY', 'Try again later');
      req.headers['x-rally-persona'] = url.searchParams.get('persona') ?? 'self';
      const eventId = decodeURIComponent(match[1]);
      context(store, req, currentUser(store, req), eventId);
      sockets.handleUpgrade(req, socket, head, (ws) => {
        peers.set(ws, { req, eventId, alive: true });
        ws.on('pong', () => {
          const peer = peers.get(ws);
          if (peer) peer.alive = true;
        });
        ws.on('error', () => ws.close());
        ws.on('close', () => peers.delete(ws));
        ws.send(JSON.stringify({ type: 'connected', eventId }));
      });
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 400;
      socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\n\r\n`);
    }
  });
  const pulse = setInterval(() => {
    for (const [ws, peer] of peers) {
      if (!peer.alive) {
        ws.terminate();
        continue;
      }
      try {
        context(store, peer.req, currentUser(store, peer.req), peer.eventId);
      } catch {
        ws.close(4401, 'Sign in again');
        continue;
      }
      peer.alive = false;
      ws.ping();
    }
  }, 20000);
  pulse.unref();
  const invalidate = () => {
    for (const [ws, peer] of peers) {
      try {
        context(store, peer.req, currentUser(store, peer.req), peer.eventId);
        if (ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ type: 'event.changed', eventId: peer.eventId }));
      } catch {
        ws.close(4401, 'Sign in again');
      }
    }
  };
  server.on('close', () => {
    clearInterval(pulse);
    for (const ws of peers.keys()) ws.terminate();
    sockets.close();
  });
  return { invalidate };
}
