import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { CreateTicket } from '../tickets/create-ticket';
import { SlaSettings } from '../tickets/sla-settings';
import { ServiceCatalog } from '../tickets/service-catalog';
import { PriorityMatrix } from '../tickets/priority-matrix';
import { SavedViews } from '../tickets/saved-views';
import { useSession } from '../../app/security';
import { ErrorBox, labels, LoadingRows, TicketTable, useTickets } from './shared';
import { TicketPreview } from './ticket-preview';
import { Surface } from './surface';
import { TicketSplit } from './ticket-split';
import { useViewState } from './workspace-memory';
export function Tickets() {
  const { request, session } = useSession();
  const { hash } = useLocation();
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (hash === '#nueva-solicitud') document.getElementById('nueva-solicitud')?.scrollIntoView();
  }, [hash]);
  const [search, setSearch] = useViewState(
    'tickets.search',
    () => params.get('q') ?? '',
    params.has('q'),
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [createDirty, setCreateDirty] = useState(false);
  const [splitMode, setSplitMode] = useState(() => {
    try {
      return localStorage.getItem('opsdesk-ticket-view') === 'split';
    } catch {
      return false;
    }
  });
  const [splitWidth, setSplitWidth] = useState(() => {
    try {
      const value = Number(localStorage.getItem('opsdesk-split-width'));
      return value >= 35 && value <= 65 ? value : 50;
    } catch {
      return 50;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('opsdesk-ticket-view', splitMode ? 'split' : 'drawer');
      localStorage.setItem('opsdesk-split-width', String(splitWidth));
    } catch {
      /* Preferencia opcional. */
    }
  }, [splitMode, splitWidth]);
  function closePreview() {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('ticket');
        return next;
      },
      { replace: true },
    );
  }
  const [page, setPage] = useViewState(
      'tickets.page',
      () => Math.max(1, Math.min(10000, Number(params.get('page')) || 1)),
      params.has('page'),
    ),
    [status, setStatus] = useViewState(
      'tickets.status',
      () => params.get('status') ?? '',
      params.has('status'),
    ),
    [assignedTo, setAssignedTo] = useViewState(
      'tickets.assignedTo',
      () => params.get('assignedTo') ?? '',
      params.has('assignedTo'),
    );
  const [priority, setPriority] = useViewState(
    'tickets.priority',
    () => params.get('priority') ?? '',
    params.has('priority'),
  );
  const [sort, setSort] = useViewState(
    'tickets.sort',
    () =>
      ['createdAt', 'ticketNumber', 'title', 'priority'].includes(params.get('sort') ?? '')
        ? params.get('sort')!
        : 'createdAt',
    params.has('sort'),
  );
  const [order, setOrder] = useViewState(
    'tickets.order',
    () => (params.get('order') === 'asc' ? 'asc' : 'desc'),
    params.has('order'),
  );
  const [compact, setCompact] = useState(() => {
    try {
      return localStorage.getItem('opsdesk-ticket-density') === 'compact';
    } catch {
      return false;
    }
  });
  const [columns, setColumns] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('opsdesk-ticket-columns') ?? '{}') as Record<
        string,
        unknown
      >;
      return {
        status: saved.status !== false,
        priority: saved.priority !== false,
        updated: saved.updated !== false,
      };
    } catch {
      return { status: true, priority: true, updated: true };
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('opsdesk-ticket-density', compact ? 'compact' : 'comfortable');
      localStorage.setItem('opsdesk-ticket-columns', JSON.stringify(columns));
    } catch {
      /* preferencias opcionales */
    }
  }, [compact, columns]);
  useEffect(() => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries({
      q: search,
      page: page > 1 ? String(page) : '',
      status,
      assignedTo,
      priority,
      sort: sort === 'createdAt' ? '' : sort,
      order: order === 'desc' ? '' : order,
    })) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [search, page, status, assignedTo, priority, sort, order, params, setParams]);
  const manager = ['administrador', 'supervisor'].includes(session?.user.role ?? '');
  const technicians = useQuery({
    queryKey: ['technicians'],
    queryFn: async () =>
      (await request('/technicians')) as { data: { id: string; fullName: string }[] },
    enabled: manager,
  });
  const query = useTickets(search, page, status, assignedTo, sort, order, priority);
  const queues = [
    { label: 'Todos', status: '', assignedTo: '', priority: '' },
    ...(manager
      ? [{ label: 'Sin asignar', status: '', assignedTo: 'unassigned', priority: '' }]
      : []),
    ...(session?.user.role === 'tecnico'
      ? [{ label: 'Mis tickets', status: '', assignedTo: session.user.id, priority: '' }]
      : []),
    { label: 'Urgentes', status: '', assignedTo: '', priority: 'urgente' },
    { label: 'Pendientes del cliente', status: 'pendiente_cliente', assignedTo: '', priority: '' },
    { label: 'Reabiertos', status: 'reabierto', assignedTo: '', priority: '' },
    { label: 'Resueltos', status: 'resuelto', assignedTo: '', priority: '' },
    { label: 'Cerrados', status: 'cerrado', assignedTo: '', priority: '' },
  ];
  return (
    <>
      <div className="work-heading">
        <div>
          <div className="work-overline">SOPORTE / SOLICITUDES</div>
          <h1>Tickets</h1>
          <p>Consulta y da seguimiento a las solicitudes disponibles.</p>
        </div>
        {['administrador', 'supervisor', 'cliente'].includes(session?.user.role ?? '') && (
          <button
            type="button"
            className="security-button"
            onClick={() => {
              if (
                createDirty &&
                !window.confirm(
                  'Hay una solicitud sin guardar. ¿Descartar sus cambios y abrir una nueva ventana?',
                )
              )
                return;
              setCreateDirty(false);
              setCreateOpen(true);
            }}
          >
            Nueva solicitud en ventana
          </button>
        )}
      </div>
      <div
        className={splitMode && params.get('ticket') ? 'tickets-split' : undefined}
        style={
          splitMode && params.get('ticket')
            ? { gridTemplateColumns: `minmax(0, ${splitWidth}fr) minmax(0, ${100 - splitWidth}fr)` }
            : undefined
        }
      >
        <section className="work-section">
          {manager && <ServiceCatalog />}
          {session?.user.role === 'administrador' && <PriorityMatrix />}
          {session?.user.role === 'administrador' && <SlaSettings />}
          <SavedViews
            filters={{ q: search, status, priority, assignedTo, sort, order }}
            onApply={(view) => {
              setSearch(view.q);
              setStatus(view.status);
              setPriority(view.priority);
              setAssignedTo(view.assignedTo);
              setSort(view.sort);
              setOrder(view.order);
              setPage(1);
            }}
          />
          <nav aria-label="Colas de tickets" className="ticket-queues">
            {queues.map((queue) => (
              <button
                key={queue.label}
                type="button"
                aria-pressed={
                  status === queue.status &&
                  assignedTo === queue.assignedTo &&
                  priority === queue.priority
                }
                onClick={() => {
                  setStatus(queue.status);
                  setAssignedTo(queue.assignedTo);
                  setPriority(queue.priority);
                  setSearch('');
                  setPage(1);
                }}
              >
                {queue.label}
              </button>
            ))}
          </nav>
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
            <button
              type="button"
              className="density-toggle"
              aria-pressed={splitMode}
              onClick={() => setSplitMode(!splitMode)}
            >
              {splitMode ? 'Usar panel emergente' : 'Usar vista dividida'}
            </button>
            {splitMode && (
              <label className="split-width">
                Ancho de la lista
                <input
                  type="range"
                  min="35"
                  max="65"
                  value={splitWidth}
                  onChange={(event) => setSplitWidth(Number(event.target.value))}
                />
              </label>
            )}
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
              Prioridad
              <select
                value={priority}
                onChange={(event) => {
                  setPriority(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todas</option>
                {['baja', 'media', 'alta', 'urgente'].map((value) => (
                  <option key={value} value={value}>
                    {labels[value]}
                  </option>
                ))}
              </select>
            </label>
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
            <TicketTable
              items={query.data.data}
              compact={compact}
              selectable
              columns={columns}
              onPreview={(ticket) =>
                setParams((current) => {
                  const next = new URLSearchParams(current);
                  next.set('ticket', ticket.id);
                  return next;
                })
              }
            />
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
        {splitMode && params.get('ticket') && (
          <TicketSplit id={params.get('ticket')!} onClose={closePreview} />
        )}
      </div>
      {createOpen ? (
        <Surface title="Nueva solicitud" dirty={createDirty} onClose={() => setCreateOpen(false)}>
          <CreateTicket onDirtyChange={setCreateDirty} />
        </Surface>
      ) : (
        <CreateTicket onDirtyChange={setCreateDirty} />
      )}
      {!splitMode && params.get('ticket') && (
        <TicketPreview
          key={params.get('ticket')}
          id={params.get('ticket')!}
          onClose={closePreview}
        />
      )}
    </>
  );
}
