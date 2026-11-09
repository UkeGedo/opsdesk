import { ApiError } from './common.js';
import type { tickets } from './schema.js';
type Ticket = typeof tickets.$inferSelect;
type Status = Ticket['status'];
const transitions: Record<Status, readonly Status[]> = {
  abierto: ['asignado', 'en_proceso'],
  asignado: ['en_proceso'],
  en_proceso: ['pendiente_cliente', 'resuelto'],
  pendiente_cliente: ['en_proceso', 'resuelto'],
  resuelto: ['cerrado', 'reabierto'],
  cerrado: ['reabierto'],
  reabierto: ['asignado', 'en_proceso'],
};
export function validateTransition(
  current: Ticket,
  next: Status,
  assignee: string | null,
  resolution: string | undefined,
  reason: string | undefined,
) {
  if (!transitions[current.status].includes(next))
    throw new ApiError(409, 'INVALID_TRANSITION', 'La transición de estado no está permitida.');
  if (['asignado', 'en_proceso', 'pendiente_cliente', 'resuelto'].includes(next) && !assignee)
    throw new ApiError(409, 'ASSIGNEE_REQUIRED', 'Se requiere un técnico asignado.');
  if (next === 'resuelto' && !resolution?.trim())
    throw new ApiError(400, 'RESOLUTION_REQUIRED', 'Debe registrar la solución.');
  if (next === 'cerrado' && !current.resolution)
    throw new ApiError(
      409,
      'RESOLUTION_REQUIRED',
      'No se puede cerrar sin una solución registrada.',
    );
  if (next === 'reabierto' && !reason?.trim())
    throw new ApiError(400, 'REOPEN_REASON_REQUIRED', 'Debe indicar el motivo de reapertura.');
}
