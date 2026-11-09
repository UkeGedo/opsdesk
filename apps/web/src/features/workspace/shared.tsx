import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Paginated, CustomerRecord, TicketStatus } from '@opsdesk/shared/contracts';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useSession } from '../../app/security';
import { RowActions } from './row-actions';
import { useDirtyNavigation } from './navigation-guard';
import { useViewState } from './workspace-memory';
export type Ticket = {
  id: string;
  ticketNumber: number;
  title: string;
  description: string;
  status: TicketStatus;
  priority: string;
  customerId: string;
  updatedAt: string;
  assignedToUserId?: string | null;
  archivedAt?: string | null;
  resolution?: string | null;
};
export type Customer = CustomerRecord;
export type List<T> = Paginated<T>;
export const labels: Record<string, string> = {
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
export function date(value: string) {
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}
export function activityDetail(
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
export function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="work-empty" role="alert">
      <strong>No pudimos cargar la información.</strong>
      <p>{error instanceof Error ? error.message : 'Inténtalo nuevamente.'}</p>
    </div>
  );
}
export function LoadingRows({ label }: { label: string }) {
  return (
    <div className="loading-rows" role="status">
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" />
      <span aria-hidden="true" />
      <span aria-hidden="true" />
    </div>
  );
}
export function useTickets(
  query = '',
  page = 1,
  status = '',
  assignedTo = '',
  sort = 'createdAt',
  order = 'desc',
) {
  const { request } = useSession();
  return useQuery({
    queryKey: ['tickets', query, page, status, assignedTo, sort, order],
    queryFn: async () =>
      (await request(
        `/tickets?limit=20&sort=${encodeURIComponent(sort)}&order=${encodeURIComponent(order)}&page=${page}${query ? '&q=' + encodeURIComponent(query) : ''}${status ? '&status=' + encodeURIComponent(status) : ''}${assignedTo ? '&assignedTo=' + encodeURIComponent(assignedTo) : ''}`,
      )) as List<Ticket>,
  });
}
export function TicketTable({
  items,
  compact = false,
  selectable = false,
  onPreview,
  columns = { status: true, priority: true, updated: true },
}: {
  items: Ticket[];
  compact?: boolean;
  selectable?: boolean;
  onPreview?: (ticket: Ticket) => void;
  columns?: { status: boolean; priority: boolean; updated: boolean };
}) {
  const [selected, setSelected] = useViewState<string[]>('tickets.selection', []);
  const [message, setMessage] = useState('');
  const [bulkPriority, setBulkPriority] = useState('');
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  useDirtyNavigation(selectable && (!!bulkPriority || confirmBulk));
  const { request, session } = useSession();
  const cache = useQueryClient();
  const canBulk = ['administrador', 'supervisor'].includes(session?.user.role ?? '');
  const visibleSelected = items.filter((item) => selected.includes(item.id));
  async function applyPriority() {
    setBusy(true);
    const results = await Promise.allSettled(
      visibleSelected.map((item) =>
        request(`/tickets/${encodeURIComponent(item.id)}`, 'PATCH', {
          priority: bulkPriority,
          expectedUpdatedAt: item.updatedAt,
        }),
      ),
    );
    const failed = results.flatMap((result, index) =>
      result.status === 'rejected'
        ? [
            `#${visibleSelected[index].ticketNumber}: ${result.reason instanceof Error ? result.reason.message : 'No se pudo actualizar.'}`,
          ]
        : [],
    );
    setBulkErrors(failed);
    setMessage(`${results.length - failed.length} actualizados; ${failed.length} con error.`);
    setSelected(
      visibleSelected
        .filter((_, index) => results[index].status === 'rejected')
        .map((item) => item.id),
    );
    setBusy(false);
    setConfirmBulk(false);
    setBulkPriority('');
    void cache.invalidateQueries({ queryKey: ['tickets'] });
  }
  async function copySelection() {
    try {
      await navigator.clipboard.writeText(
        visibleSelected.map((item) => `#${String(item.ticketNumber).padStart(4, '0')}`).join(', '),
      );
      setMessage('Identificadores copiados.');
    } catch {
      setMessage('No se pudieron copiar los identificadores.');
    }
  }
  return (
    <>
      {selectable && visibleSelected.length > 0 && (
        <div className="selection-bar">
          <span>{visibleSelected.length} seleccionados en esta página</span>
          <button type="button" onClick={() => void copySelection()}>
            Copiar identificadores
          </button>
          <span role="status">{message}</span>
          {canBulk && (
            <>
              <label>
                Prioridad para seleccionados{' '}
                <select
                  value={bulkPriority}
                  onChange={(event) => setBulkPriority(event.target.value)}
                  disabled={busy}
                >
                  <option value="">Seleccionar</option>
                  {['baja', 'media', 'alta', 'urgente'].map((value) => (
                    <option key={value} value={value}>
                      {labels[value]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={!bulkPriority || busy}
                onClick={() => setConfirmBulk(true)}
              >
                Actualizar prioridad
              </button>
              {confirmBulk && (
                <div role="alert">
                  <p>¿Actualizar la prioridad de {visibleSelected.length} tickets?</p>
                  <button type="button" disabled={busy} onClick={() => void applyPriority()}>
                    {busy ? 'Actualizando…' : 'Confirmar actualización'}
                  </button>
                  <button type="button" disabled={busy} onClick={() => setConfirmBulk(false)}>
                    Cancelar
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {bulkErrors.length > 0 && (
        <div role="alert">
          <strong>Algunos tickets no se actualizaron:</strong>
          <ul>
            {bulkErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      {selectable && visibleSelected.length === 0 && message && <p role="status">{message}</p>}
      <div
        className={`table-wrap ${compact ? 'table-compact' : ''}`}
        role="region"
        aria-label="Tabla de tickets"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              {selectable && (
                <th>
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todos los tickets de esta página"
                    checked={items.length > 0 && visibleSelected.length === items.length}
                    onChange={(e) => {
                      setMessage('');
                      setSelected(e.target.checked ? items.map((item) => item.id) : []);
                    }}
                  />
                </th>
              )}
              <th>Ticket</th>
              <th>Asunto</th>
              {columns.status && <th>Estado</th>}
              {columns.priority && <th>Prioridad</th>}
              {columns.updated && <th>Actualizado</th>}
              <th>
                <span className="sr-only">Detalle</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id}>
                {selectable && (
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ticket ${t.ticketNumber}`}
                      checked={selected.includes(t.id)}
                      onChange={(e) => {
                        setMessage('');
                        const checked = e.target.checked;
                        setSelected((current) =>
                          checked ? [...current, t.id] : current.filter((id) => id !== t.id),
                        );
                      }}
                    />
                  </td>
                )}
                <td className="ticket-id">#{String(t.ticketNumber).padStart(4, '0')}</td>
                <td>
                  <Link className="table-title" to={`/tickets/${t.id}`}>
                    {t.title}
                  </Link>
                </td>
                {columns.status && (
                  <td>
                    <span className="work-badge" data-status={t.status}>
                      {labels[t.status] || t.status}
                    </span>
                  </td>
                )}
                {columns.priority && <td>{labels[t.priority] || t.priority}</td>}
                {columns.updated && <td>{date(t.updatedAt)}</td>}
                <td>
                  {onPreview && (
                    <button
                      type="button"
                      className="quick-view"
                      onClick={() => onPreview(t)}
                      aria-label={`Vista rápida ticket ${t.ticketNumber}`}
                    >
                      Vista rápida
                    </button>
                  )}{' '}
                  <Link to={`/tickets/${t.id}`} aria-label={`Ver ticket ${t.ticketNumber}`}>
                    <ArrowRight size={17} />
                  </Link>
                  {onPreview && (
                    <RowActions label={`Acciones del ticket ${t.ticketNumber}`}>
                      <button type="button" onClick={() => onPreview(t)}>
                        Abrir vista rápida
                      </button>
                      <Link to={`/tickets/${t.id}`}>Abrir ticket</Link>
                    </RowActions>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
