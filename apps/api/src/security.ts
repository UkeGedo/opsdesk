import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Db } from './db.js';
import { securityEvents } from './schema.js';
import { ApiError, now } from './common.js';
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const randomToken = () => randomBytes(32).toString('base64url');
export const csrfForSession = (raw: string) => digest(`opsdesk-csrf:${raw}`);
export function event(
  db: Db,
  action: string,
  outcome: 'success' | 'failure',
  actorId: string | null,
  resourceType: string,
  resourceId: string | null = null,
  context: string | null = null,
) {
  db.insert(securityEvents)
    .values({
      id: randomUUID(),
      actorId,
      action,
      outcome,
      resourceType,
      resourceId,
      context,
      createdAt: now(),
    })
    .run();
}
export function rateLimit(max: number, windowMs: number): RequestHandler {
  const entries = new Map<string, { count: number; until: number }>();
  return (req, _res, next) => {
    const nowMs = Date.now(),
      key = req.ip ?? 'unknown';
    let entry = entries.get(key);
    if (!entry || entry.until <= nowMs) entry = { count: 0, until: nowMs + windowMs };
    entry.count++;
    entries.set(key, entry);
    if (entries.size > 10000) {
      for (const [k, v] of entries) {
        if (v.until <= nowMs) entries.delete(k);
      }
      if (entries.size > 10000) entries.delete(entries.keys().next().value!);
    }
    if (entry.count > max)
      return next(
        new ApiError(429, 'RATE_LIMITED', 'Demasiadas solicitudes. Inténtelo más tarde.'),
      );
    next();
  };
}
