import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useSession } from './security';
export function RecentActivity() {
  const { request } = useSession();
  const query = useQuery({
    queryKey: ['reports', 'recent'],
    queryFn: async () =>
      (await request('/reports/recent')) as {
        data: {
          id: string;
          type: string;
          createdAt: string;
          actor: string;
          ticketId: string;
          ticketNumber: number;
        }[];
      },
  });
  return (
    <section className="work-section">
      <h2>Actividad reciente</h2>
      {query.isPending ? (
        <p role="status">Cargando actividad…</p>
      ) : query.isError ? (
        <p role="alert">No se pudo cargar la actividad.</p>
      ) : query.data?.data.length ? (
        <ol className="activity-list">
          {query.data.data.map((e) => (
            <li key={e.id}>
              <strong>
                {e.type.replaceAll('_', ' ')} · {e.actor}
              </strong>
              <span>
                <Link to={`/tickets/${e.ticketId}`}>Ticket #{e.ticketNumber}</Link> ·{' '}
                {new Date(e.createdAt).toLocaleString('es-CO')}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p>No hay actividad visible.</p>
      )}
    </section>
  );
}
