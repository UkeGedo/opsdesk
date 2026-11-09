import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { and, asc, desc, eq, getTableColumns, isNull, like, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from './db.js';
import {
  auditLogs,
  categories,
  comments,
  counters,
  customers,
  customerUsers,
  events,
  sessions,
  passwordResets,
  ticketAssignments,
  notifications,
  tickets,
  users,
} from './schema.js';
import { ApiError, id, notFound, now, pageQuery } from './common.js';
import { publicUser } from './auth.js';
import { validateTransition } from './ticket-lifecycle.js';
function notifyTicket(
  tx: Pick<Db, 'select' | 'insert'>,
  ticket: typeof tickets.$inferSelect,
  actor: string,
  type: string,
  title: string,
  message: string,
  date: string,
) {
  const customersForTicket = tx
    .select({ id: users.id })
    .from(customerUsers)
    .innerJoin(users, eq(customerUsers.userId, users.id))
    .where(and(eq(customerUsers.customerId, ticket.customerId), eq(users.status, 'activo')))
    .all();
  const recipients = new Set([
    ...customersForTicket.map((x) => x.id),
    ...(ticket.assignedToUserId ? [ticket.assignedToUserId] : []),
  ]);
  for (const recipientId of recipients)
    if (recipientId !== actor)
      tx.insert(notifications)
        .values({
          id: randomUUID(),
          recipientId,
          ticketId: ticket.id,
          type,
          title,
          message,
          createdAt: date,
        })
        .run();
}
const nonempty = z.string().trim().min(1).max(200);
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const role = z.enum(['administrador', 'supervisor', 'tecnico', 'cliente']);
const status = z.enum(['activo', 'inactivo']);
const priority = z.enum(['baja', 'media', 'alta', 'urgente']);
const ticketStatus = z.enum([
  'abierto',
  'asignado',
  'en_proceso',
  'pendiente_cliente',
  'resuelto',
  'cerrado',
  'reabierto',
]);
const optionalText = z.string().trim().max(500).nullable().optional();
export const userCreate = z
  .object({
    fullName: nonempty,
    email,
    password: z.string().min(12).max(256),
    role,
    status: status.default('activo'),
  })
  .strict();
export const userPatch = z
  .object({
    fullName: nonempty.optional(),
    email: email.optional(),
    role: role.optional(),
    status: status.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Indique algún campo.');
const customerBase = z
  .object({
    name: nonempty,
    documentType: optionalText,
    documentNumber: optionalText,
    email: email.nullable().optional(),
    phone: optionalText,
    address: optionalText,
    notes: optionalText,
    status: status.default('activo'),
  })
  .strict();
const documentPair = (v: { documentType?: string | null; documentNumber?: string | null }) =>
  Boolean(v.documentType) === Boolean(v.documentNumber);
export const customerCreate = customerBase.refine(
  documentPair,
  'Indique tipo y número de documento juntos.',
);
export const customerPatch = customerBase
  .partial()
  .extend({ status: status.optional(), expectedUpdatedAt: z.iso.datetime().optional() })
  .refine((v) => Object.keys(v).some((key) => key !== 'expectedUpdatedAt'), 'Indique algún campo.');
export const categoryCreate = z
  .object({ name: nonempty, description: optionalText, active: z.boolean().default(true) })
  .strict();
export const ticketCreate = z
  .object({
    customerId: id,
    categoryId: id,
    title: nonempty,
    description: z.string().trim().min(1).max(10000),
    priority,
    assignedToUserId: id.nullable().optional(),
  })
  .strict();
export const ticketPatch = z
  .object({
    title: nonempty.optional(),
    description: z.string().trim().min(1).max(10000).optional(),
    priority: priority.optional(),
    status: ticketStatus.optional(),
    resolution: z.string().trim().min(1).max(10000).optional(),
    reopenReason: z.string().trim().min(1).max(1000).optional(),
    expectedUpdatedAt: z.iso.datetime(),
    categoryId: id.optional(),
    assignedToUserId: id.nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).some((k) => k !== 'expectedUpdatedAt'), 'Indique algún campo.');
export const commentCreate = z
  .object({
    body: z.string().trim().min(1).max(10000),
    visibility: z.enum(['interno', 'cliente']),
    requestId: id,
  })
  .strict();
export const listUsers = z
  .object({
    ...pageQuery,
    sort: z.enum(['fullName', 'email', 'createdAt']).default('fullName'),
    status: status.optional(),
  })
  .strict();
export const listCustomers = z
  .object({
    ...pageQuery,
    sort: z.enum(['name', 'email', 'createdAt']).default('name'),
    status: status.optional(),
  })
  .strict();
export const listTickets = z
  .object({
    ...pageQuery,
    sort: z.enum(['ticketNumber', 'title', 'createdAt', 'priority']).default('createdAt'),
    status: ticketStatus.optional(),
    priority: priority.optional(),
    categoryId: id.optional(),
    customerId: id.optional(),
    assignedTo: z.union([id, z.literal('unassigned')]).optional(),
  })
  .strict();
const escaped = (v: string) => `%${v.replace(/[!%_]/g, '!$&')}%`;
const matching = (col: Parameters<typeof like>[0], q: string) =>
  sql`${col} like ${escaped(q)} escape '!'`;
const page = (v: { page: number; limit: number }) => ({
  limit: v.limit,
  offset: (v.page - 1) * v.limit,
});
const result = <T>(data: T[], total: number, v: { page: number; limit: number }) => ({
  data,
  meta: { page: v.page, limit: v.limit, total },
});
export class Domain {
  constructor(private db: Db) {}
  user(idValue: string) {
    const row = this.db.select().from(users).where(eq(users.id, idValue)).get();
    if (!row) throw notFound();
    return row;
  }
  customer(idValue: string) {
    const row = this.db.select().from(customers).where(eq(customers.id, idValue)).get();
    if (!row) throw notFound();
    return row;
  }
  ticket(idValue: string) {
    const row = this.db.select().from(tickets).where(eq(tickets.id, idValue)).get();
    if (!row) throw notFound();
    return row;
  }
  category(idValue: string) {
    const row = this.db.select().from(categories).where(eq(categories.id, idValue)).get();
    if (!row || !row.active)
      throw new ApiError(400, 'INVALID_CATEGORY', 'La categoría no existe o está inactiva.');
    return row;
  }
  assignee(idValue: string | null | undefined) {
    if (!idValue) return;
    const u = this.user(idValue);
    if (u.status !== 'activo' || u.role !== 'tecnico')
      throw new ApiError(400, 'INVALID_ASSIGNEE', 'El usuario asignado no está disponible.');
  }
  async createUser(v: z.infer<typeof userCreate>, actor: string) {
    const passwordHash = await argon2.hash(v.password, { type: argon2.argon2id });
    const date = now();
    return this.db.transaction((tx) => {
      const currentActor = tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(eq(users.id, actor), eq(users.status, 'activo'), eq(users.role, 'administrador')),
        )
        .get();
      if (!currentActor)
        throw new ApiError(403, 'FORBIDDEN', 'No tiene permisos para esta operación.');
      const row = tx
        .insert(users)
        .values({
          id: randomUUID(),
          fullName: v.fullName,
          email: v.email,
          passwordHash,
          role: v.role,
          status: v.status,
          createdAt: date,
          updatedAt: date,
        })
        .returning()
        .get();
      tx.insert(auditLogs)
        .values({
          id: randomUUID(),
          actorId: actor,
          action: 'user.created',
          resourceType: 'user',
          resourceId: row.id,
          createdAt: date,
        })
        .run();
      return publicUser(row);
    });
  }

  updateUser(idValue: string, v: z.infer<typeof userPatch>, actor: string) {
    return this.db.transaction((tx) => {
      const existing = tx.select().from(users).where(eq(users.id, idValue)).get();
      if (!existing) throw notFound();
      if (
        existing.role === 'administrador' &&
        existing.status === 'activo' &&
        ((v.role && v.role !== 'administrador') || v.status === 'inactivo')
      ) {
        const admins = tx
          .select({ n: sql<number>`count(*)` })
          .from(users)
          .where(and(eq(users.role, 'administrador'), eq(users.status, 'activo')))
          .get()!.n;
        if (admins <= 1)
          throw new ApiError(409, 'LAST_ADMIN', 'Debe permanecer un administrador activo.');
      }
      const row = tx
        .update(users)
        .set({ ...v, updatedAt: now() })
        .where(eq(users.id, idValue))
        .returning()
        .get();
      if (v.role && v.role !== existing.role)
        tx.delete(customerUsers).where(eq(customerUsers.userId, idValue)).run();
      if (
        v.status === 'inactivo' ||
        (v.role && v.role !== existing.role) ||
        (v.email && v.email !== existing.email)
      )
        tx.update(sessions).set({ revokedAt: now() }).where(eq(sessions.userId, idValue)).run();
      if (
        v.status === 'inactivo' ||
        (v.email && v.email !== existing.email) ||
        (v.role && v.role !== existing.role)
      )
        tx.update(passwordResets)
          .set({ usedAt: now() })
          .where(and(eq(passwordResets.userId, idValue), isNull(passwordResets.usedAt)))
          .run();
      if (v.role && v.role !== existing.role)
        tx.insert(auditLogs)
          .values({
            id: randomUUID(),
            actorId: actor,
            action: 'user.role_changed',
            resourceType: 'user',
            resourceId: idValue,
            context: JSON.stringify({ from: existing.role, to: v.role }),
            createdAt: now(),
          })
          .run();
      if (v.status === 'inactivo' && existing.status !== 'inactivo')
        tx.insert(auditLogs)
          .values({
            id: randomUUID(),
            actorId: actor,
            action: 'user.deactivated',
            resourceType: 'user',
            resourceId: idValue,
            createdAt: now(),
          })
          .run();
      tx.insert(auditLogs)
        .values({
          id: randomUUID(),
          actorId: actor,
          action: 'user.updated',
          resourceType: 'user',
          resourceId: idValue,
          createdAt: now(),
        })
        .run();
      return publicUser(row);
    });
  }
  users(v: z.infer<typeof listUsers>) {
    const where = and(
      v.status ? eq(users.status, v.status) : undefined,
      v.q ? or(matching(users.fullName, v.q), matching(users.email, v.q)) : undefined,
    );
    const col = { fullName: users.fullName, email: users.email, createdAt: users.createdAt }[
      v.sort
    ];
    const data = this.db
      .select()
      .from(users)
      .where(where)
      .orderBy(v.order === 'asc' ? asc(col) : desc(col), asc(users.id))
      .limit(page(v).limit)
      .offset(page(v).offset)
      .all()
      .map(publicUser);
    const total = this.db
      .select({ n: sql<number>`count(*)` })
      .from(users)
      .where(where)
      .get()!.n;
    return result(data, total, v);
  }
  customers(v: z.infer<typeof listCustomers>) {
    const where = and(
      v.status ? eq(customers.status, v.status) : undefined,
      v.q
        ? or(
            matching(customers.name, v.q),
            matching(customers.email, v.q),
            matching(customers.documentNumber, v.q),
          )
        : undefined,
    );
    const col = { name: customers.name, email: customers.email, createdAt: customers.createdAt }[
      v.sort
    ];
    const data = this.db
      .select()
      .from(customers)
      .where(where)
      .orderBy(v.order === 'asc' ? asc(col) : desc(col), asc(customers.id))
      .limit(page(v).limit)
      .offset(page(v).offset)
      .all();
    const total = this.db
      .select({ n: sql<number>`count(*)` })
      .from(customers)
      .where(where)
      .get()!.n;
    return result(data, total, v);
  }
  createCustomer(v: z.infer<typeof customerCreate>, actor: string) {
    return this.db.transaction((tx) => {
      const date = now();
      const row = tx
        .insert(customers)
        .values({
          ...v,
          documentType: v.documentType || null,
          documentNumber: v.documentNumber || null,
          id: randomUUID(),
          createdAt: date,
          updatedAt: date,
        })
        .returning()
        .get();
      tx.insert(auditLogs)
        .values({
          id: randomUUID(),
          actorId: actor,
          action: 'customer.created',
          resourceType: 'customer',
          resourceId: row.id,
          createdAt: date,
        })
        .run();
      return row;
    });
  }
  updateCustomer(idValue: string, v: z.infer<typeof customerPatch>, actor: string) {
    return this.db.transaction((tx) => {
      const existing = tx.select().from(customers).where(eq(customers.id, idValue)).get();
      if (!existing) throw notFound();
      const { expectedUpdatedAt, ...changes } = v;
      if (expectedUpdatedAt && existing.updatedAt !== expectedUpdatedAt)
        throw new ApiError(
          409,
          'STALE_CUSTOMER',
          'El cliente cambió; cierra el formulario y vuelve a editarlo.',
        );
      if (!documentPair({ ...existing, ...changes }))
        throw new ApiError(400, 'VALIDATION_ERROR', 'Indique tipo y número de documento juntos.');
      const date = new Date(Math.max(Date.now(), Date.parse(existing.updatedAt) + 1)).toISOString();
      const row = tx
        .update(customers)
        .set({ ...changes, updatedAt: date })
        .where(and(eq(customers.id, idValue), eq(customers.updatedAt, existing.updatedAt)))
        .returning()
        .get();
      if (!row)
        throw new ApiError(
          409,
          'STALE_CUSTOMER',
          'El cliente cambió; cierra el formulario y vuelve a editarlo.',
        );
      tx.insert(auditLogs)
        .values({
          id: randomUUID(),
          actorId: actor,
          action: 'customer.updated',
          resourceType: 'customer',
          resourceId: idValue,
          createdAt: date,
        })
        .run();
      return row;
    });
  }
  createCategory(v: z.infer<typeof categoryCreate>, actor: string) {
    return this.db.transaction((tx) => {
      const date = now();
      const row = tx
        .insert(categories)
        .values({ ...v, id: randomUUID() })
        .returning()
        .get();
      tx.insert(auditLogs)
        .values({
          id: randomUUID(),
          actorId: actor,
          action: 'category.created',
          resourceType: 'category',
          resourceId: row.id,
          createdAt: date,
        })
        .run();
      return row;
    });
  }
  categories() {
    return this.db.select().from(categories).orderBy(asc(categories.name)).all();
  }
  tickets(v: z.infer<typeof listTickets>, extra?: SQL) {
    const where = and(
      extra,
      v.status ? eq(tickets.status, v.status) : undefined,
      v.priority ? eq(tickets.priority, v.priority) : undefined,
      v.customerId ? eq(tickets.customerId, v.customerId) : undefined,
      v.categoryId ? eq(tickets.categoryId, v.categoryId) : undefined,
      v.assignedTo === 'unassigned'
        ? isNull(tickets.assignedToUserId)
        : v.assignedTo
          ? eq(tickets.assignedToUserId, v.assignedTo)
          : undefined,
      v.q
        ? or(
            matching(tickets.title, v.q),
            sql`cast(${tickets.ticketNumber} as text) like ${escaped(v.q)} escape '!'`,
          )
        : undefined,
    );
    const col = {
      ticketNumber: tickets.ticketNumber,
      title: tickets.title,
      createdAt: tickets.createdAt,
      priority: tickets.priority,
    }[v.sort];
    const data = this.db
      .select()
      .from(tickets)
      .where(where)
      .orderBy(v.order === 'asc' ? asc(col) : desc(col), asc(tickets.id))
      .limit(page(v).limit)
      .offset(page(v).offset)
      .all();
    const total = this.db
      .select({ n: sql<number>`count(*)` })
      .from(tickets)
      .where(where)
      .get()!.n;
    return result(data, total, v);
  }
  createTicket(v: z.infer<typeof ticketCreate>, actor: string) {
    return this.db.transaction((tx) => {
      const customer = tx.select().from(customers).where(eq(customers.id, v.customerId)).get();
      if (!customer || customer.status !== 'activo')
        throw new ApiError(400, 'INVALID_CUSTOMER', 'El cliente no existe o está inactivo.');
      this.category(v.categoryId);
      this.assignee(v.assignedToUserId);
      const counter = tx
        .insert(counters)
        .values({ name: 'ticket', value: 1 })
        .onConflictDoUpdate({ target: counters.name, set: { value: sql`${counters.value} + 1` } })
        .returning()
        .get();
      const date = now();
      const row = tx
        .insert(tickets)
        .values({
          ...v,
          id: randomUUID(),
          ticketNumber: counter.value,
          createdByUserId: actor,
          status: v.assignedToUserId ? 'asignado' : 'abierto',
          createdAt: date,
          updatedAt: date,
        })
        .returning()
        .get();
      if (v.assignedToUserId) {
        tx.insert(events)
          .values({
            id: randomUUID(),
            ticketId: row.id,
            actorId: actor,
            type: 'asignacion',
            detail: JSON.stringify({ previousUserId: null, assignedToUserId: v.assignedToUserId }),
            createdAt: date,
          })
          .run();
        tx.insert(ticketAssignments)
          .values({
            id: randomUUID(),
            ticketId: row.id,
            assignedToUserId: v.assignedToUserId,
            previousUserId: null,
            actorId: actor,
            createdAt: date,
          })
          .run();
        tx.insert(notifications)
          .values({
            id: randomUUID(),
            recipientId: v.assignedToUserId,
            type: 'ticket_assigned',
            title: 'Ticket asignado',
            message: `Se te asignó el ticket #${row.ticketNumber}.`,
            ticketId: row.id,
            createdAt: date,
          })
          .run();
      }
      tx.insert(events)
        .values({
          id: randomUUID(),
          ticketId: row.id,
          actorId: actor,
          type: 'creado',
          detail: 'Ticket creado',
          createdAt: date,
        })
        .run();
      tx.insert(auditLogs)
        .values({
          id: randomUUID(),
          actorId: actor,
          action: 'ticket.created',
          resourceType: 'ticket',
          resourceId: row.id,
          createdAt: date,
        })
        .run();
      return row;
    });
  }
  updateTicket(idValue: string, v: z.infer<typeof ticketPatch>, actor: string) {
    return this.db.transaction((tx) => {
      const current = this.ticket(idValue);
      if (current.archivedAt) throw new ApiError(409, 'ARCHIVED', 'El ticket está archivado.');
      if (v.categoryId) this.category(v.categoryId);
      this.assignee(v.assignedToUserId);
      const { reopenReason, expectedUpdatedAt, ...changes } = v;
      if (current.updatedAt !== expectedUpdatedAt)
        throw new ApiError(409, 'STALE_TICKET', 'El ticket cambió; actualiza los datos.');
      if (reopenReason && v.status !== 'reabierto')
        throw new ApiError(400, 'VALIDATION_ERROR', 'El motivo solo se admite al reabrir.');
      const effectiveAssignee =
        v.assignedToUserId === undefined ? current.assignedToUserId : v.assignedToUserId;
      const effectiveStatus = v.status ?? current.status;
      if (
        !effectiveAssignee &&
        ['asignado', 'en_proceso', 'pendiente_cliente', 'resuelto'].includes(effectiveStatus)
      )
        throw new ApiError(409, 'ASSIGNEE_REQUIRED', 'Se requiere un técnico asignado.');
      if (current.status === 'abierto' && v.assignedToUserId && !v.status)
        throw new ApiError(
          409,
          'TRANSITION_REQUIRED',
          'La asignación inicial debe cambiar el estado a asignado.',
        );
      if (
        v.status &&
        ['asignado', 'en_proceso', 'pendiente_cliente', 'resuelto'].includes(v.status)
      )
        this.assignee(effectiveAssignee);
      if (v.status)
        validateTransition(
          current,
          v.status,
          v.assignedToUserId === undefined ? current.assignedToUserId : v.assignedToUserId,
          v.resolution,
          reopenReason,
        );
      const date = new Date(Math.max(Date.now(), Date.parse(current.updatedAt) + 1)).toISOString();
      const row = tx
        .update(tickets)
        .set({
          ...changes,
          updatedAt: date,
          ...(v.status
            ? {
                resolvedAt:
                  v.status === 'resuelto'
                    ? date
                    : v.status === 'cerrado'
                      ? current.resolvedAt
                      : null,
                closedAt: v.status === 'cerrado' ? date : null,
              }
            : {}),
        })
        .where(and(eq(tickets.id, idValue), eq(tickets.updatedAt, expectedUpdatedAt)))
        .returning()
        .get();
      if (!row) throw new ApiError(409, 'STALE_TICKET', 'El ticket cambió; actualiza los datos.');
      tx.insert(events)
        .values({
          id: randomUUID(),
          ticketId: idValue,
          actorId: actor,
          type: v.status ? 'estado_cambiado' : 'actualizado',
          detail: v.status
            ? JSON.stringify({
                from: current.status,
                to: v.status,
                ...(reopenReason ? { reason: reopenReason } : {}),
              })
            : JSON.stringify(Object.keys(changes)),
          createdAt: date,
        })
        .run();
      if (v.priority && v.priority !== current.priority)
        tx.insert(events)
          .values({
            id: randomUUID(),
            ticketId: idValue,
            actorId: actor,
            type: 'prioridad_cambiada',
            detail: JSON.stringify({ from: current.priority, to: v.priority }),
            createdAt: date,
          })
          .run();
      if (v.status)
        notifyTicket(
          tx,
          row,
          actor,
          'ticket_status',
          'Estado actualizado',
          `El ticket #${row.ticketNumber} cambió a ${v.status.replaceAll('_', ' ')}.`,
          date,
        );
      tx.insert(auditLogs)
        .values({
          id: randomUUID(),
          actorId: actor,
          action: 'ticket.updated',
          resourceType: 'ticket',
          resourceId: row.id,
          createdAt: date,
        })
        .run();
      return row;
    });
  }
  archiveTicket(idValue: string, actor: string) {
    return this.db.transaction((tx) => {
      const current = this.ticket(idValue);
      if (current.status !== 'cerrado')
        throw new ApiError(409, 'NOT_CLOSED', 'Solo se pueden archivar tickets cerrados.');
      if (current.archivedAt) throw new ApiError(409, 'ARCHIVED', 'El ticket ya está archivado.');
      const date = new Date(Math.max(Date.now(), Date.parse(current.updatedAt) + 1)).toISOString();
      const row = tx
        .update(tickets)
        .set({ archivedAt: date, updatedAt: date })
        .where(eq(tickets.id, idValue))
        .returning()
        .get();
      tx.insert(events)
        .values({
          id: randomUUID(),
          ticketId: idValue,
          actorId: actor,
          type: 'archivado',
          detail: 'Ticket archivado',
          createdAt: date,
        })
        .run();
      tx.insert(auditLogs)
        .values({
          id: randomUUID(),
          actorId: actor,
          action: 'ticket.archived',
          resourceType: 'ticket',
          resourceId: row.id,
          createdAt: date,
        })
        .run();
      return row;
    });
  }
  addComment(idValue: string, v: z.infer<typeof commentCreate>, actor: string) {
    return this.db.transaction((tx) => {
      const t = this.ticket(idValue);
      if (v.requestId) {
        const previous = tx
          .select()
          .from(comments)
          .where(eq(comments.requestId, v.requestId))
          .get();
        if (previous) {
          if (
            previous.ticketId !== idValue ||
            previous.authorId !== actor ||
            previous.body !== v.body ||
            previous.visibility !== v.visibility
          )
            throw new ApiError(
              409,
              'IDEMPOTENCY_CONFLICT',
              'La clave corresponde a otro comentario.',
            );
          return previous;
        }
      }
      if (t.archivedAt) throw new ApiError(409, 'ARCHIVED', 'El ticket está archivado.');
      const date = now();
      const row = tx
        .insert(comments)
        .values({ ...v, id: randomUUID(), ticketId: idValue, authorId: actor, createdAt: date })
        .returning()
        .get();
      tx.insert(events)
        .values({
          id: randomUUID(),
          ticketId: idValue,
          actorId: actor,
          type: v.visibility === 'interno' ? 'comentario_interno' : 'comentario_publico',
          detail: JSON.stringify({ commentId: row.id }),
          createdAt: date,
        })
        .run();
      if (v.visibility === 'cliente')
        notifyTicket(
          tx,
          t,
          actor,
          'ticket_comment',
          'Nuevo comentario',
          `Hay un nuevo comentario en el ticket #${t.ticketNumber}.`,
          date,
        );
      tx.insert(auditLogs)
        .values({
          id: randomUUID(),
          actorId: actor,
          action: 'comment.created',
          resourceType: 'comment',
          resourceId: row.id,
          createdAt: date,
        })
        .run();
      return row;
    });
  }
  history(idValue: string) {
    this.ticket(idValue);
    return {
      comments: this.db
        .select({ ...getTableColumns(comments), authorName: users.fullName })
        .from(comments)
        .innerJoin(users, eq(users.id, comments.authorId))
        .where(eq(comments.ticketId, idValue))
        .orderBy(asc(comments.createdAt))
        .all(),
      events: this.db
        .select({ ...getTableColumns(events), actorName: users.fullName })
        .from(events)
        .innerJoin(users, eq(users.id, events.actorId))
        .where(eq(events.ticketId, idValue))
        .orderBy(asc(events.createdAt))
        .all(),
    };
  }
}
