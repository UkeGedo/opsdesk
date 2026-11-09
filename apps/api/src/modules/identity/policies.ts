import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from 'express';
import { customerUsers, tickets, users } from '../../schema.js';
import type { Db } from '../../db.js';
import { ApiError, notFound } from '../../common.js';
type Role = typeof users.$inferSelect.role;
type User = typeof users.$inferSelect;
type Permission =
  | 'users.manage'
  | 'customers.read'
  | 'customers.manage'
  | 'tickets.read'
  | 'tickets.create'
  | 'tickets.manage'
  | 'tickets.work'
  | 'tickets.comment'
  | 'audit.read'
  | 'assignments.read';
const grants: Record<Role, readonly Permission[]> = {
  administrador: [
    'users.manage',
    'customers.read',
    'customers.manage',
    'tickets.read',
    'tickets.create',
    'tickets.manage',
    'tickets.work',
    'tickets.comment',
    'audit.read',
    'assignments.read',
  ],
  supervisor: [
    'customers.read',
    'tickets.read',
    'tickets.create',
    'tickets.manage',
    'tickets.work',
    'tickets.comment',
    'assignments.read',
  ],
  tecnico: ['tickets.read', 'tickets.work', 'tickets.comment', 'assignments.read'],
  cliente: ['tickets.read', 'tickets.create', 'tickets.comment'],
};
export function allowed(user: User, permission: Permission) {
  return user.status === 'activo' && grants[user.role].includes(permission);
}
export function requirePermission(permission: Permission): RequestHandler {
  return (_req, res, next) => {
    if (!allowed(res.locals.user, permission))
      return next(new ApiError(403, 'FORBIDDEN', 'No tiene permisos para esta operación.'));
    next();
  };
}
export function customerForUser(db: Db, user: User) {
  return db.select().from(customerUsers).where(eq(customerUsers.userId, user.id)).get()?.customerId;
}
export function visibleTicket(db: Db, user: User, id: string) {
  const ticket = db.select().from(tickets).where(eq(tickets.id, id)).get();
  if (!ticket) throw notFound();
  if (user.role === 'administrador' || user.role === 'supervisor') return ticket;
  if (user.role === 'tecnico' && ticket.assignedToUserId === user.id) return ticket;
  if (user.role === 'cliente' && ticket.customerId === customerForUser(db, user)) return ticket;
  throw notFound();
}
export function ticketScope(db: Db, user: User) {
  if (user.role === 'tecnico') return eq(tickets.assignedToUserId, user.id);
  if (user.role === 'cliente') return eq(tickets.customerId, customerForUser(db, user) ?? '');
  return undefined;
}

export function customerProfile(db: Db, user: User) {
  return user.role === 'cliente' ? { customerId: customerForUser(db, user) ?? null } : {};
}
export function assertCustomerAccount(user: User) {
  if (user.role !== 'cliente')
    throw new ApiError(400, 'INVALID_ROLE', 'La cuenta debe tener rol de cliente.');
}
export function customerAccess(db: Db, user: User, customerId: string): 'full' | 'limited' {
  if (allowed(user, 'customers.read')) return 'full';
  if (
    user.role === 'tecnico' &&
    db
      .select({ id: tickets.id })
      .from(tickets)
      .where(and(eq(tickets.customerId, customerId), eq(tickets.assignedToUserId, user.id)))
      .get()
  )
    return 'limited';
  throw notFound();
}
export function assertCustomerTicketList(db: Db, user: User, customerId: string) {
  if (user.role === 'cliente' && customerForUser(db, user) !== customerId) throw notFound();
  if (user.role === 'tecnico') throw notFound();
}
export function assertTicketCreation(
  db: Db,
  user: User,
  input: { customerId: string; assignedToUserId?: string | null },
) {
  if (user.role !== 'cliente') return;
  const own = customerForUser(db, user);
  if (!own || own !== input.customerId) throw notFound();
  if (input.assignedToUserId)
    throw new ApiError(403, 'FORBIDDEN', 'No tiene permisos para asignar.');
}
export function assertTicketUpdate(
  user: User,
  current: typeof tickets.$inferSelect,
  input: { status?: string; resolution?: string; [key: string]: unknown },
) {
  if (user.role !== 'tecnico') return;
  if (
    Object.keys(input).some((k) => !['status', 'resolution', 'expectedUpdatedAt'].includes(k)) ||
    !input.status ||
    !['en_proceso', 'pendiente_cliente', 'resuelto'].includes(input.status)
  )
    throw new ApiError(403, 'FORBIDDEN', 'Cambio no permitido.');
  if (['cerrado', 'resuelto'].includes(current.status))
    throw new ApiError(409, 'INVALID_STATE', 'El estado no permite este cambio.');
  if (input.status === 'resuelto' && !input.resolution)
    throw new ApiError(400, 'VALIDATION_ERROR', 'Debe registrar la solución.');
}
export function assertComment(user: User, visibility: string) {
  if (user.role === 'cliente' && visibility !== 'cliente')
    throw new ApiError(403, 'FORBIDDEN', 'Comentario no permitido.');
}
export function ticketForUser(ticket: typeof tickets.$inferSelect, user: User) {
  if (user.role !== 'cliente') return ticket;
  const {
    id,
    ticketNumber,
    customerId,
    categoryId,
    title,
    description,
    priority,
    status,
    createdAt,
    updatedAt,
    resolution,
    resolvedAt,
    closedAt,
    archivedAt,
  } = ticket;
  return {
    id,
    ticketNumber,
    customerId,
    categoryId,
    title,
    description,
    priority,
    status,
    createdAt,
    updatedAt,
    resolution,
    resolvedAt,
    closedAt,
    archivedAt,
  };
}
export function historyForUser(
  user: User,
  data: {
    comments: Array<{
      id: string;
      body: string;
      visibility: string;
      createdAt: string;
      authorName: string;
    }>;
    events: Array<{
      id: string;
      type: string;
      createdAt: string;
      actorName: string;
      detail: string;
    }>;
  },
) {
  if (user.role !== 'cliente') return data;
  return {
    comments: data.comments
      .filter((c) => c.visibility === 'cliente')
      .map(({ id, body, visibility, createdAt, authorName }) => ({
        id,
        body,
        visibility,
        createdAt,
        authorName,
      })),
    events: data.events
      .filter((e) => e.type !== 'comentario_interno')
      .map(({ id, type, createdAt, actorName, detail }) => {
        if (type === 'estado_cambiado' || type === 'prioridad_cambiada') {
          try {
            const parsed = JSON.parse(detail) as { from?: unknown; to?: unknown };
            if (typeof parsed.from === 'string' && typeof parsed.to === 'string')
              return {
                id,
                type,
                createdAt,
                actorName,
                detail: JSON.stringify({ from: parsed.from, to: parsed.to }),
              };
          } catch {
            /* Los eventos anteriores pueden no contener JSON. */
          }
        }
        return { id, type, createdAt, actorName };
      }),
  };
}
