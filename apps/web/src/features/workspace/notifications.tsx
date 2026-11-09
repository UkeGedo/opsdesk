import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../app/security';
type Notice = {
  id: string;
  title: string;
  message: string;
  ticketId: string;
  createdAt: string;
  readAt: string | null;
};
export function Notifications() {
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
