import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../app/security';
import { useDirtyNavigation } from '../workspace/navigation-guard';
const transitions: Record<string, string[]> = {
  abierto: ['en_proceso'],
  asignado: ['en_proceso'],
  en_proceso: ['pendiente_cliente', 'resuelto'],
  pendiente_cliente: ['en_proceso', 'resuelto'],
  resuelto: ['cerrado', 'reabierto'],
  cerrado: ['reabierto'],
  reabierto: ['en_proceso'],
};
const labels: Record<string, string> = {
  en_proceso: 'En proceso',
  pendiente_cliente: 'Pendiente del cliente',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
  reabierto: 'Reabierto',
};
export function TicketStatus({
  ticketId,
  current,
  archived,
  updatedAt,
}: {
  ticketId: string;
  current: string;
  archived: boolean;
  updatedAt: string;
}) {
  const { request, session } = useSession();
  const cache = useQueryClient();
  const [next, setNext] = useState('');
  const [resolution, setResolution] = useState('');
  const [reason, setReason] = useState('');
  useDirtyNavigation(!!(next || resolution || reason));
  const choices = (transitions[current] ?? []).filter((s) =>
    session?.user.role === 'tecnico'
      ? ['en_proceso', 'pendiente_cliente', 'resuelto'].includes(s)
      : session?.user.role !== 'cliente',
  );
  const update = useMutation({
    mutationFn: () =>
      request(`/tickets/${encodeURIComponent(ticketId)}`, 'PATCH', {
        status: next,
        expectedUpdatedAt: updatedAt,
        ...(next === 'resuelto' ? { resolution } : {}),
        ...(next === 'reabierto' ? { reopenReason: reason } : {}),
      }),
    onSuccess: () => {
      setNext('');
      setResolution('');
      setReason('');
      void cache.invalidateQueries({ queryKey: ['ticket', ticketId] });
      void cache.invalidateQueries({ queryKey: ['history', ticketId] });
      void cache.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
  if (archived || !choices.length) return null;
  return (
    <form
      className="comment-form"
      onSubmit={(e) => {
        e.preventDefault();
        update.mutate();
      }}
    >
      <label>
        Cambiar estado
        <select required value={next} onChange={(e) => setNext(e.target.value)}>
          <option value="">Seleccionar estado</option>
          {choices.map((x) => (
            <option key={x} value={x}>
              {labels[x]}
            </option>
          ))}
        </select>
      </label>
      {next === 'resuelto' && (
        <label>
          Solución
          <textarea
            required
            maxLength={10000}
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
          />
        </label>
      )}
      {next === 'reabierto' && (
        <label>
          Motivo de reapertura
          <textarea
            required
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
      )}
      {update.isError && (
        <p role="alert">
          {update.error instanceof Error ? update.error.message : 'No se pudo cambiar el estado.'}
        </p>
      )}
      {update.isSuccess && <p role="status">Estado actualizado.</p>}
      <button className="security-button" disabled={update.isPending}>
        Actualizar estado
      </button>
    </form>
  );
}
