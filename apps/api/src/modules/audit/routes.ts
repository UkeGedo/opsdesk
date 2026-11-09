import { Router } from 'express';
import { asc } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../db.js';
import { auditLogs, securityEvents } from '../../schema.js';
import { event } from '../../security.js';
import { requirePermission } from '../identity/policies.js';
export function auditRoutes(db: Db) {
  const router = Router();
  router.get('/', requirePermission('audit.read'), (req, res) => {
    const query = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .strict()
      .parse(req.query);
    const data = db
      .select()
      .from(securityEvents)
      .orderBy(asc(securityEvents.createdAt), asc(securityEvents.id))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit)
      .all();
    const business = db
      .select()
      .from(auditLogs)
      .orderBy(asc(auditLogs.createdAt), asc(auditLogs.id))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit)
      .all();
    event(db, 'audit.read', 'success', res.locals.user.id, 'audit');
    res.json({ data: { security: data, business }, meta: query });
  });
  return router;
}
