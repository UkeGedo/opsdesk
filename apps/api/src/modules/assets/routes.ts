import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { and, asc, eq, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../db.js';
import { ApiError, id, notFound, now } from '../../common.js';
import {
  auditLogs,
  events,
  inventoryAssets,
  inventoryAssetEvents,
  inventoryLocations,
  tickets,
  users,
} from '../../schema.js';
export function assetRoutes(db: Db) {
  const router = Router();
  const canManage = (role: string) => ['administrador', 'supervisor'].includes(role);
  router.use((_req, res, next) => {
    if (!canManage(res.locals.user.role) && res.locals.user.role !== 'tecnico')
      return next(new ApiError(403, 'FORBIDDEN', 'No tiene acceso.'));
    next();
  });
  router.get('/', (req, res) => {
    const q = z
      .object({
        page: z.coerce.number().int().min(1).max(100000).default(1),
        limit: z.coerce.number().int().min(1).max(500).default(500),
        q: z.string().trim().max(120).optional(),
      })
      .strict()
      .parse(req.query);
    const where = and(
      res.locals.user.role === 'tecnico'
        ? eq(inventoryAssets.assignedTo, res.locals.user.id)
        : undefined,
      q.q
        ? or(
            sql`instr(lower(${inventoryAssets.name}),lower(${q.q})) > 0`,
            sql`instr(lower(${inventoryAssets.serial}),lower(${q.q})) > 0`,
          )
        : undefined,
    );
    const total =
      db
        .select({ count: sql<number>`count(*)` })
        .from(inventoryAssets)
        .where(where)
        .get()?.count ?? 0;
    const data = db
      .select()
      .from(inventoryAssets)
      .where(where)
      .orderBy(asc(inventoryAssets.name), asc(inventoryAssets.id))
      .limit(q.limit)
      .offset((q.page - 1) * q.limit)
      .all();
    res.json({ data, meta: { page: q.page, limit: q.limit, total } });
  });
  router.get('/:id/history', (req, res) => {
    const assetId = id.parse(req.params.id);
    const asset = db.select().from(inventoryAssets).where(eq(inventoryAssets.id, assetId)).get();
    if (!asset || (!canManage(res.locals.user.role) && asset.assignedTo !== res.locals.user.id))
      throw notFound();
    res.json({
      data: db
        .select()
        .from(inventoryAssetEvents)
        .where(eq(inventoryAssetEvents.assetId, assetId))
        .orderBy(asc(inventoryAssetEvents.createdAt))
        .all(),
    });
  });
  router.post('/', (req, res) => {
    if (!canManage(res.locals.user.role))
      throw new ApiError(403, 'FORBIDDEN', 'No puede registrar activos.');
    const v = z
      .object({
        name: z.string().trim().min(1).max(120),
        serial: z.string().trim().min(1).max(120),
        locationId: id,
      })
      .strict()
      .parse(req.body);
    const row = db.transaction((tx) => {
      if (
        !tx.select().from(inventoryLocations).where(eq(inventoryLocations.id, v.locationId)).get()
      )
        throw new ApiError(400, 'INVALID_LOCATION', 'Ubicación inexistente.');
      const date = now(),
        row = tx
          .insert(inventoryAssets)
          .values({ id: randomUUID(), ...v, createdAt: date, updatedAt: date })
          .returning()
          .get();
      tx.insert(inventoryAssetEvents)
        .values({
          id: randomUUID(),
          assetId: row.id,
          actorId: res.locals.user.id,
          action: 'creado',
          detail: JSON.stringify(v),
          createdAt: date,
        })
        .run();
      tx.insert(auditLogs)
        .values({
          id: randomUUID(),
          actorId: res.locals.user.id,
          action: 'asset.created',
          resourceType: 'asset',
          resourceId: row.id,
          createdAt: date,
        })
        .run();
      return row;
    });
    res.status(201).json({ data: row });
  });
  router.post('/:id/assignment', (req, res) => {
    const assetId = id.parse(req.params.id),
      v = z
        .object({
          assigneeId: id.nullable(),
          ticketId: id.nullable(),
          locationId: id,
          expectedUpdatedAt: z.iso.datetime(),
          reason: z.string().trim().min(1).max(1000),
        })
        .strict()
        .parse(req.body),
      user = res.locals.user as typeof users.$inferSelect;
    const row = db.transaction((tx) => {
      const current = tx
        .select()
        .from(inventoryAssets)
        .where(eq(inventoryAssets.id, assetId))
        .get();
      if (!current) throw notFound();
      if (
        !canManage(user.role) &&
        !(
          user.role === 'tecnico' &&
          current.assignedTo === user.id &&
          v.assigneeId === null &&
          v.ticketId === null
        )
      )
        throw new ApiError(403, 'FORBIDDEN', 'No tiene permisos para cambiar esta asignación.');
      if (current.updatedAt !== v.expectedUpdatedAt)
        throw new ApiError(409, 'STALE_ASSET', 'El activo cambió; actualiza la pantalla.');
      if (
        !tx.select().from(inventoryLocations).where(eq(inventoryLocations.id, v.locationId)).get()
      )
        throw new ApiError(400, 'INVALID_LOCATION', 'Ubicación inexistente.');
      if (!v.assigneeId && v.ticketId)
        throw new ApiError(
          400,
          'INVALID_TICKET',
          'Se requiere un responsable para asociar un ticket.',
        );
      if (v.assigneeId) {
        const technician = tx.select().from(users).where(eq(users.id, v.assigneeId)).get();
        if (!technician || technician.role !== 'tecnico' || technician.status !== 'activo')
          throw new ApiError(400, 'INVALID_ASSIGNEE', 'El técnico no está activo.');
        if (v.ticketId) {
          const ticket = tx.select().from(tickets).where(eq(tickets.id, v.ticketId)).get();
          if (
            !ticket ||
            ticket.archivedAt ||
            ['resuelto', 'cerrado'].includes(ticket.status) ||
            ticket.assignedToUserId !== v.assigneeId
          )
            throw new ApiError(
              400,
              'INVALID_TICKET',
              'El ticket no está disponible para este técnico.',
            );
        }
      }
      const date = new Date(Math.max(Date.now(), Date.parse(current.updatedAt) + 1)).toISOString();
      const updated = tx
        .update(inventoryAssets)
        .set({
          assignedTo: v.assigneeId,
          ticketId: v.ticketId,
          locationId: v.locationId,
          updatedAt: date,
        })
        .where(
          and(eq(inventoryAssets.id, assetId), eq(inventoryAssets.updatedAt, v.expectedUpdatedAt)),
        )
        .returning()
        .get();
      if (!updated)
        throw new ApiError(409, 'STALE_ASSET', 'El activo cambió; actualiza la pantalla.');
      const detail = JSON.stringify({
        previous: current.assignedTo,
        assignedTo: v.assigneeId,
        ticketId: v.ticketId,
        locationId: v.locationId,
        reason: v.reason,
      });
      tx.insert(inventoryAssetEvents)
        .values({
          id: randomUUID(),
          assetId,
          actorId: user.id,
          action: v.assigneeId ? 'asignado' : 'devuelto',
          detail,
          createdAt: date,
        })
        .run();
      tx.insert(auditLogs)
        .values({
          id: randomUUID(),
          actorId: user.id,
          action: v.assigneeId ? 'asset.assigned' : 'asset.returned',
          resourceType: 'asset',
          resourceId: assetId,
          createdAt: date,
        })
        .run();
      if (v.ticketId)
        tx.insert(events)
          .values({
            id: randomUUID(),
            ticketId: v.ticketId,
            actorId: user.id,
            type: 'activo_asignado',
            detail: JSON.stringify({ assetId }),
            createdAt: date,
          })
          .run();
      return updated;
    });
    res.json({ data: row });
  });
  return router;
}
