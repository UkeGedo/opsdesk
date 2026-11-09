import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { CreateTicket } from '../tickets/create-ticket';
import { useSession } from '../../app/security';
import { ErrorBox, labels, TicketTable, useTickets } from './shared';
export function Tickets() {
  const { request, session } = useSession();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1),
    [status, setStatus] = useState(''),
    [assignedTo, setAssignedTo] = useState('');
  const manager = ['administrador', 'supervisor'].includes(session?.user.role ?? '');
  const technicians = useQuery({
    queryKey: ['technicians'],
    queryFn: async () =>
      (await request('/technicians')) as { data: { id: string; fullName: string }[] },
    enabled: manager,
  });
  const query = useTickets(search, page, status, assignedTo);
  return (
    <>
      <div className="work-heading">
        <div>
          <div className="work-overline">SOPORTE / SOLICITUDES</div>
          <h1>Tickets</h1>
          <p>Consulta y da seguimiento a las solicitudes disponibles.</p>
        </div>
      </div>
      <section className="work-section">
        <div className="section-bar">
          <div>
            <h2>Solicitudes</h2>
            <p>{query.data ? `${query.data.meta.total} resultados` : 'Seguimiento de tickets'}</p>
          </div>
          <label className="work-search">
            <Search size={17} />
            <span className="sr-only">Buscar tickets</span>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar número o asunto"
            />
          </label>
        </div>
        <label>
          Estado
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {[
              'abierto',
              'asignado',
              'en_proceso',
              'pendiente_cliente',
              'resuelto',
              'cerrado',
              'reabierto',
            ].map((v) => (
              <option key={v} value={v}>
                {labels[v]}
              </option>
            ))}
          </select>
        </label>
        {manager && (
          <label>
            Responsable
            <select
              value={assignedTo}
              onChange={(e) => {
                setAssignedTo(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              <option value="unassigned">Sin asignar</option>
              {technicians.data?.data.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName}
                </option>
              ))}
            </select>
          </label>
        )}
        {query.isPending ? (
          <div className="work-empty" role="status">
            Cargando tickets…
          </div>
        ) : query.error ? (
          <ErrorBox error={query.error} />
        ) : query.data?.data.length ? (
          <TicketTable items={query.data.data} />
        ) : (
          <div className="work-empty">
            <strong>No hay resultados.</strong>
            <p>Prueba con otra búsqueda o vuelve más tarde.</p>
          </div>
        )}
        {query.data && (
          <div aria-label="Paginación de tickets">
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Anterior
            </button>
            <span>
              {' '}
              Página {page} · {query.data.meta.total} resultados{' '}
            </span>
            <button
              type="button"
              disabled={page * query.data.meta.limit >= query.data.meta.total}
              onClick={() => setPage(page + 1)}
            >
              Siguiente
            </button>
          </div>
        )}
      </section>
      <CreateTicket />
    </>
  );
}
