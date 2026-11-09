import { randomUUID, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import { and, eq, gt, isNull, ne, lt, or } from 'drizzle-orm';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Db } from '../../db.js';
import { passwordResets, securityEvents, sessions, users } from '../../schema.js';
import { ApiError, now } from '../../common.js';
import { config } from '../../config.js';
import { csrfForSession, digest, event, randomToken, rateLimit } from '../../security.js';
import { sendRecovery } from '../../mail.js';
import { customerProfile } from './policies.js';
import { publicUser } from './dto.js';
const cookieName = config.NODE_ENV === 'production' ? '__Host-opsdesk_session' : 'opsdesk_session';
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const password = z.string().min(12).max(256);
const loginSchema = z.object({ email, password: z.string().min(1).max(256) }).strict();
const cookieValue = (header: string | undefined) =>
  header
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(cookieName + '='))
    ?.slice(cookieName.length + 1);
const options = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: config.SESSION_MAX_MINUTES * 60 * 1000,
};
const idleMs = config.SESSION_IDLE_MINUTES * 60 * 1000;
const safeCompare = (a: string, b: string) => {
  const left = Buffer.from(a, 'hex'),
    right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
};
export function auth(db: Db) {
  const router = Router();
  const attempts = new Map<string, { count: number; until: number }>();
  const recoveryAttempts = new Map<string, number>();
  const dummy = argon2.hash('not-a-real-password', { type: argon2.argon2id });
  const requireSession: RequestHandler = (req, res, next) => {
    const raw = cookieValue(req.headers.cookie);
    if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw))
      return next(new ApiError(401, 'UNAUTHENTICATED', 'Debe iniciar sesión.'));
    const date = now();
    const row = db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(
        and(
          eq(sessions.tokenHash, digest(raw)),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, date),
          eq(users.status, 'activo'),
        ),
      )
      .get();
    if (!row || Date.now() - Date.parse(row.session.lastSeenAt ?? row.session.createdAt) > idleMs)
      return next(new ApiError(401, 'UNAUTHENTICATED', 'Debe iniciar sesión.'));
    res.locals.user = row.user;
    res.locals.session = row.session;
    res.locals.rawSession = raw;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const csrf = req.get('X-CSRF-Token');
      if (!csrf || !safeCompare(digest(csrf), row.session.csrfHash))
        return next(new ApiError(403, 'CSRF_INVALID', 'Token CSRF inválido.'));
    }
    if (Date.now() - Date.parse(row.session.lastSeenAt ?? row.session.createdAt) > 60000)
      db.update(sessions).set({ lastSeenAt: date }).where(eq(sessions.id, row.session.id)).run();
    next();
  };
  const admin: RequestHandler = (_req, res, next) => {
    if (res.locals.user.role !== 'administrador')
      return next(new ApiError(403, 'FORBIDDEN', 'No tiene permisos para esta operación.'));
    next();
  };
  router.post('/login', rateLimit(20, 15 * 60 * 1000), async (req, res) => {
    const input = loginSchema.parse(req.body);
    const ipKey = `ip:${req.ip ?? 'unknown'}`,
      accountKey = `account:${digest(input.email)}`,
      time = Date.now();
    const blocked = (key: string) => {
      const entry = attempts.get(key);
      return !!entry && entry.until > time && entry.count >= 10;
    };
    if (blocked(ipKey) || blocked(accountKey))
      throw new ApiError(429, 'RATE_LIMITED', 'Demasiados intentos. Inténtelo más tarde.');
    const user = db.select().from(users).where(eq(users.email, input.email)).get();
    const valid = await argon2
      .verify(user?.passwordHash ?? (await dummy), input.password)
      .catch(() => false);
    if (!valid || !user || user.status !== 'activo') {
      for (const key of [ipKey, accountKey]) {
        const old = attempts.get(key);
        const entry = old && old.until > time ? old : { count: 0, until: time + 15 * 60 * 1000 };
        entry.count++;
        attempts.set(key, entry);
      }
      while (attempts.size > 10000) attempts.delete(attempts.keys().next().value!);
      event(db, 'auth.login', 'failure', null, 'session');
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Credenciales inválidas.');
    }
    attempts.delete(accountKey);
    const raw = randomToken(),
      csrf = csrfForSession(raw),
      created = now(),
      sessionId = randomUUID(),
      previous = cookieValue(req.headers.cookie);
    const authenticatedUser = db.transaction((tx) => {
      const fresh = tx
        .select()
        .from(users)
        .where(
          and(
            eq(users.id, user.id),
            eq(users.status, 'activo'),
            eq(users.passwordHash, user.passwordHash),
          ),
        )
        .get();
      if (!fresh) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Credenciales inválidas.');
      if (previous && /^[A-Za-z0-9_-]{43}$/.test(previous))
        tx.update(sessions)
          .set({ revokedAt: created })
          .where(and(eq(sessions.tokenHash, digest(previous)), isNull(sessions.revokedAt)))
          .run();
      tx.insert(sessions)
        .values({
          id: sessionId,
          userId: user.id,
          tokenHash: digest(raw),
          csrfHash: digest(csrf),
          createdAt: created,
          lastSeenAt: created,
          expiresAt: new Date(time + options.maxAge).toISOString(),
        })
        .run();
      tx.insert(securityEvents)
        .values({
          id: randomUUID(),
          actorId: user.id,
          action: 'auth.login',
          resourceType: 'session',
          resourceId: sessionId,
          outcome: 'success',
          createdAt: created,
        })
        .run();
      return fresh;
    });
    res
      .set('Cache-Control', 'no-store')
      .cookie(cookieName, raw, options)
      .json({
        data: {
          csrfToken: csrf,
          user: {
            ...publicUser(authenticatedUser),
            ...customerProfile(db, authenticatedUser),
          },
        },
      });
  });
  router.get('/me', requireSession, (_req, res) => {
    const csrf = csrfForSession(res.locals.rawSession);
    if (!safeCompare(digest(csrf), res.locals.session.csrfHash))
      db.update(sessions)
        .set({ csrfHash: digest(csrf) })
        .where(eq(sessions.id, res.locals.session.id))
        .run();
    res.set('Cache-Control', 'no-store').json({
      data: {
        ...publicUser(res.locals.user),
        ...customerProfile(db, res.locals.user),
      },
      csrfToken: csrf,
    });
  });
  router.post('/logout', requireSession, (_req, res) => {
    const date = now();
    db.transaction((tx) => {
      tx.update(sessions)
        .set({ revokedAt: date })
        .where(eq(sessions.id, res.locals.session.id))
        .run();
      tx.insert(securityEvents)
        .values({
          id: randomUUID(),
          actorId: res.locals.user.id,
          action: 'auth.logout',
          resourceType: 'session',
          resourceId: res.locals.session.id,
          outcome: 'success',
          createdAt: date,
        })
        .run();
    });
    res.clearCookie(cookieName, { ...options, maxAge: undefined });
    res.status(204).end();
  });
  router.post('/password', requireSession, rateLimit(10, 15 * 60 * 1000), async (req, res) => {
    const v = z
      .object({ currentPassword: z.string().min(1).max(256), newPassword: password })
      .strict()
      .parse(req.body);
    const user = res.locals.user as typeof users.$inferSelect;
    if (!(await argon2.verify(user.passwordHash, v.currentPassword).catch(() => false))) {
      event(db, 'auth.password_change', 'failure', user.id, 'user', user.id);
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Credenciales inválidas.');
    }
    const passwordHash = await argon2.hash(v.newPassword, { type: argon2.argon2id });
    const date = now();
    db.transaction((tx) => {
      const session = tx
        .select({ id: sessions.id })
        .from(sessions)
        .where(
          and(
            eq(sessions.id, res.locals.session.id),
            eq(sessions.userId, user.id),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, date),
          ),
        )
        .get();
      const changed = tx
        .update(users)
        .set({ passwordHash, updatedAt: date })
        .where(
          and(
            eq(users.id, user.id),
            eq(users.status, 'activo'),
            eq(users.passwordHash, user.passwordHash),
          ),
        )
        .returning({ id: users.id })
        .get();
      if (!session || !changed) throw new ApiError(401, 'UNAUTHENTICATED', 'Debe iniciar sesión.');
      tx.update(sessions)
        .set({ revokedAt: date })
        .where(
          and(
            eq(sessions.userId, user.id),
            ne(sessions.id, res.locals.session.id),
            isNull(sessions.revokedAt),
          ),
        )
        .run();
      tx.update(passwordResets)
        .set({ usedAt: date })
        .where(and(eq(passwordResets.userId, user.id), isNull(passwordResets.usedAt)))
        .run();
      tx.insert(securityEvents)
        .values({
          id: randomUUID(),
          actorId: user.id,
          action: 'auth.password_change',
          resourceType: 'user',
          resourceId: user.id,
          outcome: 'success',
          createdAt: date,
        })
        .run();
    });
    res.status(204).end();
  });
  router.get('/sessions', requireSession, (_req, res) => {
    const rows = db
      .select({
        id: sessions.id,
        createdAt: sessions.createdAt,
        lastSeenAt: sessions.lastSeenAt,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, res.locals.user.id),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, now()),
        ),
      )
      .all();
    res.set('Cache-Control', 'no-store').json({
      data: rows
        .filter((r) => Date.now() - Date.parse(r.lastSeenAt ?? r.createdAt) <= idleMs)
        .map((r) => ({ ...r, current: r.id === res.locals.session.id })),
    });
  });
  router.post(
    '/sessions/revoke-others',
    requireSession,
    rateLimit(10, 15 * 60 * 1000),
    async (req, res) => {
      const v = z
        .object({ password: z.string().min(1).max(256) })
        .strict()
        .parse(req.body);
      const user = res.locals.user as typeof users.$inferSelect;
      if (!(await argon2.verify(user.passwordHash, v.password).catch(() => false)))
        throw new ApiError(401, 'INVALID_CREDENTIALS', 'Credenciales inválidas.');
      const date = now();
      db.transaction((tx) => {
        const activeUser = tx
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.id, user.id),
              eq(users.status, 'activo'),
              eq(users.passwordHash, user.passwordHash),
            ),
          )
          .get();
        const activeSession = tx
          .select({ id: sessions.id })
          .from(sessions)
          .where(
            and(
              eq(sessions.id, res.locals.session.id),
              eq(sessions.userId, user.id),
              isNull(sessions.revokedAt),
              gt(sessions.expiresAt, date),
            ),
          )
          .get();
        if (!activeUser || !activeSession)
          throw new ApiError(401, 'UNAUTHENTICATED', 'Debe iniciar sesión.');

        tx.update(sessions)
          .set({ revokedAt: date })
          .where(
            and(
              eq(sessions.userId, user.id),
              ne(sessions.id, res.locals.session.id),
              isNull(sessions.revokedAt),
            ),
          )
          .run();
        tx.insert(securityEvents)
          .values({
            id: randomUUID(),
            actorId: user.id,
            action: 'auth.sessions_revoke',
            resourceType: 'session',
            outcome: 'success',
            createdAt: date,
          })
          .run();
      });
      res.status(204).end();
    },
  );
  router.post(
    '/sessions/:id/revoke',
    requireSession,
    rateLimit(10, 15 * 60 * 1000),
    async (req, res) => {
      const sessionId = z.uuid().parse(req.params.id),
        v = z
          .object({ password: z.string().min(1).max(256) })
          .strict()
          .parse(req.body),
        user = res.locals.user as typeof users.$inferSelect;
      if (!(await argon2.verify(user.passwordHash, v.password).catch(() => false)))
        throw new ApiError(401, 'INVALID_CREDENTIALS', 'Credenciales inválidas.');
      const date = now();
      db.transaction((tx) => {
        const activeUser = tx
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.id, user.id),
              eq(users.status, 'activo'),
              eq(users.passwordHash, user.passwordHash),
            ),
          )
          .get();
        const activeSession = tx
          .select({ id: sessions.id })
          .from(sessions)
          .where(
            and(
              eq(sessions.id, res.locals.session.id),
              eq(sessions.userId, user.id),
              isNull(sessions.revokedAt),
              gt(sessions.expiresAt, date),
            ),
          )
          .get();
        if (!activeUser || !activeSession)
          throw new ApiError(401, 'UNAUTHENTICATED', 'Debe iniciar sesión.');

        const row = tx
          .update(sessions)
          .set({ revokedAt: date })
          .where(
            and(
              eq(sessions.id, sessionId),
              eq(sessions.userId, user.id),
              isNull(sessions.revokedAt),
            ),
          )
          .returning({ id: sessions.id })
          .get();
        if (!row) throw new ApiError(404, 'NOT_FOUND', 'Recurso no encontrado.');
        tx.insert(securityEvents)
          .values({
            id: randomUUID(),
            actorId: user.id,
            action: 'auth.session_revoke',
            resourceType: 'session',
            resourceId: sessionId,
            outcome: 'success',
            createdAt: date,
          })
          .run();
      });
      if (sessionId === res.locals.session.id)
        res.clearCookie(cookieName, { ...options, maxAge: undefined });
      res.status(204).end();
    },
  );
  router.post('/forgot-password', rateLimit(5, 15 * 60 * 1000), (req, res) => {
    const input = z.object({ email }).strict().parse(req.body);
    if (config.MAIL_MODE === 'disabled')
      throw new ApiError(503, 'RECOVERY_UNAVAILABLE', 'La recuperación no está disponible.');
    const key = digest(input.email),
      previous = recoveryAttempts.get(key) ?? 0,
      permit = Date.now() - previous > 60000;
    if (permit) recoveryAttempts.set(key, Date.now());
    if (recoveryAttempts.size > 10000)
      recoveryAttempts.delete(recoveryAttempts.keys().next().value!);
    event(db, 'auth.recovery_requested', 'success', null, 'user');
    res
      .status(202)
      .json({ data: { message: 'Si la cuenta existe, recibirá instrucciones de recuperación.' } });
    setImmediate(() => {
      try {
        const user = db
          .select()
          .from(users)
          .where(and(eq(users.email, input.email), eq(users.status, 'activo')))
          .get();
        if (!user || !permit) return;
        const raw = randomToken(),
          date = now();
        db.transaction((tx) => {
          tx.update(passwordResets)
            .set({ usedAt: date })
            .where(and(eq(passwordResets.userId, user.id), isNull(passwordResets.usedAt)))
            .run();
          tx.insert(passwordResets)
            .values({
              id: randomUUID(),
              userId: user.id,
              tokenHash: digest(raw),
              createdAt: date,
              expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            })
            .run();
        });
        const link = new URL('/restablecer', config.APP_ORIGIN);
        link.hash = raw;
        void sendRecovery(user.email, link.toString()).catch(() => {
          try {
            event(db, 'auth.recovery_delivery', 'failure', user.id, 'user', user.id);
          } catch {
            /* El servidor puede estar cerrándose. */
          }
        });
      } catch {
        try {
          event(db, 'auth.recovery_delivery', 'failure', null, 'user');
        } catch {
          /* El servidor puede estar cerrándose. */
        }
      }
    });
  });
  router.post('/validate-reset', rateLimit(20, 15 * 60 * 1000), (req, res) => {
    const v = z
      .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
      .strict()
      .parse(req.body);
    const row = db
      .select({ id: passwordResets.id })
      .from(passwordResets)
      .innerJoin(users, eq(users.id, passwordResets.userId))
      .where(
        and(
          eq(passwordResets.tokenHash, digest(v.token)),
          isNull(passwordResets.usedAt),
          gt(passwordResets.expiresAt, now()),
          eq(users.status, 'activo'),
        ),
      )
      .get();
    if (!row) throw new ApiError(400, 'RESET_INVALID', 'El enlace no es válido o ha vencido.');
    res.status(204).end();
  });
  router.post('/reset-password', rateLimit(10, 15 * 60 * 1000), async (req, res) => {
    const v = z
      .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), newPassword: password })
      .strict()
      .parse(req.body);
    const tokenHash = digest(v.token);
    const row = db
      .select()
      .from(passwordResets)
      .where(
        and(
          eq(passwordResets.tokenHash, tokenHash),
          isNull(passwordResets.usedAt),
          gt(passwordResets.expiresAt, now()),
        ),
      )
      .get();
    if (!row) throw new ApiError(400, 'RESET_INVALID', 'El enlace no es válido o ha vencido.');
    const user = db
      .select()
      .from(users)
      .where(and(eq(users.id, row.userId), eq(users.status, 'activo')))
      .get();
    if (!user) throw new ApiError(400, 'RESET_INVALID', 'El enlace no es válido o ha vencido.');
    const passwordHash = await argon2.hash(v.newPassword, { type: argon2.argon2id });
    const date = now();
    db.transaction((tx) => {
      const updated = tx
        .update(passwordResets)
        .set({ usedAt: date })
        .where(
          and(
            eq(passwordResets.id, row.id),
            isNull(passwordResets.usedAt),
            gt(passwordResets.expiresAt, date),
          ),
        )
        .returning()
        .get();
      if (!updated)
        throw new ApiError(400, 'RESET_INVALID', 'El enlace no es válido o ha vencido.');
      const changed = tx
        .update(users)
        .set({ passwordHash, updatedAt: date })
        .where(and(eq(users.id, user.id), eq(users.status, 'activo')))
        .returning({ id: users.id })
        .get();
      if (!changed)
        throw new ApiError(400, 'RESET_INVALID', 'El enlace no es válido o ha vencido.');
      tx.update(sessions)
        .set({ revokedAt: date })
        .where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)))
        .run();
      tx.update(passwordResets)
        .set({ usedAt: date })
        .where(and(eq(passwordResets.userId, user.id), isNull(passwordResets.usedAt)))
        .run();
      tx.insert(securityEvents)
        .values({
          id: randomUUID(),
          actorId: user.id,
          action: 'auth.password_reset',
          resourceType: 'user',
          resourceId: user.id,
          outcome: 'success',
          createdAt: date,
        })
        .run();
    });
    res.status(204).end();
  });
  return { router, requireSession, admin };
}
export function cleanExpiredSessions(db: Db) {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return db
    .delete(sessions)
    .where(or(lt(sessions.expiresAt, cutoff), lt(sessions.revokedAt, cutoff)))
    .run();
}
