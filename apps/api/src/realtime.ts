import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Db } from './db.js';
import { sessions, users } from './schema.js';
import { config } from './config.js';
import { digest } from './security.js';
import { now } from './common.js';
import { visibleTicket } from './modules/identity/policies.js';
export type Change = {
  actorId: string;
  ticketId?: string;
  extraUserIds?: string[];
  staffOnly?: boolean;
};
export function realtime(http: HttpServer, db: Db) {
  const io = new Server(http, {
    path: '/socket.io',
    allowRequest: (req, done) => done(null, req.headers.origin === config.APP_ORIGIN),
  });
  function identify(cookie: string | undefined) {
    const name = config.NODE_ENV === 'production' ? '__Host-opsdesk_session' : 'opsdesk_session';
    const value = cookie
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(name + '='))
      ?.slice(name.length + 1);
    if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
    const row = db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.tokenHash, digest(value)),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, now()),
          eq(users.status, 'activo'),
        ),
      )
      .get();
    if (
      !row ||
      Date.now() - Date.parse(row.session.lastSeenAt ?? row.session.createdAt) >
        config.SESSION_IDLE_MINUTES * 60 * 1000
    )
      return null;
    return row.user;
  }
  io.use((socket, next) => {
    const user = identify(socket.handshake.headers.cookie);
    if (!user) return next(new Error('UNAUTHENTICATED'));
    socket.data.userId = user.id;
    next();
  });
  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.userId as string}`);
  });
  const timer = setInterval(() => {
    for (const socket of io.sockets.sockets.values())
      if (!identify(socket.handshake.headers.cookie)) socket.disconnect(true);
  }, 30000);
  timer.unref();
  io.on('close', () => clearInterval(timer));
  function publish(change: Change) {
    for (const socket of io.sockets.sockets.values()) {
      const user = identify(socket.handshake.headers.cookie);
      if (!user) {
        socket.disconnect(true);
        continue;
      }
      if (change.staffOnly && user.role === 'cliente') continue;
      let permitted =
        ['administrador', 'supervisor'].includes(user.role) ||
        user.id === change.actorId ||
        (change.extraUserIds ?? []).includes(user.id);
      if (!permitted && change.ticketId) {
        try {
          visibleTicket(db, user, change.ticketId);
          permitted = true;
        } catch {
          /* No se revela el recurso. */
        }
      }
      if (permitted) socket.emit('changed');
    }
  }
  return {
    io,
    publish,
    close: () => {
      clearInterval(timer);
      return io.close();
    },
  };
}
