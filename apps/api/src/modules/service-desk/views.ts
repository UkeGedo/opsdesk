import { Router } from 'express';
import { and, asc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../../db.js';
import { ApiError, id, now } from '../../common.js';
import { savedTicketViews, users } from '../../schema.js';
import { requirePermission } from '../identity/policies.js';
const filters = z
  .object({
    q: z.string().max(120).default(''),
    status: z
      .enum([
        '',
        'abierto',
        'asignado',
        'en_proceso',
        'pendiente_cliente',
        'resuelto',
        'cerrado',
        'reabierto',
      ])
      .default(''),
    priority: z.enum(['', 'baja', 'media', 'alta', 'urgente']).default(''),
    assignedTo: z.union([z.literal(''), z.literal('unassigned'), id]).default(''),
    sort: z.enum(['createdAt', 'ticketNumber', 'title', 'priority']).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();
export function savedViewRoutes(db: Db) {
  const router = Router();
  router.get('/', requirePermission('tickets.read'), (_req, res) => {
    const rows = db
      .select()
      .from(savedTicketViews)
      .where(eq(savedTicketViews.ownerId, res.locals.user.id))
      .orderBy(asc(savedTicketViews.name))
      .all();
    res.json({
      data: rows.map(({ filters, ...row }) => ({ ...row, filters: JSON.parse(filters) })),
    });
  });
  router.post('/', requirePermission('tickets.read'), (req, res) => {
    const v = z
      .object({ name: z.string().trim().min(1).max(80), filters })
      .strict()
      .parse(req.body);
    const user = res.locals.user as typeof users.$inferSelect;
    if (user.role === 'cliente' && v.filters.assignedTo)
      throw new ApiError(403, 'FORBIDDEN', 'Filtro no permitido.');
    const data = db.transaction((tx) => {
      if (
        tx.select().from(savedTicketViews).where(eq(savedTicketViews.ownerId, user.id)).all()
          .length >= 50
      )
        throw new ApiError(409, 'VIEW_LIMIT', 'Se alcanzó el límite de vistas guardadas.');
      const row = tx
        .insert(savedTicketViews)
        .values({
          id: randomUUID(),
          ownerId: user.id,
          name: v.name,
          filters: JSON.stringify(v.filters),
          createdAt: now(),
        })
        .returning()
        .get();
      return { ...row, filters: v.filters };
    });
    res.status(201).json({ data });
  });
  router.delete('/:id', requirePermission('tickets.read'), (req, res) => {
    const viewId = id.parse(req.params.id);
    const deleted = db
      .delete(savedTicketViews)
      .where(and(eq(savedTicketViews.id, viewId), eq(savedTicketViews.ownerId, res.locals.user.id)))
      .returning()
      .get();
    if (!deleted) throw new ApiError(404, 'NOT_FOUND', 'La vista no existe.');
    res.status(204).end();
  });
  return router;
}
