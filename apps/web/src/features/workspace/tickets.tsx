import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CreateTicket } from '../tickets/create-ticket';
import { useSession } from '../../app/security';
import { ErrorBox, labels, LoadingRows, TicketTable, useTickets } from './shared';
export function Tickets() {
  const { request, session } = useSession();
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === '#nueva-solicitud') document.getElementById('nueva-solicitud')?.scrollIntoView();
  }, [hash]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1),
    [status, setStatus] = useState(''),
    [assignedTo, setAssignedTo] = useState('');
  const [sort, setSort] = useState('createdAt');
  const [order, setOrder] = useState('desc');
  const [compact, setCompact] = useState(false);
  const [columns, setColumns] = useState({ status: true, priority: true, updated: true });
  const manager = ['administrador', 'supervisor'].includes(session?.user.role ?? '');
  const technicians = useQuery({
    queryKey: ['technicians'],
    queryFn: async () =>
      (await request('/technicians')) as { data: { id: string; fullName: string }[] },
    enabled: manager,
  });
  const query = useTickets(search, page, status, assignedTo, sort, order);
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
        <div className="table-controls">
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
          <label>
            Ordenar por
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
            >
              <option value="createdAt">Fecha de creación</option>
              <option value="ticketNumber">Número de ticket</option>
              <option value="title">Asunto</option>
              <option value="priority">Prioridad</option>
            </select>
          </label>
          <label>
            Orden
            <select
              value={order}
              onChange={(e) => {
                setOrder(e.target.value);
                setPage(1);
              }}
            >
              <option value="desc">Descendente</option>
              <option value="asc">Ascendente</option>
            </select>
          </label>
          <button
            type="button"
            className="density-toggle"
            aria-pressed={compact}
            onClick={() => setCompact(!compact)}
          >
            {compact ? 'Vista cómoda' : 'Vista compacta'}
          </button>
          <details className="column-picker">
            <summary>Columnas</summary>
            <div>
              {(
                [
                  ['status', 'Estado'],
                  ['priority', 'Prioridad'],
                  ['updated', 'Actualizado'],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={columns[key]}
                    onChange={(e) => setColumns({ ...columns, [key]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </details>
        </div>
        {query.isPending ? (
          <LoadingRows label="Cargando tickets…" />
        ) : query.error ? (
          <ErrorBox error={query.error} />
        ) : query.data?.data.length ? (
          <TicketTable items={query.data.data} compact={compact} selectable columns={columns} />
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
