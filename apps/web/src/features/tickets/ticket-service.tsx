import { useQuery } from '@tanstack/react-query';
import { useSession } from '../../app/security';
type Data = {
  serviceName: string;
  requestType: string;
  form: { version: number; fields: { key: string; label: string }[] };
  values: Record<string, string | boolean>;
};
const labels: Record<string, string> = {
  incidente: 'Incidente',
  solicitud: 'Solicitud de servicio',
  consulta: 'Consulta',
  operativo: 'Requerimiento operativo',
};
export function TicketService({ ticketId }: { ticketId: string }) {
  const { request } = useSession();
  const query = useQuery({
    queryKey: ['ticket-service', ticketId],
    queryFn: async () =>
      (await request(`/tickets/${encodeURIComponent(ticketId)}/service`)) as { data: Data | null },
  });
  if (query.isPending) return <p>Cargando servicio…</p>;
  if (query.isError) return <p role="alert">No se pudieron cargar los datos del servicio.</p>;
  if (!query.data?.data) return null;
  const data = query.data.data;
  return (
    <section aria-label="Datos del servicio">
      <h2>Servicio</h2>
      <p>
        {data.serviceName} · {labels[data.requestType] ?? data.requestType} · formulario versión{' '}
        {data.form.version}
      </p>
      <dl>
        {data.form.fields.map((field) => (
          <div key={field.key}>
            <dt>{field.label}</dt>
            <dd>
              {typeof data.values[field.key] === 'boolean'
                ? data.values[field.key]
                  ? 'Sí'
                  : 'No'
                : data.values[field.key] || '—'}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
