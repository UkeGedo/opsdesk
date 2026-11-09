import { Router } from 'express';
import { and, asc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../../db.js';
import { ApiError, id, now } from '../../common.js';
import { auditLogs, categories, responseTemplates, users } from '../../schema.js';
import { requirePermission } from '../identity/policies.js';
import { matching } from '../shared/query.js';

const body = z
  .object({
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(10000),
    categoryId: id.nullable(),
    active: z.boolean(),
  })
  .strict();
export function responseTemplateRoutes(db: Db) {
  const router = Router();
  router.get('/', requirePermission('tickets.work'), (req, res) => {
    const filter = z
      .object({ q: z.string().trim().max(120).optional(), categoryId: id.optional() })
      .strict()
      .parse(req.query);
    const user = res.locals.user as typeof users.$inferSelect;
    const data = db
      .select()
      .from(responseTemplates)
      .where(
        and(
          user.role === 'tecnico' ? eq(responseTemplates.active, true) : undefined,
          filter.q ? matching(responseTemplates.title, filter.q) : undefined,
          filter.categoryId ? eq(responseTemplates.categoryId, filter.categoryId) : undefined,
        ),
      )
      .orderBy(asc(responseTemplates.title))
      .limit(100)
      .all();
    res.json({ data });
  });
  router.post('/', requirePermission('tickets.manage'), (req, res) => {
    const v = body.parse(req.body),
      date = now();
    const data = db.transaction((tx) => {
      if (
        v.categoryId &&
        !tx
          .select()
          .from(categories)
          .where(and(eq(categories.id, v.categoryId), eq(categories.active, true)))
          .get()
      )
        throw new ApiError(400, 'INVALID_CATEGORY', 'La categoría no existe o está inactiva.');
      const row = tx
        .insert(responseTemplates)
        .values({ id: randomUUID(), ...v, createdAt: date, updatedAt: date })
        .returning()
        .get();
      tx.insert(auditLogs)
        .values({
          id: randomUUID(),
          actorId: res.locals.user.id,
          action: 'response_template.created',
          resourceType: 'response_template',
          resourceId: row.id,
          createdAt: date,
        })
        .run();
      return row;
    });
    res.status(201).json({ data });
  });
  router.put('/:id', requirePermission('tickets.manage'), (req, res) => {
    const templateId = id.parse(req.params.id),
      v = body.extend({ expectedUpdatedAt: z.iso.datetime() }).parse(req.body);
    const data = db.transaction((tx) => {
      const current = tx
        .select()
        .from(responseTemplates)
        .where(eq(responseTemplates.id, templateId))
        .get();
      if (!current) throw new ApiError(404, 'NOT_FOUND', 'La plantilla no existe.');
      if (current.updatedAt !== v.expectedUpdatedAt)
        throw new ApiError(409, 'STALE_TEMPLATE', 'La plantilla cambió; actualice los datos.');
      if (
        v.categoryId &&
        !tx
          .select()
          .from(categories)
          .where(and(eq(categories.id, v.categoryId), eq(categories.active, true)))
          .get()
      )
        throw new ApiError(400, 'INVALID_CATEGORY', 'La categoría no existe o está inactiva.');
      const date = new Date(Math.max(Date.now(), Date.parse(current.updatedAt) + 1)).toISOString();
      const { expectedUpdatedAt, ...changes } = v;
      const row = tx
        .update(responseTemplates)
        .set({ ...changes, updatedAt: date })
        .where(
          and(
            eq(responseTemplates.id, templateId),
            eq(responseTemplates.updatedAt, expectedUpdatedAt),
          ),
        )
        .returning()
        .get();
      if (!row)
        throw new ApiError(409, 'STALE_TEMPLATE', 'La plantilla cambió; actualice los datos.');
      tx.insert(auditLogs)
        .values({
          id: randomUUID(),
          actorId: res.locals.user.id,
          action: 'response_template.updated',
          resourceType: 'response_template',
          resourceId: templateId,
          createdAt: date,
        })
        .run();
      return row;
    });
    res.json({ data });
  });
  return router;
}
