import { randomUUID } from 'node:crypto';
import type { DomainEventBus } from '../../domain-events.js';
import { Router } from 'express';
import { and, desc, eq, getTableColumns, gte, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../db.js';
import { ApiError, id, now } from '../../common.js';
import { visibleTicket } from '../identity/policies.js';
import {
  auditLogs,
  events,
  inventoryAlerts,
  inventoryLocations,
  inventoryMovements,
  inventoryProducts,
  inventoryStock,
  users,
  tickets,
} from '../../schema.js';

const label = z.string().trim().min(1).max(120);
export const movementInput = z
  .object({
    requestId: id,
    productId: id,
    kind: z.enum(['entrada', 'salida', 'transferencia', 'ajuste_entrada', 'ajuste_salida']),
    sourceId: id.optional(),
    destinationId: id.optional(),
    ticketId: id.optional(),
    quantity: z.number().int().positive().max(1000000),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      (['entrada', 'ajuste_entrada'].includes(v.kind) &&
        (v.sourceId || !v.destinationId || v.ticketId)) ||
      (['salida', 'ajuste_salida'].includes(v.kind) &&
        (!v.sourceId || v.destinationId || (v.kind === 'ajuste_salida' && !!v.ticketId))) ||
      (v.kind === 'transferencia' &&
        (!v.sourceId || !v.destinationId || v.sourceId === v.destinationId || v.ticketId))
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Las ubicaciones o el ticket no corresponden al tipo de movimiento.',
      });
  });
