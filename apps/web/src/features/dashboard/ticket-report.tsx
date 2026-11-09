import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useSession } from '../../app/security';
type Report = {
  total: number;
  resolved: number;
  lowStock: number | null;
  reopened: number;
  workload: { name: string; count: number }[];
  unassigned: number;
  averageResolutionHours: number | null;
  status: { status: string; count: number }[];
  priority: { priority: string; count: number }[];
  byCategory: { name: string; count: number }[];
  byDay: { day: string; count: number }[];
};
export function TicketReport() {
  const { request, session } = useSession();
  const [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [error, setError] = useState('');
  const filters = {
    ...(from ? { from: new Date(`${from}T00:00:00.000Z`).toISOString() } : {}),
    ...(to ? { to: new Date(Date.parse(`${to}T00:00:00.000Z`) + 86400000).toISOString() } : {}),
  };
  const query = useQuery({
    queryKey: ['reports', 'detail', from, to],
    queryFn: async () =>
      (await request(`/reports/summary?${new URLSearchParams(filters).toString()}`)) as {
        data: Report;
      },
    enabled: !from || !to || from <= to,
  });
  async function download() {
    setError('');
    try {
      const response = await fetch('/api/v1/reports/tickets.csv', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session!.csrf },
        body: JSON.stringify(filters),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? 'No se pudo exportar.');
      }
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tickets.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo exportar.');
    }
  }
  return (
    <section className="work-section">
      <h2>Indicadores de tickets</h2>
      <p>Período según fecha de creación, en UTC; el final se incluye.</p>
      <label>
        Desde
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      </label>
      <label>
        Hasta
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </label>
      {from && to && from > to ? (
        <p role="alert">La fecha inicial debe ser anterior o igual a la final.</p>
      ) : query.isPending ? (
        <p role="status">Cargando indicadores…</p>
      ) : query.isError ? (
        <p role="alert">No se pudieron cargar los indicadores.</p>
      ) : (
        query.data && (
          <>
            <p>
              {query.data.data.total} tickets · {query.data.data.unassigned} sin asignar ·{' '}
              {query.data.data.averageResolutionHours === null
                ? 'Sin tiempo de resolución calculable'
                : `${query.data.data.averageResolutionHours.toFixed(1)} horas de resolución promedio`}
            </p>
            <p>
              {query.data.data.resolved} tickets resueltos en el período ·{' '}
              {query.data.data.reopened} reaperturas en el período.
            </p>
            {query.data.data.workload.length > 0 && (
              <>
                <h3>Carga por técnico</h3>
                <p>Tickets no resueltos ni cerrados creados en el período.</p>
                <ul>
                  {query.data.data.workload.map((x, i) => (
                    <li key={`${x.name}-${i}`}>
                      {x.name}: {x.count}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {query.data.data.lowStock !== null && (
              <p>{query.data.data.lowStock} productos por debajo del mínimo total de inventario.</p>
            )}
            <h3>Creación por día</h3>
            {query.data.data.byDay.length > 0 ? (
              <>
                <div aria-hidden="true" style={{ width: '100%', height: 240 }}>
                  <ResponsiveContainer>
                    <BarChart data={query.data.data.byDay} accessibilityLayer={false}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="day" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" name="Tickets" fill="#4d6bea" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <ul>
                  {query.data.data.byDay.map((x) => (
                    <li key={x.day}>
                      {x.day}: {x.count}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>Sin tickets en este período.</p>
            )}
            <h3>Estados</h3>
            <ul>
              {query.data.data.status.map((x) => (
                <li key={x.status}>
                  {x.status.replaceAll('_', ' ')}: {x.count}
                </li>
              ))}
            </ul>
            <h3>Prioridades</h3>
            <ul>
              {query.data.data.priority.map((x) => (
                <li key={x.priority}>
                  {x.priority}: {x.count}
                </li>
              ))}
            </ul>
            <h3>Categorías</h3>
            <ul>
              {query.data.data.byCategory.map((x) => (
                <li key={x.name}>
                  {x.name}: {x.count}
                </li>
              ))}
            </ul>
          </>
        )
      )}
      {session && ['administrador', 'supervisor'].includes(session.user.role) && (
        <button
          type="button"
          disabled={!!from && !!to && from > to}
          onClick={() => void download()}
        >
          Exportar período a CSV
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
