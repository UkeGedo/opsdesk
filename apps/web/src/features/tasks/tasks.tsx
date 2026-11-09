import { TaskEditor } from './task-editor';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../app/security';
import { Surface } from '../workspace/surface';
import { useDirtyNavigation } from '../workspace/navigation-guard';
import { Link } from 'react-router-dom';
import { RowActions } from '../workspace/row-actions';
import { useViewState } from '../workspace/workspace-memory';
type Task = {
  id: string;
  title: string;
  description: string;
  assigneeId: string;
  priority: string;
  status: string;
  dueAt: string | null;
  completedAt: string | null;
  ticketId: string | null;
  updatedAt: string;
};
type TaskEvent = { id: string; action: string; createdAt: string };
export function Tasks() {
  const { request, session } = useSession();
  const cache = useQueryClient();
  const manager = ['administrador', 'supervisor'].includes(session?.user.role ?? '');
  const [filter, setFilter] = useViewState('tasks.filter', '');
  const [page, setPage] = useViewState('tasks.page', 1);
  const [selected, setSelected] = useState('');
  const [editing, setEditing] = useState('');
  const [ownerFilter, setOwnerFilter] = useViewState('tasks.owner', '');
  const [techSearch, setTechSearch] = useViewState('tasks.technicianSearch', '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState('media');
  const [dueAt, setDueAt] = useState('');
  const [ticketId, setTicketId] = useState('');
  useDirtyNavigation(
    !!(title || description || assigneeId || dueAt || ticketId || priority !== 'media'),
  );
  const tasks = useQuery({
    queryKey: ['tasks', filter, ownerFilter, page],
    queryFn: async () =>
      (await request(
        `/tasks?${new URLSearchParams({ ...(filter === 'overdue' ? { overdue: 'true' } : filter ? { status: filter } : {}), ...(ownerFilter ? { assigneeId: ownerFilter } : {}), page: String(page), limit: '20' }).toString()}`,
      )) as { data: Task[]; meta: { page: number; limit: number; total: number } },
    enabled: session?.user.role !== 'cliente',
  });
  const technicians = useQuery({
    queryKey: ['technicians', techSearch],
    queryFn: async () =>
      (await request(`/technicians?q=${encodeURIComponent(techSearch)}`)) as {
        data: { id: string; fullName: string }[];
      },
    enabled: manager,
  });
  const history = useQuery({
    queryKey: ['task-history', selected],
    queryFn: async () =>
      (await request(`/tasks/${encodeURIComponent(selected)}/history`)) as { data: TaskEvent[] },
    enabled: !!selected,
  });
  const create = useMutation({
    mutationFn: () =>
      request('/tasks', 'POST', {
        title,
        description,
        assigneeId,
        priority,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        ticketId: ticketId || null,
      }),
    onSuccess: () => {
      setTitle('');
      setDescription('');
      setTicketId('');
      setAssigneeId('');
      setPriority('media');
      setDueAt('');
      void cache.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
  const update = useMutation({
    mutationFn: ({ task, status }: { task: Task; status: string }) =>
      request(`/tasks/${encodeURIComponent(task.id)}`, 'PATCH', {
        status,
        expectedUpdatedAt: task.updatedAt,
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['tasks'] });
      void cache.invalidateQueries({ queryKey: ['task-history'] });
    },
  });
  if (!session || session.user.role === 'cliente')
    return <div className="work-empty">No tiene acceso a las tareas.</div>;
  return (
    <>
      <div className="work-heading">
        <div>
          <div className="work-overline">OPERACIONES / SEGUIMIENTO</div>
          <h1>Tareas</h1>
          <p>Consulta y organiza el trabajo asignado.</p>
        </div>
      </div>
      <section className="work-section">
        <h2>Trabajo operativo</h2>
        <label>
          Mostrar{' '}
          <select
            value={filter}
            disabled={!!editing}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            <option value="pendiente">Pendientes</option>
            <option value="en_proceso">En proceso</option>
            <option value="completada">Completadas</option>
            <option value="overdue">Vencidas</option>
          </select>
        </label>
        {manager && (
          <label>
            Buscar técnico
            <input
              maxLength={120}
              value={techSearch}
              onChange={(e) => setTechSearch(e.target.value)}
            />
          </label>
        )}
        {manager && (
          <label>
            Responsable
            <select
              value={ownerFilter}
              disabled={!!editing}
              onChange={(e) => {
                setOwnerFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              {technicians.data?.data.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName}
                </option>
              ))}
            </select>
          </label>
        )}
        {tasks.isPending ? (
          <p role="status">Cargando tareas…</p>
        ) : tasks.isError ? (
          <p role="alert">No se pudieron cargar las tareas.</p>
        ) : !tasks.data?.data.length ? (
          <p className="muted">No hay tareas para mostrar.</p>
        ) : (
          tasks.data.data.map((t) => (
            <article className="comment" key={t.id}>
              <div>
                <strong>{t.title}</strong>
                <small>
                  {t.status.replaceAll('_', ' ')} · {t.priority}
                </small>
              </div>
              <p>{t.description}</p>
              <p>
                {t.dueAt
                  ? `Vence: ${new Date(t.dueAt).toLocaleString('es-CO')}`
                  : 'Sin fecha de vencimiento'}
              </p>
              {t.ticketId && <p>Ticket: {t.ticketId}</p>}
              <button type="button" onClick={() => setSelected(selected === t.id ? '' : t.id)}>
                Ver historial
              </button>
              <RowActions label={`Acciones de tarea ${t.title}`}>
                <button type="button" onClick={() => setSelected(t.id)}>
                  Abrir historial
                </button>
                {t.ticketId && <Link to={`/tickets/${t.ticketId}`}>Ver ticket asociado</Link>}
              </RowActions>
              {manager && t.status !== 'completada' && (
                <button type="button" disabled={!!editing} onClick={() => setEditing(t.id)}>
                  Editar tarea
                </button>
              )}
              {editing === t.id && (
                <TaskEditor
                  key={t.id}
                  task={t}
                  technicians={technicians.data?.data ?? []}
                  onClose={() => setEditing('')}
                />
              )}
              {t.status === 'pendiente' && (
                <button
                  type="button"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ task: t, status: 'en_proceso' })}
                >
                  Iniciar
                </button>
              )}
              {t.status !== 'completada' && (
                <button
                  type="button"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ task: t, status: 'completada' })}
                >
                  Completar
                </button>
              )}
            </article>
          ))
        )}
        {tasks.data && (
          <div aria-label="Paginación de tareas">
            <button
              type="button"
              disabled={page <= 1 || !!editing}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </button>
            <span>
              {' '}
              Página {page} · {tasks.data.meta.total} resultados{' '}
            </span>
            <button
              type="button"
              disabled={!!editing || page * tasks.data.meta.limit >= tasks.data.meta.total}
              onClick={() => setPage(page + 1)}
            >
              Siguiente
            </button>
          </div>
        )}
        {update.isError && (
          <p role="alert">
            {update.error instanceof Error
              ? update.error.message
              : 'No se pudo actualizar la tarea.'}
          </p>
        )}
      </section>
      {selected && (
        <Surface title="Historial de tarea" drawer onClose={() => setSelected('')}>
          <h3>{tasks.data?.data.find((task) => task.id === selected)?.title}</h3>
          {history.isPending ? (
            <p role="status">Cargando historial…</p>
          ) : history.isError ? (
            <p role="alert">No se pudo cargar el historial.</p>
          ) : history.data?.data.length ? (
            <ol>
              {history.data.data.map((event) => (
                <li key={event.id}>
                  {event.action} · {new Date(event.createdAt).toLocaleString('es-CO')}
                </li>
              ))}
            </ol>
          ) : (
            <p>No hay actividad registrada.</p>
          )}
        </Surface>
      )}
      {manager && (
        <section className="work-section">
          <h2>Nueva tarea</h2>
          <form
            className="comment-form"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <label>
              Título
              <input
                required
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              Descripción
              <textarea
                maxLength={5000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label>
              Responsable
              <select required value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                <option value="">Seleccionar técnico</option>
                {technicians.data?.data.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                  </option>
                ))}
              </select>
            </label>
            {technicians.isError && <p role="alert">No se pudieron cargar los técnicos.</p>}
            <label>
              Prioridad
              <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </label>
            <label>
              Vencimiento
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </label>
            <label>
              Identificador del ticket (opcional)
              <input value={ticketId} onChange={(e) => setTicketId(e.target.value)} />
            </label>
            {create.isError && (
              <p role="alert">
                {create.error instanceof Error
                  ? create.error.message
                  : 'No se pudo crear la tarea.'}
              </p>
            )}
            {create.isSuccess && <p role="status">Tarea creada.</p>}
            <button className="security-button" disabled={create.isPending}>
              Crear tarea
            </button>
          </form>
        </section>
      )}
    </>
  );
}
