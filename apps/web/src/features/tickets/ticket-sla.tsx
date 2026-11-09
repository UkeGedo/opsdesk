import { useQuery } from '@tanstack/react-query';
import { useSession } from '../../app/security';

type Metric = {
  status: 'running' | 'fulfilled' | 'breached';
  paused: boolean;
  remainingMs: number;
  deadline: string | null;
  reason?: string;
};
type Cycle = { id: string; policyVersion: number; firstResponse: Metric; resolution: Metric };
function metricStatus(metric: Metric) {
  if (metric.reason === 'resolved_without_response')
    return 'Incumplido: se resolvió sin respuesta pública';
  if (metric.status === 'fulfilled') return 'Cumplido';
  if (metric.status === 'breached') return 'Incumplido';
  if (metric.paused) return 'En pausa';
  return 'En curso';
}
function MetricView({ title, metric }: { title: string; metric: Metric }) {
  return (
    <div>
      <strong>{title}</strong>
      <p>{metricStatus(metric)}</p>
      {metric.status === 'running' && (
        <p>Tiempo laboral restante: {Math.ceil(metric.remainingMs / 60000)} min</p>
      )}
      {metric.status === 'running' && metric.deadline && (
        <p>
          Fecha objetivo:{' '}
          {new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(
            new Date(metric.deadline),
          )}
        </p>
      )}
    </div>
  );
}
export function TicketSla({ ticketId }: { ticketId: string }) {
  const { request } = useSession();
  const query = useQuery({
    queryKey: ['ticket-sla', ticketId],
    queryFn: async () =>
      (await request(`/tickets/${encodeURIComponent(ticketId)}/sla`)) as { data: Cycle[] },
    refetchInterval: 60000,
  });
  const latest = query.data?.data.at(-1);
  return (
    <section aria-label="Acuerdo de servicio">
      <h3>Acuerdo de servicio</h3>
      {query.isPending ? (
        <p>Cargando acuerdo…</p>
      ) : query.isError ? (
        <p role="alert">No se pudo cargar el acuerdo de servicio.</p>
      ) : !latest ? (
        <p>Este ticket no tiene una política SLA aplicada.</p>
      ) : (
        <>
          <p>Política aplicada · versión {latest.policyVersion}</p>
          <MetricView title="Primera respuesta" metric={latest.firstResponse} />
          <MetricView title="Resolución" metric={latest.resolution} />
        </>
      )}
    </section>
  );
}
