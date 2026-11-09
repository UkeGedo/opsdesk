import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { and, asc, desc, eq, gte, lt, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../db.js';
import { ApiError, now } from '../../common.js';
import {
  auditLogs,
  categories,
  events,
  inventoryProducts,
  inventoryStock,
  tickets,
  users,
} from '../../schema.js';
import { ticketScope } from '../identity/policies.js';
const filters = z
  .object({ from: z.iso.datetime().optional(), to: z.iso.datetime().optional() })
  .strict()
  .refine((v) => !v.from || !v.to || v.from < v.to, 'El final debe ser posterior al inicio.');
function csvCell(value: unknown) {
  let s = String(value ?? '');
  let offset = 0;
  while (offset < s.length && (s.charCodeAt(offset) <= 31 || /\s/u.test(s[offset]))) offset++;
  if ('=+@-'.includes(s[offset] ?? '') && offset < s.length) s = "'" + s;
  return `"${s.replaceAll('"', '""')}"`;
}
export function reportRoutes(db: Db) {
  const router = Router();
  router.get('/summary', (req, res) => {
    const v = filters.parse(req.query);
    const user = res.locals.user as typeof users.$inferSelect;
    const where = and(
      ticketScope(db, user),
      v.from ? gte(tickets.createdAt, v.from) : undefined,
      v.to ? lt(tickets.createdAt, v.to) : undefined,
    );
    const grouped = db
      .select({ status: tickets.status, count: sql<number>`count(*)` })
      .from(tickets)
      .where(where)
      .groupBy(tickets.status)
      .all();
    const priority = db
      .select({ priority: tickets.priority, count: sql<number>`count(*)` })
      .from(tickets)
      .where(where)
      .groupBy(tickets.priority)
      .all();
    const byCategory = db
      .select({ name: categories.name, count: sql<number>`count(*)` })
      .from(tickets)
      .innerJoin(categories, sql`${categories.id} = ${tickets.categoryId}`)
      .where(where)
      .groupBy(categories.id)
      .orderBy(categories.name)
      .all();
    const byDay = db
      .select({ day: sql<string>`substr(${tickets.createdAt},1,10)`, count: sql<number>`count(*)` })
      .from(tickets)
      .where(where)
      .groupBy(sql`substr(${tickets.createdAt},1,10)`)
      .orderBy(sql`substr(${tickets.createdAt},1,10)`)
      .limit(1000)
      .all();
    const metrics = db
      .select({
        total: sql<number>`count(*)`,
        unassigned: sql<number>`sum(case when ${tickets.assignedToUserId} is null then 1 else 0 end)`,
        averageResolutionHours: sql<
          number | null
        >`avg(case when ${tickets.resolvedAt} is not null then (julianday(${tickets.resolvedAt}) - julianday(${tickets.createdAt})) * 24 end)`,
      })
      .from(tickets)
      .where(where)
      .get();
    const resolvedWhere = and(
      ticketScope(db, user),
      sql`${tickets.resolvedAt} is not null`,
      v.from ? gte(tickets.resolvedAt, v.from) : undefined,
      v.to ? lt(tickets.resolvedAt, v.to) : undefined,
    );
    const resolved =
      db
        .select({ count: sql<number>`count(*)` })
        .from(tickets)
        .where(resolvedWhere)
        .get()?.count ?? 0;
    const reopened =
      db
        .select({ count: sql<number>`count(*)` })
        .from(events)
        .innerJoin(tickets, sql`${events.ticketId}=${tickets.id}`)
        .where(
          and(
            ticketScope(db, user),
            sql`${events.type} = 'estado_cambiado'`,
            sql`case when json_valid(${events.detail}) then json_extract(${events.detail}, '$.to') else null end = 'reabierto'`,
            v.from ? gte(events.createdAt, v.from) : undefined,
            v.to ? lt(events.createdAt, v.to) : undefined,
          ),
        )
        .get()?.count ?? 0;
    const lowProducts = db
      .select({ id: inventoryProducts.id })
      .from(inventoryProducts)
      .leftJoin(inventoryStock, eq(inventoryStock.productId, inventoryProducts.id))
      .groupBy(inventoryProducts.id)
      .having(sql`coalesce(sum(${inventoryStock.quantity}),0) < ${inventoryProducts.minimum}`)
      .as('low_products');
    const lowStock = ['administrador', 'supervisor'].includes(user.role)
      ? (db
          .select({ count: sql<number>`count(*)` })
          .from(lowProducts)
          .get()?.count ?? 0)
      : null;
    const workload = ['administrador', 'supervisor'].includes(user.role)
      ? db
          .select({ name: users.fullName, count: sql<number>`count(*)` })
          .from(tickets)
          .innerJoin(users, sql`${users.id}=${tickets.assignedToUserId}`)
          .where(and(where, sql`${tickets.status} not in ('cerrado','resuelto')`))
          .groupBy(users.id)
          .orderBy(users.fullName)
          .all()
      : [];
    res.json({
      data: {
        resolved,
        reopened,
        workload,
        lowStock,
        total: metrics?.total ?? 0,
        unassigned: metrics?.unassigned ?? 0,
        averageResolutionHours: metrics?.averageResolutionHours ?? null,
        status: grouped,
        priority,
        byCategory,
        byDay,
      },
    });
  });
  router.get('/recent', (req, res) => {
    const user = res.locals.user as typeof users.$inferSelect;
    const query = z
      .object({ limit: z.coerce.number().int().min(1).max(50).default(10) })
      .strict()
      .parse(req.query);
    const rows = db
      .select({
        id: events.id,
        type: events.type,
        createdAt: events.createdAt,
        actor: users.fullName,
        ticketId: tickets.id,
        ticketNumber: tickets.ticketNumber,
      })
      .from(events)
      .innerJoin(tickets, eq(events.ticketId, tickets.id))
      .innerJoin(users, eq(events.actorId, users.id))
      .where(
        and(
          ticketScope(db, user),
          user.role === 'cliente' ? ne(events.type, 'comentario_interno') : undefined,
        ),
      )
      .orderBy(desc(events.createdAt), desc(events.id))
      .limit(query.limit)
      .all();
    res.json({ data: rows });
  });
  router.post('/tickets.csv', (req, res) => {
    const user = res.locals.user as typeof users.$inferSelect;
    if (!['administrador', 'supervisor'].includes(user.role))
      throw new ApiError(403, 'FORBIDDEN', 'No tiene permiso para exportar.');
    const v = filters.parse(req.body);
    const where = and(
      v.from ? gte(tickets.createdAt, v.from) : undefined,
      v.to ? lt(tickets.createdAt, v.to) : undefined,
    );
    const rows = db
      .select({
        number: tickets.ticketNumber,
        title: tickets.title,
        status: tickets.status,
        priority: tickets.priority,
        createdAt: tickets.createdAt,
        resolvedAt: tickets.resolvedAt,
      })
      .from(tickets)
      .where(where)
      .orderBy(asc(tickets.createdAt), asc(tickets.id))
      .limit(1001)
      .all();
    if (rows.length > 1000)
      throw new ApiError(
        400,
        'EXPORT_LIMIT',
        'La exportación supera 1000 registros. Reduzca el período.',
      );
    const csv =
      '\uFEFF' +
      [
        ['Número', 'Título', 'Estado', 'Prioridad', 'Creado UTC', 'Resuelto UTC'],
        ...rows.map((r) => [r.number, r.title, r.status, r.priority, r.createdAt, r.resolvedAt]),
      ]
        .map((row) => row.map(csvCell).join(','))
        .join('\r\n') +
      '\r\n';
    db.insert(auditLogs)
      .values({
        id: randomUUID(),
        actorId: user.id,
        action: 'report.tickets_exported',
        resourceType: 'report',
        resourceId: 'tickets',
        context: JSON.stringify({ count: rows.length, ...v }),
        createdAt: now(),
      })
      .run();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="tickets.csv"');
    res.send(csv);
  });
  return router;
}
