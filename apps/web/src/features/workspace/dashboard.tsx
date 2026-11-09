import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ClipboardList, Plus } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RecentActivity } from '../dashboard/recent-activity';
import { useSession } from '../../app/security';
import { ErrorBox, TicketTable, useTickets } from './shared';
const TicketReport = lazy(() =>
  import('../dashboard/ticket-report').then((module) => ({ default: module.TicketReport })),
);
export function Dashboard() {
  const { session, request } = useSession();
  const [activityFirst, setActivityFirst] = useState(() => {
    try {
      return localStorage.getItem('opsdesk-panel-order') === 'activity-first';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(
        'opsdesk-panel-order',
        activityFirst ? 'activity-first' : 'report-first',
      );
    } catch {
      /* Preferencia opcional */
    }
  }, [activityFirst]);
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
        <div className="dashboard-actions">
          <Link className="action-secondary" to="/tickets">
            <ClipboardList size={16} /> Ver solicitudes
          </Link>
          {session?.user.role !== 'tecnico' && (
            <Link className="action-primary" to="/tickets#nueva-solicitud">
              <Plus size={16} /> Nueva solicitud
            </Link>
          )}
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
          <div className="dashboard-overview">
            {(activityFirst ? ['activity', 'report'] : ['report', 'activity']).map(
              (item, index) => (
                <div
                  className="dashboard-widget"
                  key={item}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const dragged = event.dataTransfer.getData('text/plain');
                    if ((dragged === 'activity' || dragged === 'report') && dragged !== item)
                      setActivityFirst(dragged === 'activity');
                  }}
                >
                  <div className="widget-controls">
                    <span
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', item);
                      }}
                      aria-hidden="true"
                      title="Arrastrar para reorganizar"
                    >
                      ⠿
                    </span>
                    <button type="button" onClick={() => setActivityFirst((value) => !value)}>
                      Mover {item === 'activity' ? 'actividad' : 'indicadores'}{' '}
                      {index === 0 ? 'después' : 'antes'}
                    </button>
                  </div>
                  {item === 'report' ? (
                    <Suspense fallback={<p role="status">Cargando indicadores…</p>}>
                      <TicketReport />
                    </Suspense>
                  ) : (
                    <RecentActivity />
                  )}
                </div>
              ),
            )}
          </div>
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
