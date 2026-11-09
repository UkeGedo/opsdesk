import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useSession } from '../../app/security';
import { ErrorBox, labels, type Ticket } from './shared';

export function TicketSplit({ id, onClose }: { id: string; onClose: () => void }) {
  const { request } = useSession();
  const ticket = useQuery({
    queryKey: ['ticket', id],
    queryFn: async () => (await request(`/tickets/${encodeURIComponent(id)}`)) as { data: Ticket },
  });
  return (
    <aside className="work-section ticket-split-detail" aria-label="Detalle seleccionado">
      <div className="section-bar">
        <h2>Detalle seleccionado</h2>
        <button type="button" onClick={onClose} aria-label="Cerrar detalle seleccionado">
          ×
        </button>
      </div>
      {ticket.isPending ? (
        <p role="status">Cargando ticket…</p>
      ) : ticket.error ? (
        <ErrorBox error={ticket.error} />
      ) : (
        <>
          <p className="work-overline">
            TICKET #{String(ticket.data.data.ticketNumber).padStart(4, '0')}
          </p>
          <h3>{ticket.data.data.title}</h3>
          <p>{ticket.data.data.description}</p>
          <p>
            Estado: <strong>{labels[ticket.data.data.status] ?? ticket.data.data.status}</strong>
          </p>
          <p>
            Prioridad:{' '}
            <strong>{labels[ticket.data.data.priority] ?? ticket.data.data.priority}</strong>
          </p>
          <Link className="surface-link" to={`/tickets/${id}`}>
            Abrir detalle completo →
          </Link>
        </>
      )}
    </aside>
  );
}