function lowStockAlert(
  db: Pick<Db, 'select' | 'insert'>,
  product: typeof inventoryProducts.$inferSelect,
  quantity: number,
  date: string,
) {
  const recipients = db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.status, 'activo'), inArray(users.role, ['administrador', 'supervisor'])))
    .all();
  for (const recipient of recipients)
    db.insert(inventoryAlerts)
      .values({
        id: randomUUID(),
        recipientId: recipient.id,
        productId: product.id,
        message: `${product.name}: ${quantity} ${product.unit}; mínimo ${product.minimum}.`,
        createdAt: date,
      })
      .run();
}
function productQuantity(db: Pick<Db, 'select'>, productId: string) {
  return (
    db
      .select({ value: sql<number>`coalesce(sum(${inventoryStock.quantity}),0)` })
      .from(inventoryStock)
      .where(eq(inventoryStock.productId, productId))
      .get()?.value ?? 0
  );
}
export function inventoryRoutes(db: Db, domainEvents?: DomainEventBus) {
  const router = Router();
  router.use((_req, res, next) => {
    const user = res.locals.user as typeof users.$inferSelect;
    if (!['administrador', 'supervisor', 'tecnico'].includes(user.role))
      return next(new ApiError(403, 'FORBIDDEN', 'No tiene permisos de inventario.'));
    next();
  });
  router.get('/products', (req, res) => {
    const q = z
      .object({
        q: z.string().trim().max(120).optional(),
        page: z.coerce.number().int().min(1).max(100000).default(1),
        limit: z.coerce.number().int().min(1).max(500).default(500),
      })
      .strict()
      .parse(req.query);
    const where = q.q ? sql`instr(lower(${inventoryProducts.name}),lower(${q.q})) > 0` : undefined;
    const total =
      db
        .select({ n: sql<number>`count(*)` })
        .from(inventoryProducts)
        .where(where)
        .get()?.n ?? 0;
    const data = db
      .select()
      .from(inventoryProducts)
      .where(where)
      .orderBy(inventoryProducts.name, inventoryProducts.id)
      .limit(q.limit)
      .offset((q.page - 1) * q.limit)
      .all();
    res.json({ data, meta: { page: q.page, limit: q.limit, total } });
  });
  router.get('/low-stock', (req, res) => {
    const q = z
      .object({
        page: z.coerce.number().int().min(1).max(100000).default(1),
        limit: z.coerce.number().int().min(1).max(500).default(500),
      })
      .strict()
      .parse(req.query);
    const grouped = db
      .select({
        id: inventoryProducts.id,
        name: inventoryProducts.name,
        unit: inventoryProducts.unit,
        minimum: inventoryProducts.minimum,
        quantity: sql<number>`coalesce(sum(${inventoryStock.quantity}),0)`.as('quantity'),
      })
      .from(inventoryProducts)
      .leftJoin(inventoryStock, eq(inventoryStock.productId, inventoryProducts.id))
      .groupBy(inventoryProducts.id)
      .having(sql`coalesce(sum(${inventoryStock.quantity}),0) < ${inventoryProducts.minimum}`)
      .as('low_stock');
    const total =
      db
        .select({ n: sql<number>`count(*)` })
        .from(grouped)
        .get()?.n ?? 0;
    const data = db
      .select()
      .from(grouped)
      .orderBy(grouped.name, grouped.id)
      .limit(q.limit)
      .offset((q.page - 1) * q.limit)
      .all();
    res.json({ data, meta: { total, page: q.page, limit: q.limit } });
  });
  router.get('/alerts', (_req, res) => {
    if (!['administrador', 'supervisor'].includes(res.locals.user.role))
      throw new ApiError(403, 'FORBIDDEN', 'No tiene acceso a alertas.');
    res.json({
      data: db
        .select()
        .from(inventoryAlerts)
        .where(eq(inventoryAlerts.recipientId, res.locals.user.id))
        .orderBy(desc(inventoryAlerts.createdAt))
        .limit(100)
        .all(),
    });
  });
  router.post('/alerts/read', (req, res) => {
    if (!['administrador', 'supervisor'].includes(res.locals.user.role))
      throw new ApiError(403, 'FORBIDDEN', 'No tiene acceso a alertas.');
    const input = z
      .object({ ids: z.array(id).min(1).max(100) })
      .strict()
      .parse(req.body);
    db.transaction((tx) => {
      for (const alertId of new Set(input.ids)) {
        const row = tx
          .select()
          .from(inventoryAlerts)
          .where(
            and(
              eq(inventoryAlerts.id, alertId),
              eq(inventoryAlerts.recipientId, res.locals.user.id),
            ),
          )
          .get();
        if (!row) throw new ApiError(404, 'NOT_FOUND', 'Recurso no encontrado.');
        tx.update(inventoryAlerts)
          .set({ readAt: now() })
          .where(and(eq(inventoryAlerts.id, row.id), isNull(inventoryAlerts.readAt)))
          .run();
      }
    });
    res.status(204).end();
  });
  router.get('/locations', (req, res) => {
    const q = z
      .object({
        q: z.string().trim().max(120).optional(),
        page: z.coerce.number().int().min(1).max(100000).default(1),
        limit: z.coerce.number().int().min(1).max(500).default(500),
      })
      .strict()
      .parse(req.query);
    const where = q.q ? sql`instr(lower(${inventoryLocations.name}),lower(${q.q})) > 0` : undefined;
    const total =
      db
        .select({ n: sql<number>`count(*)` })
        .from(inventoryLocations)
        .where(where)
        .get()?.n ?? 0;
    const data = db
      .select()
      .from(inventoryLocations)
      .where(where)
      .orderBy(inventoryLocations.name, inventoryLocations.id)
      .limit(q.limit)
      .offset((q.page - 1) * q.limit)
      .all();
    res.json({ data, meta: { page: q.page, limit: q.limit, total } });
  });
  router.get('/stock', (req, res) => {
    const q = z
      .object({
        page: z.coerce.number().int().min(1).max(100000).default(1),
        limit: z.coerce.number().int().min(1).max(1000).default(1000),
        productId: id.optional(),
        locationId: id.optional(),
      })
      .strict()
      .parse(req.query);
    const where = and(
      q.productId ? eq(inventoryStock.productId, q.productId) : undefined,
      q.locationId ? eq(inventoryStock.locationId, q.locationId) : undefined,
    );
    const total =
      db
        .select({ n: sql<number>`count(*)` })
        .from(inventoryStock)
        .where(where)
        .get()?.n ?? 0;
    const data = db
      .select({
        ...getTableColumns(inventoryStock),
        productName: inventoryProducts.name,
        minimum: inventoryProducts.minimum,
        locationName: inventoryLocations.name,
      })
      .from(inventoryStock)
      .innerJoin(inventoryProducts, eq(inventoryStock.productId, inventoryProducts.id))
      .innerJoin(inventoryLocations, eq(inventoryStock.locationId, inventoryLocations.id))
      .where(where)
      .orderBy(inventoryStock.productId, inventoryStock.locationId)
      .limit(q.limit)
      .offset((q.page - 1) * q.limit)
      .all();
    res.json({ data, meta: { page: q.page, limit: q.limit, total } });
  });
  router.get('/movements', (req, res) => {
    const q = z
      .object({
        page: z.coerce.number().int().min(1).max(100000).default(1),
        limit: z.coerce.number().int().min(1).max(200).default(200),
        productId: id.optional(),
        ticketId: id.optional(),
      })
      .strict()
      .parse(req.query);
    const scope =
      res.locals.user.role === 'tecnico'
        ? and(
            eq(inventoryMovements.actorId, res.locals.user.id),
            inArray(
              inventoryMovements.ticketId,
              db
                .select({ id: tickets.id })
                .from(tickets)
                .where(eq(tickets.assignedToUserId, res.locals.user.id)),
            ),
          )
        : undefined;
    const where = and(
      scope,
      q.productId ? eq(inventoryMovements.productId, q.productId) : undefined,
      q.ticketId ? eq(inventoryMovements.ticketId, q.ticketId) : undefined,
    );
    const total =
      db
        .select({ n: sql<number>`count(*)` })
        .from(inventoryMovements)
        .where(where)
        .get()?.n ?? 0;
    const data = db
      .select({ ...getTableColumns(inventoryMovements), productName: inventoryProducts.name })
      .from(inventoryMovements)
      .innerJoin(inventoryProducts, eq(inventoryMovements.productId, inventoryProducts.id))
      .where(where)
      .orderBy(desc(inventoryMovements.createdAt), desc(inventoryMovements.id))
      .limit(q.limit)
      .offset((q.page - 1) * q.limit)
      .all();
    res.json({ data, meta: { page: q.page, limit: q.limit, total } });
  });
  router.post('/products', (req, res) => {
    if (res.locals.user.role === 'tecnico')
      throw new ApiError(403, 'FORBIDDEN', 'No tiene permisos para crear productos.');
    const v = z
      .object({ name: label, unit: label, minimum: z.number().int().min(0).max(1000000) })
      .strict()
      .parse(req.body);
    const row = db.transaction((tx) => {
      const date = now();
      const created = tx
        .insert(inventoryProducts)
        .values({ id: randomUUID(), ...v, createdAt: date, updatedAt: date })
        .returning()
        .get();
      if (created.minimum > 0) lowStockAlert(tx, created, 0, date);
      tx.insert(auditLogs)
        .values({
          id: randomUUID(),
          actorId: res.locals.user.id,
          action: 'inventory.product_created',
          resourceType: 'product',
          resourceId: created.id,
          createdAt: date,
        })
        .run();
      return created;
    });
    res.status(201).json({ data: row });
  });
  router.patch('/products/:id', (req, res) => {
    if (!['administrador', 'supervisor'].includes(res.locals.user.role))
      throw new ApiError(403, 'FORBIDDEN', 'No puede editar productos.');
    const productId = id.parse(req.params.id),
      v = z
        .object({
          name: label.optional(),
          unit: label.optional(),
          minimum: z.number().int().min(0).max(1000000).optional(),
          expectedUpdatedAt: z.iso.datetime(),
        })
        .strict()
        .refine((x) => Object.keys(x).some((k) => k !== 'expectedUpdatedAt'))
        .parse(req.body);
    const row = db.transaction((tx) => {
      const previous = tx
        .select()
        .from(inventoryProducts)
        .where(eq(inventoryProducts.id, productId))
        .get();
      if (!previous) throw new ApiError(404, 'NOT_FOUND', 'Producto inexistente.');
      if (previous.updatedAt !== v.expectedUpdatedAt)
        throw new ApiError(409, 'STALE_PRODUCT', 'El producto cambió; actualiza los datos.');
      const quantity = productQuantity(tx, productId);
      const { expectedUpdatedAt, ...changes } = v;
      const date = new Date(Math.max(Date.now(), Date.parse(previous.updatedAt) + 1)).toISOString();
      const updated = tx
        .update(inventoryProducts)
        .set({ ...changes, updatedAt: date })
        .where(
          and(
            eq(inventoryProducts.id, productId),
            eq(inventoryProducts.updatedAt, expectedUpdatedAt),
          ),
        )
        .returning()
        .get();
      if (!updated)
        throw new ApiError(409, 'STALE_PRODUCT', 'El producto cambió; actualiza los datos.');
      if (quantity >= previous.minimum && quantity < updated.minimum)
        lowStockAlert(tx, updated, quantity, date);
      tx.insert(auditLogs)
        .values({
          id: randomUUID(),
          actorId: res.locals.user.id,
          action: 'inventory.product_updated',
          resourceType: 'product',
          resourceId: productId,
          createdAt: date,
        })
        .run();
      return updated;
    });
    res.json({ data: row });
  });
  router.post('/locations', (req, res) => {
    if (res.locals.user.role === 'tecnico')
      throw new ApiError(403, 'FORBIDDEN', 'No tiene permisos para crear ubicaciones.');
    const v = z.object({ name: label }).strict().parse(req.body);
    const row = db.transaction((tx) => {
      const date = now();
      const created = tx
        .insert(inventoryLocations)
        .values({ id: randomUUID(), ...v, createdAt: date })
        .returning()
        .get();
      tx.insert(auditLogs)
        .values({
          id: randomUUID(),
          actorId: res.locals.user.id,
          action: 'inventory.location_created',
          resourceType: 'location',
          resourceId: created.id,
          createdAt: date,
        })
        .run();
      return created;
    });
    res.status(201).json({ data: row });
  });
  router.post('/movements', (req, res) => {
    const v = movementInput.parse(req.body);
    const user = res.locals.user as typeof users.$inferSelect;
    if (user.role === 'tecnico' && (v.kind !== 'salida' || !v.ticketId))
      throw new ApiError(403, 'FORBIDDEN', 'Solo puede registrar consumos de sus tickets.');
    const result = db.transaction((tx) => {
      const existing = tx
        .select()
        .from(inventoryMovements)
        .where(eq(inventoryMovements.requestId, v.requestId))
        .get();
      if (existing) {
        if (
          existing.actorId !== user.id ||
          existing.productId !== v.productId ||
          existing.kind !== v.kind ||
          existing.quantity !== v.quantity ||
          existing.sourceId !== (v.sourceId ?? null) ||
          existing.destinationId !== (v.destinationId ?? null) ||
          existing.ticketId !== (v.ticketId ?? null) ||
          existing.reason !== v.reason
        )
          throw new ApiError(
            409,
            'IDEMPOTENCY_CONFLICT',
            'La clave ya corresponde a otra operación.',
          );
        if (existing.ticketId) visibleTicket(db, user, existing.ticketId);
        return { row: existing, duplicate: true };
      }
      const product = tx
        .select()
        .from(inventoryProducts)
        .where(eq(inventoryProducts.id, v.productId))
        .get();
      if (!product) throw new ApiError(400, 'INVALID_PRODUCT', 'Producto inexistente.');
      const beforeQuantity = productQuantity(tx, product.id);
      for (const location of [v.sourceId, v.destinationId])
        if (
          location &&
          !tx.select().from(inventoryLocations).where(eq(inventoryLocations.id, location)).get()
        )
          throw new ApiError(400, 'INVALID_LOCATION', 'Ubicación inexistente.');
      if (v.ticketId) {
        const ticket = visibleTicket(db, user, v.ticketId);
        if (ticket.archivedAt || ['cerrado', 'resuelto'].includes(ticket.status))
          throw new ApiError(409, 'INVALID_STATE', 'El ticket no admite consumos.');
      }
      if (v.sourceId) {
        const updated = tx
          .update(inventoryStock)
          .set({ quantity: sql`${inventoryStock.quantity} - ${v.quantity}` })
          .where(
            and(
              eq(inventoryStock.productId, v.productId),
              eq(inventoryStock.locationId, v.sourceId),
              gte(inventoryStock.quantity, v.quantity),
            ),
          )
          .returning()
          .get();
        if (!updated) throw new ApiError(409, 'INSUFFICIENT_STOCK', 'Existencias insuficientes.');
      }
      if (v.destinationId)
        tx.insert(inventoryStock)
          .values({
            id: randomUUID(),
            productId: v.productId,
            locationId: v.destinationId,
            quantity: v.quantity,
          })
          .onConflictDoUpdate({
            target: [inventoryStock.productId, inventoryStock.locationId],
            set: { quantity: sql`${inventoryStock.quantity} + ${v.quantity}` },
          })
          .run();
      const date = now();
      const afterQuantity = productQuantity(tx, product.id);
      if (beforeQuantity >= product.minimum && afterQuantity < product.minimum)
        lowStockAlert(tx, product, afterQuantity, date);
      const row = tx
        .insert(inventoryMovements)
        .values({ id: randomUUID(), ...v, actorId: user.id, createdAt: date })
        .returning()
        .get();
      tx.insert(auditLogs)
        .values({
          id: randomUUID(),
          actorId: user.id,
          action: v.kind.startsWith('ajuste_') ? 'inventory.adjustment' : 'inventory.movement',
          resourceType: 'inventory_movement',
          resourceId: row.id,
          createdAt: date,
        })
        .run();
      if (v.ticketId)
        tx.insert(events)
          .values({
            id: randomUUID(),
            ticketId: v.ticketId,
            actorId: user.id,
            type: 'material_consumido',
            detail: JSON.stringify({
              movementId: row.id,
              productId: v.productId,
              quantity: v.quantity,
            }),
            createdAt: date,
          })
          .run();
      return { row, duplicate: false };
    });
    if (!result.duplicate)
      domainEvents?.publish({
        type: 'inventory.movement',
        movementId: result.row.id,
        actorId: user.id,
      });
    res
      .status(result.duplicate ? 200 : 201)
      .json({ data: result.row, duplicate: result.duplicate });
  });
  return router;
}
