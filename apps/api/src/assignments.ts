import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from './db.js';
import { auditLogs, events, notifications, ticketAssignments, tickets, users } from './schema.js';
import { ApiError, id, notFound } from './common.js';
export const assignmentInput = z
  .object({
    technicianId: id,
    expectedUpdatedAt: z.iso.datetime(),
    reason: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();
export function assignTicket(
  db: Db,
  ticketId: string,
  actorId: string,
  input: z.infer<typeof assignmentInput>,
) {
  return db.transaction((tx) => {
    const actor = tx.select().from(users).where(eq(users.id, actorId)).get();
    if (
      !actor ||
      actor.status !== 'activo' ||
      !['administrador', 'supervisor'].includes(actor.role)
    )
      throw new ApiError(403, 'FORBIDDEN', 'No tiene permisos para asignar.');
    const current = tx.select().from(tickets).where(eq(tickets.id, ticketId)).get();
    if (!current) throw notFound();
    if (current.updatedAt !== input.expectedUpdatedAt)
      throw new ApiError(
        409,
        'STALE_TICKET',
        'El ticket cambió. Actualiza la página antes de continuar.',
      );
    if (current.archivedAt || ['cerrado', 'resuelto'].includes(current.status))
      throw new ApiError(
        409,
        'INVALID_STATE',
        'No se puede asignar un ticket cerrado, resuelto o archivado.',
      );
    const technician = tx.select().from(users).where(eq(users.id, input.technicianId)).get();
    if (!technician || technician.role !== 'tecnico' || technician.status !== 'activo')
      throw new ApiError(400, 'INVALID_ASSIGNEE', 'El técnico no existe o no está activo.');
    if (current.assignedToUserId === technician.id)
      throw new ApiError(409, 'ALREADY_ASSIGNED', 'El técnico ya está asignado.');
    if (current.assignedToUserId && !input.reason)
      throw new ApiError(400, 'REASSIGN_REASON_REQUIRED', 'Indique el motivo de la reasignación.');
    const date = new Date(Math.max(Date.now(), Date.parse(current.updatedAt) + 1)).toISOString();
    const state =
      current.status === 'abierto' || current.status === 'reabierto' ? 'asignado' : current.status;
    const row = tx
      .update(tickets)
      .set({ assignedToUserId: technician.id, status: state, updatedAt: date })
      .where(and(eq(tickets.id, ticketId), eq(tickets.updatedAt, input.expectedUpdatedAt)))
      .returning()
      .get();
    if (!row)
      throw new ApiError(
        409,
        'STALE_TICKET',
        'El ticket cambió. Actualiza la página antes de continuar.',
      );
    tx.insert(ticketAssignments)
      .values({
        id: randomUUID(),
        ticketId,
        assignedToUserId: technician.id,
        previousUserId: current.assignedToUserId,
        actorId,
        reason: input.reason ?? null,
        createdAt: date,
      })
      .run();
    tx.insert(events)
      .values({
        id: randomUUID(),
        ticketId,
        actorId,
        type: 'asignacion',
        detail: JSON.stringify({
          previousUserId: current.assignedToUserId,
          assignedToUserId: technician.id,
          ...(input.reason ? { reason: input.reason } : {}),
        }),
        createdAt: date,
      })
      .run();
    tx.insert(notifications)
      .values({
        id: randomUUID(),
        recipientId: technician.id,
        type: 'ticket_assigned',
        title: 'Ticket asignado',
        message: `Se te asignó el ticket #${current.ticketNumber}.`,
        ticketId,
        createdAt: date,
      })
      .run();
    tx.insert(auditLogs)
      .values({
        id: randomUUID(),
        actorId,
        action: current.assignedToUserId ? 'ticket.reassigned' : 'ticket.assigned',
        resourceType: 'ticket',
        resourceId: ticketId,
        createdAt: date,
      })
      .run();
    return row;
  });
}
