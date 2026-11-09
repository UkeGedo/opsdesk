import { useQuery } from '@tanstack/react-query';
import type { Paginated, CustomerRecord, TicketStatus } from '@opsdesk/shared/contracts';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSession } from '../../app/security';
export type Ticket = {
  id: string;
  ticketNumber: number;
  title: string;
  description: string;
  status: TicketStatus;
  priority: string;
  customerId: string;
  updatedAt: string;
  assignedToUserId?: string | null;
  archivedAt?: string | null;
  resolution?: string | null;
};
export type Customer = CustomerRecord;
export type List<T> = Paginated<T>;
export const labels: Record<string, string> = {
  abierto: 'Abierto',
  asignado: 'Asignado',
  en_proceso: 'En proceso',
  pendiente_cliente: 'Pendiente del cliente',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
  reabierto: 'Reabierto',
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
  urgente: 'Urgente',
};
export function date(value: string) {
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}
export function activityDetail(
  event: { type: string; detail?: string },
  technicians: { id: string; fullName: string }[],
) {
  if (!event.detail) return '';
  try {
    const value = JSON.parse(event.detail) as {
      from?: string;
      to?: string;
      reason?: string;
      assignedToUserId?: string;
      quantity?: number;
    };
    if (value.from && value.to)
      return `${labels[value.from] ?? value.from} → ${labels[value.to] ?? value.to}${value.reason ? ` · ${value.reason}` : ''}`;
    if (event.type === 'asignacion' && value.assignedToUserId)
      return `Responsable: ${technicians.find((t) => t.id === value.assignedToUserId)?.fullName ?? 'técnico asignado'}${value.reason ? ` · ${value.reason}` : ''}`;
    if (event.type === 'material_consumido' && value.quantity) return `Cantidad: ${value.quantity}`;
  } catch {
    /* Los eventos antiguos pueden contener texto libre. */
  }
  return '';
}
export function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="work-empty" role="alert">
      <strong>No pudimos cargar la información.</strong>
      <p>{error instanceof Error ? error.message : 'Inténtalo nuevamente.'}</p>
    </div>
  );
}
export function useTickets(query = '', page = 1, status = '', assignedTo = '') {
  const { request } = useSession();
  return useQuery({
    queryKey: ['tickets', query, page, status, assignedTo],
    queryFn: async () =>
      (await request(
        `/tickets?limit=20&sort=createdAt&order=desc&page=${page}${query ? '&q=' + encodeURIComponent(query) : ''}${status ? '&status=' + encodeURIComponent(status) : ''}${assignedTo ? '&assignedTo=' + encodeURIComponent(assignedTo) : ''}`,
      )) as List<Ticket>,
  });
}
export function TicketTable({ items }: { items: Ticket[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Asunto</th>
            <th>Estado</th>
            <th>Prioridad</th>
            <th>Actualizado</th>
            <th>
              <span className="sr-only">Detalle</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr key={t.id}>
              <td className="ticket-id">#{String(t.ticketNumber).padStart(4, '0')}</td>
              <td>
                <Link className="table-title" to={`/tickets/${t.id}`}>
                  {t.title}
                </Link>
              </td>
              <td>
                <span className="work-badge">{labels[t.status] || t.status}</span>
              </td>
              <td>{labels[t.priority] || t.priority}</td>
              <td>{date(t.updatedAt)}</td>
              <td>
                <Link to={`/tickets/${t.id}`} aria-label={`Ver ticket ${t.ticketNumber}`}>
                  <ArrowRight size={17} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
