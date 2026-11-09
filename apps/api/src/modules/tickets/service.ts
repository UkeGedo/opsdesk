import { and, asc, desc, eq, getTableColumns, isNull, or, sql, type SQL } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { validateTransition } from './lifecycle.js';
import { ApiError, notFound, now } from '../../common.js';
import type { Db } from '../../db.js';
import {
  categoryCreate,
  commentCreate,
  listTickets,
  ticketCreate,
  ticketPatch,
} from '../../domain-schemas.js';
import {
  auditLogs,
  categories,
  comments,
  counters,
  customers,
  customerUsers,
  events,
  notifications,
  ticketAssignments,
  services,
  ticketServiceData,
  ticketPriorityData,
  tickets,
  users,
} from '../../schema.js';
import { UserService } from '../identity/service.js';
import { escaped, matching, page, result } from '../shared/query.js';
import { applyPolicy, recordFirstResponse, statusChanged } from '../service-desk/store.js';
import { priorityFromMatrix, validateForm } from '../service-desk/policies.js';
import { latestMatrix } from '../service-desk/priority.js';
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

export class TicketService {
  private readonly identity: UserService;
  constructor(private db: Db) {
    this.identity = new UserService(db);
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
    const u = this.identity.user(idValue);
    if (u.status !== 'activo' || u.role !== 'tecnico')
      throw new ApiError(400, 'INVALID_ASSIGNEE', 'El usuario asignado no está disponible.');
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
      const service = v.serviceId
        ? tx.select().from(services).where(eq(services.id, v.serviceId)).get()
        : null;
      if (v.serviceId && (!service || !service.active || service.categoryId !== v.categoryId))
        throw new ApiError(
          400,
          'INVALID_SERVICE',
          'El servicio no está disponible para la categoría indicada.',
        );
      if (service) {
        const validation = validateForm(JSON.parse(service.formSchema), v.customFields ?? {});
        if (!validation.valid)
          throw new ApiError(
            400,
            'INVALID_SERVICE_FIELDS',
            `Campos del servicio no válidos: ${Object.keys(validation.errors).join(', ')}.`,
          );
      }
      const counter = tx
        .insert(counters)
        .values({ name: 'ticket', value: 1 })
        .onConflictDoUpdate({ target: counters.name, set: { value: sql`${counters.value} + 1` } })
        .returning()
        .get();
      const date = now();
      const { serviceId, requestType, customFields, impact, urgency, ...ticketValues } = v;
      const matrix = impact && urgency ? latestMatrix(tx) : null;
      if (impact && urgency && !matrix)
        throw new ApiError(
          409,
          'MATRIX_NOT_CONFIGURED',
          'No hay una matriz de prioridad configurada.',
        );
      const computed =
        matrix && impact && urgency ? priorityFromMatrix(matrix.matrix, impact, urgency) : null;
      const row = tx
        .insert(tickets)
        .values({
          ...ticketValues,
          ...(computed ? { priority: computed.priority } : {}),
          id: randomUUID(),
          ticketNumber: counter.value,
          createdByUserId: actor,
          status: v.assignedToUserId ? 'asignado' : 'abierto',
          createdAt: date,
          updatedAt: date,
        })
        .returning()
        .get();
      if (service && requestType)
        tx.insert(ticketServiceData)
          .values({
            ticketId: row.id,
            serviceId: service.id,
            requestType,
            formSnapshot: service.formSchema,
            values: JSON.stringify(customFields ?? {}),
          })
          .run();
      if (matrix && computed && impact && urgency)
        tx.insert(ticketPriorityData)
          .values({
            ticketId: row.id,
            impact,
            urgency,
            calculatedPriority: computed.priority,
            explanation: computed.explanation,
            matrixVersion: matrix.version,
            matrixSnapshot: JSON.stringify(matrix.matrix),
          })
          .run();
      applyPolicy(tx, row.id, row.priority, date, serviceId ?? null);
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
      if (v.status) statusChanged(tx, idValue, current.status, v.status, date);
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
      const date = new Date(Math.max(Date.now(), Date.parse(t.updatedAt))).toISOString();
      const row = tx
        .insert(comments)
        .values({ ...v, id: randomUUID(), ticketId: idValue, authorId: actor, createdAt: date })
        .returning()
        .get();
      recordFirstResponse(tx, idValue, actor, v.visibility, date);
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
