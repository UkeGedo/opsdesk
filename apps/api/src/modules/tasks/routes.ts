import { randomUUID } from 'node:crypto';
import type { DomainEventBus } from '../../domain-events.js';
import { Router } from 'express';
import { and, asc, desc, eq, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../db.js';
import { ApiError, id, notFound, now } from '../../common.js';
import {
  auditLogs,
  events,
  taskEvents,
  taskNotifications,
  tasks,
  tickets,
  users,
} from '../../schema.js';
import { visibleTicket } from '../identity/policies.js';
const priority = z.enum(['baja', 'media', 'alta', 'urgente']);
const status = z.enum(['pendiente', 'en_proceso', 'completada']);
export const taskInput = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000),
    assigneeId: id,
    priority,
    dueAt: z.iso.datetime().nullable(),
    ticketId: id.nullable(),
  })
  .strict();
export const taskPatchInput = taskInput
  .partial()
  .extend({ status: status.optional(), expectedUpdatedAt: z.iso.datetime() })
  .strict()
  .refine((v) => Object.keys(v).length > 1, 'Indique algún cambio.');
type User = typeof users.$inferSelect;
function validateAssignee(db: Db, assigneeId: string, ticketId: string | null) {
  const assignee = db.select().from(users).where(eq(users.id, assigneeId)).get();
  if (!assignee || assignee.role !== 'tecnico' || assignee.status !== 'activo')
    throw new ApiError(400, 'INVALID_ASSIGNEE', 'El responsable debe ser un técnico activo.');
  if (ticketId) {
    const ticket = db.select().from(tickets).where(eq(tickets.id, ticketId)).get();
    if (!ticket || ticket.archivedAt || ['cerrado', 'resuelto'].includes(ticket.status))
      throw new ApiError(400, 'INVALID_TICKET', 'El ticket no está disponible.');
    if (ticket.assignedToUserId !== assigneeId)
      throw new ApiError(400, 'INVALID_ASSIGNEE', 'El técnico debe estar asignado al ticket.');
  }
}
function visible(db: Db, user: User, taskId: string) {
  const row = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (!row) throw notFound();
  if (user.role === 'tecnico') {
    if (row.assigneeId !== user.id) throw notFound();
    if (row.ticketId) visibleTicket(db, user, row.ticketId);
  }
  return row;
}
export function taskRoutes(db: Db, domainEvents?: DomainEventBus) {
  const router = Router();
  router.use((_req, res, next) => {
    if (!['administrador', 'supervisor', 'tecnico'].includes(res.locals.user.role))
      return next(new ApiError(403, 'FORBIDDEN', 'No tiene acceso a tareas.'));
    next();
  });
  router.get('/', (req, res) => {
    const q = z
      .object({
        status: status.optional(),
        assigneeId: id.optional(),
        overdue: z.enum(['true', 'false']).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        page: z.coerce.number().int().min(1).max(100000).default(1),
      })
      .strict()
      .parse(req.query);
    const user = res.locals.user as User;
    const clauses = [
      q.status ? eq(tasks.status, q.status) : undefined,
      q.assigneeId ? eq(tasks.assigneeId, q.assigneeId) : undefined,
      q.overdue === 'true'
        ? and(lt(tasks.dueAt, now()), ne(tasks.status, 'completada'))
        : undefined,
      user.role === 'tecnico'
        ? and(
            eq(tasks.assigneeId, user.id),
            or(
              isNull(tasks.ticketId),
              inArray(
                tasks.ticketId,
                db
                  .select({ id: tickets.id })
                  .from(tickets)
                  .where(eq(tickets.assignedToUserId, user.id)),
              ),
            ),
          )
        : undefined,
    ];
    const where = and(...clauses);
    const total =
      db
        .select({ count: sql<number>`count(*)` })
        .from(tasks)
        .where(where)
        .get()?.count ?? 0;
    res.json({
      data: db
        .select()
        .from(tasks)
        .where(where)
        .orderBy(asc(tasks.createdAt), asc(tasks.id))
        .limit(q.limit)
        .offset((q.page - 1) * q.limit)
        .all(),
      meta: { limit: q.limit, page: q.page, total },
    });
  });
  router.get('/notifications', (_req, res) => {
    const user = res.locals.user as User;
    if (user.role === 'tecnico')
      db.transaction((tx) => {
        const soon = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const due = tx
          .select()
          .from(tasks)
          .where(
            and(
              eq(tasks.assigneeId, user.id),
              ne(tasks.status, 'completada'),
              lt(tasks.dueAt, soon),
            ),
          )
          .limit(100)
          .all();
        for (const task of due) {
          if (task.ticketId) {
            try {
              visibleTicket(db, user, task.ticketId);
            } catch {
              continue;
            }
          }
          const existing = tx
            .select()
            .from(taskNotifications)
            .where(
              and(
                eq(taskNotifications.taskId, task.id),
                eq(taskNotifications.recipientId, user.id),
                eq(taskNotifications.type, 'vencimiento'),
                eq(taskNotifications.dueAt, task.dueAt!),
              ),
            )
            .get();
          if (!existing)
            tx.insert(taskNotifications)
              .values({
                id: randomUUID(),
                taskId: task.id,
                recipientId: user.id,
                type: 'vencimiento',
                dueAt: task.dueAt,
                message: `La tarea ${task.title} está vencida o vence en las próximas 24 horas.`,
                createdAt: now(),
              })
              .run();
        }
      });
    const ownedTickets = db
      .select({ id: tickets.id })
      .from(tickets)
      .where(eq(tickets.assignedToUserId, user.id));
    const taskIds = db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.assigneeId, user.id),
          or(isNull(tasks.ticketId), inArray(tasks.ticketId, ownedTickets)),
        ),
      );
    res.json({
      data: db
        .select()
        .from(taskNotifications)
        .where(
          and(
            eq(taskNotifications.recipientId, user.id),
            inArray(taskNotifications.taskId, taskIds),
          ),
        )
        .orderBy(desc(taskNotifications.createdAt))
        .limit(100)
        .all(),
    });
  });
  router.post('/notifications/read', (req, res) => {
    const user = res.locals.user as User,
      v = z
        .object({ ids: z.array(id).min(1).max(100) })
        .strict()
        .parse(req.body);
    db.transaction((tx) => {
      for (const notificationId of new Set(v.ids)) {
        const row = tx
          .select()
          .from(taskNotifications)
          .where(
            and(
              eq(taskNotifications.id, notificationId),
              eq(taskNotifications.recipientId, user.id),
            ),
          )
          .get();
        if (!row) throw notFound();
        const task = visible(db, user, row.taskId);
        if (task.assigneeId !== user.id) throw notFound();
        tx.update(taskNotifications)
          .set({ readAt: now() })
          .where(and(eq(taskNotifications.id, row.id), isNull(taskNotifications.readAt)))
          .run();
      }
    });
    res.status(204).end();
  });
  router.get('/:id/history', (req, res) => {
    const taskId = id.parse(req.params.id);
    visible(db, res.locals.user, taskId);
    res.json({
      data: db
        .select()
        .from(taskEvents)
        .where(eq(taskEvents.taskId, taskId))
        .orderBy(asc(taskEvents.createdAt))
        .all(),
    });
  });
  router.post('/', (req, res) => {
    const user = res.locals.user as User;
    if (user.role === 'tecnico')
      throw new ApiError(403, 'FORBIDDEN', 'No tiene permisos para crear tareas.');
    const v = taskInput.parse(req.body);
    const row = db.transaction((tx) => {
      validateAssignee(db, v.assigneeId, v.ticketId);
      const date = now();
      const created = tx
        .insert(tasks)
        .values({
          id: randomUUID(),
          ...v,
          status: 'pendiente',
          createdBy: user.id,
          createdAt: date,
          updatedAt: date,
        })
        .returning()
        .get();
      if (created.assigneeId !== user.id)
        tx.insert(taskNotifications)
          .values({
            id: randomUUID(),
            taskId: created.id,
            recipientId: created.assigneeId,
            type: 'asignada',
            message: `Se te asignó la tarea ${created.title}.`,
            createdAt: date,
          })
          .run();
      tx.insert(taskEvents)
        .values({
          id: randomUUID(),
          taskId: created.id,
          actorId: user.id,
          action: 'creada',
          detail: JSON.stringify(v),
          createdAt: date,
        })
        .run();
      tx.insert(auditLogs)
        .values({
          id: randomUUID(),
          actorId: user.id,
          action: 'task.created',
          resourceType: 'task',
          resourceId: created.id,
          createdAt: date,
        })
        .run();
      if (v.ticketId)
        tx.insert(events)
          .values({
            id: randomUUID(),
            ticketId: v.ticketId,
            actorId: user.id,
            type: 'tarea_creada',
            detail: JSON.stringify({ taskId: created.id, title: v.title }),
            createdAt: date,
          })
          .run();
      return created;
    });
    res.status(201).json({ data: row });
  });
  router.patch('/:id', (req, res) => {
    const user = res.locals.user as User;
    const taskId = id.parse(req.params.id);
    const v = taskPatchInput.parse(req.body);
    const row = db.transaction((tx) => {
      const current = visible(db, user, taskId);
      if (current.updatedAt !== v.expectedUpdatedAt)
        throw new ApiError(409, 'STALE_TASK', 'La tarea cambió; actualiza los datos.');
      if (
        user.role === 'tecnico' &&
        Object.keys(v).some((k) => !['status', 'expectedUpdatedAt'].includes(k))
      )
        throw new ApiError(403, 'FORBIDDEN', 'Solo puede cambiar el estado.');
      if (current.status === 'completada')
        throw new ApiError(409, 'INVALID_STATE', 'La tarea ya está completada.');
      if (v.status && (v.status === current.status || v.status === 'pendiente'))
        throw new ApiError(409, 'INVALID_STATE', 'Transición no permitida.');
      validateAssignee(
        db,
        v.assigneeId ?? current.assigneeId,
        v.ticketId === undefined ? current.ticketId : v.ticketId,
      );
      const { expectedUpdatedAt, ...changes } = v;
      const date = new Date(Math.max(Date.now(), Date.parse(current.updatedAt) + 1)).toISOString();
      const updated = tx
        .update(tasks)
        .set({
          ...changes,
          ...(v.status === 'completada' ? { completedAt: date } : {}),
          updatedAt: date,
        })
        .where(and(eq(tasks.id, taskId), eq(tasks.updatedAt, expectedUpdatedAt)))
        .returning()
        .get();
      if (!updated) throw new ApiError(409, 'STALE_TASK', 'La tarea cambió; actualiza los datos.');
      if (updated.assigneeId !== current.assigneeId && updated.assigneeId !== user.id)
        tx.insert(taskNotifications)
          .values({
            id: randomUUID(),
            taskId,
            recipientId: updated.assigneeId,
            type: 'asignada',
            message: `Se te asignó la tarea ${updated.title}.`,
            createdAt: date,
          })
          .run();
      tx.insert(taskEvents)
        .values({
          id: randomUUID(),
          taskId,
          actorId: user.id,
          action: 'actualizada',
          detail: JSON.stringify({ before: current, changes }),
          createdAt: date,
        })
        .run();
      tx.insert(auditLogs)
        .values({
          id: randomUUID(),
          actorId: user.id,
          action: 'task.updated',
          resourceType: 'task',
          resourceId: taskId,
          createdAt: date,
        })
        .run();
      return updated;
    });
    if (v.status === 'completada')
      domainEvents?.publish({ type: 'task.completed', taskId, actorId: user.id });
    res.json({ data: row });
  });
  return router;
}
