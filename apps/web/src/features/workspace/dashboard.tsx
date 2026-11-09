import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { RecentActivity } from '../dashboard/recent-activity';
import { useSession } from '../../app/security';
import { ErrorBox, TicketTable, useTickets } from './shared';
const TicketReport = lazy(() =>
  import('../dashboard/ticket-report').then((module) => ({ default: module.TicketReport })),
);
export function Dashboard() {
  const { session, request } = useSession();
  const query = useTickets();
  const summary = useQuery({
    queryKey: ['reports', 'summary'],
    queryFn: async () =>
      (await request('/reports/summary')) as {
        data: {
          total: number;
          unassigned: number;
          averageResolutionHours: number | null;
          status: { status: string; count: number }[];
        };
      },
  });
  const rows = query.data?.data ?? [];
  return (
    <>
      <div className="work-heading">
        <div>
          <div className="work-overline">RESUMEN OPERATIVO</div>
          <h1>Hola, {session?.user.fullName.split(' ')[0]}.</h1>
          <p>Este es el estado reciente de tu espacio de trabajo.</p>
        </div>
      </div>
      {query.isPending ? (
        <div className="work-empty" role="status">
          Cargando tickets…
        </div>
      ) : query.error ? (
        <ErrorBox error={query.error} />
      ) : (
        <>
          <div className="work-metrics">
            <article>
              <span>Tickets visibles</span>
              <strong>{summary.data?.data.total ?? '—'}</strong>
              <small>Según tus permisos</small>
            </article>
            <article>
              <span>Abiertos</span>
              <strong>
                {summary.data
                  ? (summary.data.data.status.find((x) => x.status === 'abierto')?.count ?? 0)
                  : '—'}
              </strong>
              <small>Total visible</small>
            </article>
            <article>
              <span>En proceso</span>
              <strong>
                {summary.data
                  ? (summary.data.data.status.find((x) => x.status === 'en_proceso')?.count ?? 0)
                  : '—'}
              </strong>
              <small>Total visible</small>
            </article>
          </div>
          {summary.isError && <p role="alert">No se pudieron cargar los indicadores.</p>}
          <Suspense fallback={<p role="status">Cargando indicadores…</p>}>
            <TicketReport />
          </Suspense>
          <RecentActivity />
          <section className="work-section">
            <div className="section-bar">
              <div>
                <h2>Tickets recientes</h2>
                <p>Consulta las solicitudes con actividad más reciente.</p>
              </div>
              <Link to="/tickets">
                Ver todos <ArrowRight size={16} />
              </Link>
            </div>
            {rows.length ? (
              <TicketTable items={rows} />
            ) : (
              <div className="work-empty">
                <strong>Aún no hay tickets para mostrar.</strong>
                <p>Las solicitudes disponibles aparecerán aquí.</p>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
