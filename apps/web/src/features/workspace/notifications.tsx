import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
  const [toast, setToast] = useState<Notice | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);
  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => (await request('/notifications')) as { data: Notice[] },
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    if (!query.data) return;
    const notices = query.data.data;
    if (seen.current === null) {
      seen.current = new Set(notices.map((notice) => notice.id));
      return;
    }
    const fresh = notices.find((notice) => !notice.readAt && !seen.current!.has(notice.id));
    notices.forEach((notice) => seen.current!.add(notice.id));
    if (fresh) setToast(fresh);
  }, [query.data]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(timer);
  }, [toast]);
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
    <div className="notice-menu" ref={menuRef}>
      {toast && (
        <aside className="notice-toast" role="status">
          <Link to={`/tickets/${toast.ticketId}`} onClick={() => setToast(null)}>
            <strong>{toast.title}</strong>
            <span>{toast.message}</span>
          </Link>
          <button type="button" aria-label="Cerrar aviso" onClick={() => setToast(null)}>
            ×
          </button>
        </aside>
      )}
      <button
        className="notice-toggle"
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        aria-label={unread ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'}
        aria-expanded={open}
        aria-controls="notice-panel"
      >
        <Bell size={19} />
        {unread > 0 && <span aria-hidden="true" />}
      </button>
      {open && (
        <section id="notice-panel" className="notice-panel" aria-label="Notificaciones">
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
          {!!query.data?.data.length && <h3>Tickets</h3>}
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
          {!!alerts.data?.data.length && <h3>Inventario</h3>}
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
          {!!taskAlerts.data?.data.length && <h3>Tareas</h3>}
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
