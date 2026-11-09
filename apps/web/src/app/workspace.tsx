import { EditCustomer } from './edit-customer';
import { TicketMaterials } from './ticket-materials';
import { RecentActivity } from './recent-activity';
import { SetupCustomers } from './setup-customers';
import { CreateTicket } from './create-ticket';
import { TicketStatus } from './ticket-status';
import { LiveUpdates } from './live-updates';
import { Attachments } from './attachments';
import { lazy, Suspense, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, NavLink, Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import {
  BarChart3,
  ClipboardList,
  UsersRound,
  LogOut,
  UserRound,
  Menu,
  ArrowRight,
  Search,
  Bell,
  Package,
  ListChecks,
} from 'lucide-react';
import { useSession } from './security';
const TicketReport = lazy(() =>
  import('./ticket-report').then((module) => ({ default: module.TicketReport })),
);
type Ticket = {
  id: string;
  ticketNumber: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  customerId: string;
  updatedAt: string;
  assignedToUserId?: string | null;
  archivedAt?: string | null;
  resolution?: string | null;
};
type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  updatedAt: string;
};
type List<T> = { data: T[]; meta: { total: number; page: number; limit: number } };
const labels: Record<string, string> = {
  abierto: 'Abierto',
  asignado: 'Asignado',
  en_proceso: 'En proceso',
  pendiente_cliente: 'Pendiente del cliente',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
  reabierto: 'Reabierto',
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
  urgente: 'Urgente',
};
function date(value: string) {
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}
function activityDetail(
  event: { type: string; detail?: string },
  technicians: { id: string; fullName: string }[],
) {
  if (!event.detail) return '';
  try {
    const value = JSON.parse(event.detail) as {
      from?: string;
      to?: string;
      reason?: string;
      assignedToUserId?: string;
      quantity?: number;
    };
    if (value.from && value.to)
      return `${labels[value.from] ?? value.from} → ${labels[value.to] ?? value.to}${value.reason ? ` · ${value.reason}` : ''}`;
    if (event.type === 'asignacion' && value.assignedToUserId)
      return `Responsable: ${technicians.find((t) => t.id === value.assignedToUserId)?.fullName ?? 'técnico asignado'}${value.reason ? ` · ${value.reason}` : ''}`;
    if (event.type === 'material_consumido' && value.quantity) return `Cantidad: ${value.quantity}`;
  } catch {
    /* Los eventos antiguos pueden contener texto libre. */
  }
  return '';
}
type Notice = {
  id: string;
  title: string;
  message: string;
  ticketId: string;
  createdAt: string;
  readAt: string | null;
};
function Notifications() {
  const { request, session } = useSession();
  const cache = useQueryClient();
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => (await request('/notifications')) as { data: Notice[] },
    refetchOnWindowFocus: true,
  });
  const mark = useMutation({
    mutationFn: (id: string) => request('/notifications/read', 'POST', { ids: [id] }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const manager = ['administrador', 'supervisor'].includes(session?.user.role ?? '');
  const alerts = useQuery({
    queryKey: ['inventory', 'alerts'],
    queryFn: async () =>
      (await request('/inventory/alerts')) as {
        data: { id: string; message: string; readAt: string | null }[];
      },
    enabled: manager,
  });
  const markAlert = useMutation({
    mutationFn: (id: string) => request('/inventory/alerts/read', 'POST', { ids: [id] }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ['inventory', 'alerts'] }),
  });
  const taskAlerts = useQuery({
    queryKey: ['task-notifications'],
    queryFn: async () =>
      (await request('/tasks/notifications')) as {
        data: { id: string; message: string; readAt: string | null }[];
      },
    enabled: session?.user.role === 'tecnico',
    refetchInterval: 300000,
  });
  const markTaskAlert = useMutation({
    mutationFn: (id: string) => request('/tasks/notifications/read', 'POST', { ids: [id] }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ['task-notifications'] }),
  });
  const markAll = useMutation({
    mutationFn: async () => {
      const tickets = (query.data?.data ?? []).filter((n) => !n.readAt).map((n) => n.id);
      const inventory = (alerts.data?.data ?? []).filter((n) => !n.readAt).map((n) => n.id);
      const task = (taskAlerts.data?.data ?? []).filter((n) => !n.readAt).map((n) => n.id);
      await Promise.all([
        ...(tickets.length ? [request('/notifications/read', 'POST', { ids: tickets })] : []),
        ...(inventory.length
          ? [request('/inventory/alerts/read', 'POST', { ids: inventory })]
          : []),
        ...(task.length ? [request('/tasks/notifications/read', 'POST', { ids: task })] : []),
      ]);
    },
    onSettled: () => {
      void cache.invalidateQueries({ queryKey: ['notifications'] });
      void cache.invalidateQueries({ queryKey: ['inventory', 'alerts'] });
      void cache.invalidateQueries({ queryKey: ['task-notifications'] });
    },
  });
  const unread =
    (query.data?.data.filter((item) => !item.readAt).length ?? 0) +
    (alerts.data?.data.filter((item) => !item.readAt).length ?? 0) +
    (taskAlerts.data?.data.filter((item) => !item.readAt).length ?? 0);
  return (
    <div className="notice-menu">
      <button
        className="notice-toggle"
        onClick={() => setOpen(!open)}
        aria-label={unread ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'}
        aria-expanded={open}
      >
        <Bell size={19} />
        {unread > 0 && <span aria-hidden="true" />}
      </button>
      {open && (
        <section className="notice-panel" aria-label="Notificaciones">
          <h2>Notificaciones</h2>
          {unread > 0 && (
            <button type="button" disabled={markAll.isPending} onClick={() => markAll.mutate()}>
              Marcar todas las visibles como leídas
            </button>
          )}
          {markAll.isError && (
            <p role="alert">
              Algunas notificaciones podrían no haberse marcado. Inténtalo de nuevo.
            </p>
          )}
          {query.isPending ? (
            <p role="status">Cargando…</p>
          ) : query.isError ? (
            <p role="alert">No se pudieron cargar las notificaciones.</p>
          ) : !query.data?.data.length &&
            !alerts.data?.data.length &&
            !taskAlerts.data?.data.length ? (
            <p>No tienes notificaciones disponibles.</p>
          ) : (
            query.data.data.map((n) => (
              <article key={n.id}>
                <Link to={`/tickets/${n.ticketId}`} onClick={() => setOpen(false)}>
                  <strong>{n.title}</strong>
                  <span>{n.message}</span>
                </Link>
                {!n.readAt && (
                  <button disabled={mark.isPending} onClick={() => mark.mutate(n.id)}>
                    Marcar como leída
                  </button>
                )}
              </article>
            ))
          )}
          {alerts.data?.data.map((a) => (
            <article key={a.id}>
              <Link to="/inventario" onClick={() => setOpen(false)}>
                <strong>Existencias bajo mínimo</strong>
                <span>{a.message}</span>
              </Link>
              {!a.readAt && (
                <button disabled={markAlert.isPending} onClick={() => markAlert.mutate(a.id)}>
                  Marcar como leída
                </button>
              )}
            </article>
          ))}
          {taskAlerts.data?.data.map((a) => (
            <article key={a.id}>
              <Link to="/tareas" onClick={() => setOpen(false)}>
                <strong>Tarea operativa</strong>
                <span>{a.message}</span>
              </Link>
              {!a.readAt && (
                <button
                  disabled={markTaskAlert.isPending}
                  onClick={() => markTaskAlert.mutate(a.id)}
                >
                  Marcar como leída
                </button>
              )}
            </article>
          ))}
          {taskAlerts.isError && (
            <p role="alert">No se pudieron cargar las notificaciones de tareas.</p>
          )}
          {(mark.isError || markAlert.isError || markTaskAlert.isError) && (
            <p role="alert">No se pudo actualizar la notificación.</p>
          )}
          {alerts.isError && <p role="alert">No se pudieron cargar las alertas de inventario.</p>}
        </section>
      )}
    </div>
  );
}
export function Workspace() {
  const { session, loading, setSession, request } = useSession();
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  if (loading) return <main className="work-loading">Comprobando sesión…</main>;
  if (!session) return <Navigate to="/acceso" state={{ sessionRequired: true }} replace />;
  const admin = ['administrador', 'supervisor'].includes(session.user.role);
  const title = location.pathname.startsWith('/tareas')
    ? 'Tareas'
    : location.pathname.startsWith('/inventario')
      ? 'Inventario'
      : location.pathname.startsWith('/clientes')
        ? 'Clientes'
        : location.pathname.startsWith('/tickets')
          ? 'Tickets'
          : 'Panel principal';
  async function logout() {
    try {
      await request('/auth/logout', 'POST');
      setSession(null);
    } catch {
      window.alert('No fue posible cerrar la sesión. Inténtalo de nuevo.');
    }
  }
  return (
    <div className="work">
      <LiveUpdates userId={session.user.id} />
      <aside className={`work-sidebar ${menu ? 'open' : ''}`}>
        <Link className="work-logo" to="/panel">
          <span className="work-logo-mark">▦</span> ops<span>desk</span>
        </Link>
        <div className="work-space">ESPACIO DE TRABAJO</div>
        <nav aria-label="Navegación de la aplicación">
          <NavLink to="/panel" onClick={() => setMenu(false)}>
            <BarChart3 size={18} /> Panel principal
          </NavLink>
          <NavLink to="/tickets" onClick={() => setMenu(false)}>
            <ClipboardList size={18} /> Tickets
          </NavLink>
          {session.user.role !== 'cliente' && (
            <NavLink to="/tareas" onClick={() => setMenu(false)}>
              <ListChecks size={18} /> Tareas
            </NavLink>
          )}
          {session.user.role !== 'cliente' && (
            <NavLink to="/inventario" onClick={() => setMenu(false)}>
              <Package size={18} /> Inventario
            </NavLink>
          )}
          {admin && (
            <NavLink to="/clientes" onClick={() => setMenu(false)}>
              <UsersRound size={18} /> Clientes
            </NavLink>
          )}
        </nav>
        <div className="work-sidebar-bottom">
          <Link to="/perfil">
            <UserRound size={17} /> Mi perfil
          </Link>
          <button onClick={logout}>
            <LogOut size={17} /> Cerrar sesión
          </button>
        </div>
      </aside>
      {menu && (
        <button className="work-scrim" aria-label="Cerrar menú" onClick={() => setMenu(false)} />
      )}
      <div className="work-body">
        <header className="work-top">
          <button
            className="work-menu"
            onClick={() => setMenu(!menu)}
            aria-label={menu ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menu}
          >
            <Menu size={21} />
          </button>
          <div className="work-breadcrumb">
            Espacio de trabajo <span>/</span> <strong>{title}</strong>
          </div>
          <Notifications />
          <Link className="work-user" to="/perfil">
            <span>{session.user.fullName.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{session.user.fullName}</strong>
              <small>{session.user.role}</small>
            </div>
          </Link>
        </header>
        <main className="work-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="work-empty" role="alert">
      <strong>No pudimos cargar la información.</strong>
      <p>{error instanceof Error ? error.message : 'Inténtalo nuevamente.'}</p>
    </div>
  );
}
function useTickets(query = '', page = 1, status = '', assignedTo = '') {
  const { request } = useSession();
  return useQuery({
    queryKey: ['tickets', query, page, status, assignedTo],
    queryFn: async () =>
      (await request(
        `/tickets?limit=20&sort=createdAt&order=desc&page=${page}${query ? '&q=' + encodeURIComponent(query) : ''}${status ? '&status=' + encodeURIComponent(status) : ''}${assignedTo ? '&assignedTo=' + encodeURIComponent(assignedTo) : ''}`,
      )) as List<Ticket>,
  });
}
function TicketTable({ items }: { items: Ticket[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Asunto</th>
            <th>Estado</th>
            <th>Prioridad</th>
            <th>Actualizado</th>
            <th>
              <span className="sr-only">Detalle</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr key={t.id}>
              <td className="ticket-id">#{String(t.ticketNumber).padStart(4, '0')}</td>
              <td>
                <Link className="table-title" to={`/tickets/${t.id}`}>
                  {t.title}
                </Link>
              </td>
              <td>
                <span className="work-badge">{labels[t.status] || t.status}</span>
              </td>
              <td>{labels[t.priority] || t.priority}</td>
              <td>{date(t.updatedAt)}</td>
              <td>
                <Link to={`/tickets/${t.id}`} aria-label={`Ver ticket ${t.ticketNumber}`}>
                  <ArrowRight size={17} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
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
export function Customers() {
  const { request, session } = useSession();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Customer | null>(null);
  const query = useQuery({
    queryKey: ['customers', search, page],
    queryFn: async () =>
      (await request(
        `/customers?limit=20&sort=name&page=${page}${search ? '&q=' + encodeURIComponent(search) : ''}`,
      )) as List<Customer>,
    enabled: !!session && ['administrador', 'supervisor'].includes(session.user.role),
  });
  if (session && !['administrador', 'supervisor'].includes(session.user.role))
    return <Navigate to="/denegado" replace />;
  return (
    <>
      <div className="work-heading">
        <div>
          <div className="work-overline">RELACIONES / ORGANIZACIONES</div>
          <h1>Clientes</h1>
          <p>La información de contacto de las organizaciones atendidas.</p>
        </div>
      </div>
      <section className="work-section">
        <div className="section-bar">
          <div>
            <h2>Directorio de clientes</h2>
            <p>{query.data ? `${query.data.meta.total} resultados` : 'Clientes registrados'}</p>
          </div>
          <label className="work-search">
            <Search size={17} />
            <span className="sr-only">Buscar clientes</span>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar nombre o identificación"
            />
          </label>
        </div>
        {query.isPending ? (
          <div className="work-empty" role="status">
            Cargando clientes…
          </div>
        ) : query.error ? (
          <ErrorBox error={query.error} />
        ) : query.data?.data.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Correo</th>
                  <th>Teléfono</th>
                  <th>Estado</th>
                  {session?.user.role === 'administrador' && <th>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {query.data.data.map((c) => (
                  <tr key={c.id}>
                    <td className="table-title">{c.name}</td>
                    <td>{c.email || '—'}</td>
                    <td>{c.phone || '—'}</td>
                    <td>
                      <span className="work-badge">{c.status}</span>
                    </td>
                    {session?.user.role === 'administrador' && (
                      <td>
                        <button
                          type="button"
                          onClick={() => setEditing(c)}
                          aria-label={`Editar ${c.name}`}
                        >
                          Editar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="work-empty">
            <strong>No hay clientes para mostrar.</strong>
            <p>Los clientes registrados aparecerán aquí.</p>
          </div>
        )}
        {query.data && query.data.meta.total > query.data.meta.limit && (
          <nav aria-label="Paginación de clientes">
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
          </nav>
        )}
      </section>
      {editing && (
        <EditCustomer key={editing.id} customer={editing} onClose={() => setEditing(null)} />
      )}
      <SetupCustomers />
    </>
  );
}
export function TicketDetail() {
  const { id } = useParams();
  const { request, session } = useSession();
  const cache = useQueryClient();
  const schema = z.object({
    body: z.string().trim().min(1, 'Escribe un comentario.').max(10000),
    visibility: z.enum(['cliente', 'interno']),
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { body: '', visibility: 'cliente' },
  });
  const commentKey = useRef(crypto.randomUUID());
  const comment = useMutation({
    mutationFn: (value: z.infer<typeof schema>) =>
      request(`/tickets/${encodeURIComponent(id!)}/comments`, 'POST', {
        ...value,
        requestId: commentKey.current,
      }),
    onSuccess: () => {
      commentKey.current = crypto.randomUUID();
      reset();
      void cache.invalidateQueries({ queryKey: ['history', id] });
    },
  });
  const query = useQuery({
    queryKey: ['ticket', id],
    queryFn: async () => (await request(`/tickets/${encodeURIComponent(id!)}`)) as { data: Ticket },
    enabled: !!id,
  });
  const [technicianSearch, setTechnicianSearch] = useState('');
  const canAssign = session?.user.role === 'administrador' || session?.user.role === 'supervisor';
  const technicians = useQuery({
    queryKey: ['technicians', technicianSearch],
    queryFn: async () =>
      (await request(`/technicians?q=${encodeURIComponent(technicianSearch)}`)) as {
        data: { id: string; fullName: string }[];
      },
    enabled: !!canAssign,
  });
  const assignmentSchema = z.object({
    technicianId: z.uuid('Selecciona un técnico.'),
    reason: z.string().max(1000),
  });
  const assignmentForm = useForm<z.infer<typeof assignmentSchema>>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: { technicianId: '', reason: '' },
  });
  const assign = useMutation({
    mutationFn: (value: z.infer<typeof assignmentSchema>) =>
      request(`/tickets/${encodeURIComponent(id!)}/assignment`, 'POST', {
        technicianId: value.technicianId,
        expectedUpdatedAt: query.data!.data.updatedAt,
        ...(value.reason.trim() ? { reason: value.reason.trim() } : {}),
      }),
    onSuccess: () => {
      assignmentForm.reset();
      void cache.invalidateQueries({ queryKey: ['ticket', id] });
      void cache.invalidateQueries({ queryKey: ['history', id] });
      void cache.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
  const history = useQuery({
    queryKey: ['history', id],
    queryFn: async () =>
      (await request(`/tickets/${encodeURIComponent(id!)}/history`)) as {
        data: {
          comments: {
            id: string;
            body: string;
            visibility: string;
            createdAt: string;
            authorName: string;
          }[];
          events: {
            id: string;
            type: string;
            createdAt: string;
            actorName: string;
            detail?: string;
          }[];
        };
      },
    enabled: !!id,
  });
  return (
    <>
      <div className="work-heading">
        <div>
          <Link className="back-link" to="/tickets">
            ← Volver a tickets
          </Link>
          {query.data && (
            <>
              <div className="work-overline">
                TICKET #{String(query.data.data.ticketNumber).padStart(4, '0')}
              </div>
              <h1>{query.data.data.title}</h1>
            </>
          )}
        </div>
      </div>
      {query.isPending ? (
        <div className="work-empty">Cargando ticket…</div>
      ) : query.error ? (
        <ErrorBox error={query.error} />
      ) : (
        <div className="detail-grid">
          <section className="work-section detail-content">
            <h2>Descripción</h2>
            <p>{query.data?.data.description}</p>
            <hr />
            <h2>Conversación</h2>
            {history.isPending ? (
              <p role="status">Cargando comentarios…</p>
            ) : history.error ? (
              <ErrorBox error={history.error} />
            ) : history.data?.data.comments.length ? (
              history.data.data.comments.map((c) => (
                <article className="comment" key={c.id}>
                  <div>
                    <strong>
                      {c.visibility === 'interno' ? 'Nota interna' : 'Comentario'} · {c.authorName}
                    </strong>
                    <small>{date(c.createdAt)}</small>
                  </div>
                  <p>{c.body}</p>
                </article>
              ))
            ) : (
              <p className="muted">Todavía no hay comentarios.</p>
            )}
            {query.data && !('archivedAt' in query.data.data && query.data.data.archivedAt) && (
              <form
                className="comment-form"
                onSubmit={handleSubmit((value) => comment.mutate(value))}
              >
                <label htmlFor="comment-body">Añadir comentario</label>
                <textarea
                  id="comment-body"
                  rows={4}
                  aria-invalid={!!errors.body}
                  aria-describedby={errors.body ? 'comment-error' : undefined}
                  {...register('body')}
                />
                {errors.body && (
                  <small id="comment-error" role="alert">
                    {errors.body.message}
                  </small>
                )}
                {session?.user.role !== 'cliente' && (
                  <>
                    <label htmlFor="comment-visibility">Visibilidad</label>
                    <select id="comment-visibility" {...register('visibility')}>
                      <option value="cliente">Visible para el cliente</option>
                      <option value="interno">Nota interna</option>
                    </select>
                  </>
                )}
                {comment.isError && (
                  <p role="alert">
                    {comment.error instanceof Error
                      ? comment.error.message
                      : 'No se pudo enviar el comentario.'}
                  </p>
                )}
                {comment.isSuccess && <p role="status">Comentario añadido.</p>}
                <button className="security-button" disabled={comment.isPending}>
                  {comment.isPending ? 'Enviando…' : 'Enviar comentario'}
                </button>
              </form>
            )}
            <hr />
            <TicketMaterials
              ticketId={id!}
              status={query.data!.data.status}
              archived={!!query.data!.data.archivedAt}
            />
            <Attachments ticketId={id!} archived={!!query.data!.data.archivedAt} />
            <hr />
            <h2>Actividad</h2>
            {history.data?.data.events.length ? (
              <ol className="activity-list">
                {history.data.data.events.map((e) => (
                  <li key={e.id}>
                    <strong>
                      {e.type.replaceAll('_', ' ')} · {e.actorName}
                    </strong>
                    {activityDetail(e, technicians.data?.data ?? []) && (
                      <span>{activityDetail(e, technicians.data?.data ?? [])}</span>
                    )}
                    <span>{date(e.createdAt)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">Sin actividad registrada.</p>
            )}
          </section>
          <aside className="work-section detail-info">
            <h2>Información</h2>
            <dl>
              <dt>Estado</dt>
              <dd>
                <span className="work-badge">
                  {labels[query.data!.data.status] || query.data!.data.status}
                </span>
              </dd>
              <dt>Prioridad</dt>
              <dd>{labels[query.data!.data.priority] || query.data!.data.priority}</dd>
              <dt>Última actualización</dt>
              <dd>{date(query.data!.data.updatedAt)}</dd>
              {query.data!.data.resolution && (
                <>
                  <dt>Solución</dt>
                  <dd>{query.data!.data.resolution}</dd>
                </>
              )}
            </dl>
            <TicketStatus
              ticketId={id!}
              current={query.data!.data.status}
              updatedAt={query.data!.data.updatedAt}
              archived={!!query.data!.data.archivedAt}
            />
            {canAssign &&
              !query.data!.data.archivedAt &&
              !['resuelto', 'cerrado'].includes(query.data!.data.status) && (
                <form
                  className="comment-form"
                  onSubmit={assignmentForm.handleSubmit((value) => {
                    if (query.data!.data.assignedToUserId && !value.reason.trim()) {
                      assignmentForm.setError('reason', {
                        message: 'Indica el motivo de la reasignación.',
                      });
                      return;
                    }
                    assign.mutate(value);
                  })}
                >
                  <label htmlFor="technician-search">Buscar técnico</label>
                  <input
                    id="technician-search"
                    value={technicianSearch}
                    onChange={(e) => setTechnicianSearch(e.target.value)}
                    maxLength={120}
                  />
                  <label htmlFor="technician">Asignar técnico</label>
                  <select id="technician" {...assignmentForm.register('technicianId')}>
                    <option value="">Selecciona un técnico</option>
                    {technicians.data?.data.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.fullName}
                      </option>
                    ))}
                  </select>
                  {technicians.isError && (
                    <p role="alert">No se pudo cargar la lista de técnicos.</p>
                  )}
                  {assignmentForm.formState.errors.technicianId && (
                    <small role="alert">
                      {assignmentForm.formState.errors.technicianId.message}
                    </small>
                  )}
                  <label htmlFor="assignment-reason">Motivo de reasignación</label>
                  <textarea
                    id="assignment-reason"
                    rows={2}
                    {...assignmentForm.register('reason')}
                  />
                  {assignmentForm.formState.errors.reason && (
                    <small role="alert">{assignmentForm.formState.errors.reason.message}</small>
                  )}
                  {assign.isError && (
                    <p role="alert">
                      {assign.error instanceof Error ? assign.error.message : 'No se pudo asignar.'}
                    </p>
                  )}
                  {assign.isSuccess && <p role="status">Asignación guardada.</p>}
                  <button
                    className="security-button"
                    disabled={assign.isPending || technicians.isPending}
                  >
                    {assign.isPending ? 'Guardando…' : 'Guardar asignación'}
                  </button>
                </form>
              )}
          </aside>
        </div>
      )}
    </>
  );
}
