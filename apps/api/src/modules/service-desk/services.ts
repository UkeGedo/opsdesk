import { Router } from 'express';
import { and, asc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../../db.js';
import { ApiError, id, now } from '../../common.js';
import { auditLogs, categories, services, users } from '../../schema.js';
import { requirePermission } from '../identity/policies.js';
import { formDefinition } from './policies.js';

const input = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(2000),
    categoryId: id,
    responsibleTeam: z.string().trim().min(1).max(120),
    active: z.boolean(),
    defaultPriority: z.enum(['baja', 'media', 'alta', 'urgente']),
    form: formDefinition,
  })
  .strict();
export function serviceCatalogRoutes(db: Db) {
  const router = Router();
  router.get('/', requirePermission('tickets.read'), (_req, res) => {
    const user = res.locals.user as typeof users.$inferSelect;
    const rows = db
      .select()
      .from(services)
      .where(
        ['administrador', 'supervisor'].includes(user.role) ? undefined : eq(services.active, true),
      )
      .orderBy(asc(services.name))
      .all();
    res.json({
      data: rows.map(({ formSchema, ...row }) => ({ ...row, form: JSON.parse(formSchema) })),
    });
  });
  router.post('/', requirePermission('tickets.manage'), (req, res) => {
    const v = input.parse(req.body),
      date = now();
    const data = db.transaction((tx) => {
      if (
        !tx
          .select()
          .from(categories)
          .where(and(eq(categories.id, v.categoryId), eq(categories.active, true)))
          .get()
      )
        throw new ApiError(400, 'INVALID_CATEGORY', 'La categoría no existe o está inactiva.');
      const { form, ...values } = v;
      const row = tx
        .insert(services)
        .values({
          id: randomUUID(),
          ...values,
          formVersion: 1,
          formSchema: JSON.stringify({ ...form, version: 1 }),
          createdAt: date,
          updatedAt: date,
        })
        .returning()
        .get();
      tx.insert(auditLogs)
        .values({
          id: randomUUID(),
          actorId: res.locals.user.id,
          action: 'service.created',
          resourceType: 'service',
          resourceId: row.id,
          createdAt: date,
        })
        .run();
      return { ...row, form: JSON.parse(row.formSchema) };
    });
    res.status(201).json({ data });
  });
  router.put('/:id', requirePermission('tickets.manage'), (req, res) => {
    const serviceId = id.parse(req.params.id),
      v = input.extend({ expectedUpdatedAt: z.iso.datetime() }).parse(req.body);
    const data = db.transaction((tx) => {
      const current = tx.select().from(services).where(eq(services.id, serviceId)).get();
      if (!current) throw new ApiError(404, 'NOT_FOUND', 'El servicio no existe.');
      if (current.updatedAt !== v.expectedUpdatedAt)
        throw new ApiError(409, 'STALE_SERVICE', 'El servicio cambió; actualice los datos.');
      if (
        !tx
          .select()
          .from(categories)
          .where(and(eq(categories.id, v.categoryId), eq(categories.active, true)))
          .get()
      )
        throw new ApiError(400, 'INVALID_CATEGORY', 'La categoría no existe o está inactiva.');
      const { form, expectedUpdatedAt, ...values } = v;
      const changed =
        JSON.stringify(form.fields) !==
        JSON.stringify((JSON.parse(current.formSchema) as { fields: unknown }).fields);
      const version = current.formVersion + (changed ? 1 : 0);
      const date = new Date(Math.max(Date.now(), Date.parse(current.updatedAt) + 1)).toISOString();
      const row = tx
        .update(services)
        .set({
          ...values,
          formVersion: version,
          formSchema: JSON.stringify({ version, fields: form.fields }),
          updatedAt: date,
        })
        .where(and(eq(services.id, serviceId), eq(services.updatedAt, expectedUpdatedAt)))
        .returning()
        .get();
      if (!row)
        throw new ApiError(409, 'STALE_SERVICE', 'El servicio cambió; actualice los datos.');
      tx.insert(auditLogs)
        .values({
          id: randomUUID(),
          actorId: res.locals.user.id,
          action: 'service.updated',
          resourceType: 'service',
          resourceId: serviceId,
          createdAt: date,
        })
        .run();
      return { ...row, form: JSON.parse(row.formSchema) };
    });
    res.json({ data });
  });
  return router;
}
