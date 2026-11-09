import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../app/security';
import { ErrorBox, labels, type Ticket } from './shared';
import { Surface } from './surface';

export function TicketPreview({ id, onClose }: { id: string; onClose: () => void }) {
  const { request, session } = useSession();
  const cache = useQueryClient();
  const [priority, setPriority] = useState('');
  const [technician, setTechnician] = useState('');
  const manager = ['administrador', 'supervisor'].includes(session?.user.role ?? '');
  const ticket = useQuery({
    queryKey: ['ticket', id],
    queryFn: async () => (await request(`/tickets/${encodeURIComponent(id)}`)) as { data: Ticket },
  });
  const techs = useQuery({
    queryKey: ['technicians'],
    queryFn: async () =>
      (await request('/technicians')) as { data: { id: string; fullName: string }[] },
    enabled: manager,
  });
  const update = useMutation({
    mutationFn: () =>
      request(`/tickets/${encodeURIComponent(id)}`, 'PATCH', {
        priority,
        expectedUpdatedAt: ticket.data!.data.updatedAt,
      }),
    onSuccess: () => {
      setPriority('');
      void cache.invalidateQueries({ queryKey: ['ticket', id] });
      void cache.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
  const assign = useMutation({
    mutationFn: () =>
      request(`/tickets/${encodeURIComponent(id)}/assignment`, 'POST', {
        technicianId: technician,
        expectedUpdatedAt: ticket.data!.data.updatedAt,
      }),
    onSuccess: () => {
      setTechnician('');
      void cache.invalidateQueries({ queryKey: ['ticket', id] });
      void cache.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
  return (
    <Surface
      title="Vista rápida de ticket"
      drawer
      dirty={!!priority || !!technician}
      onClose={onClose}
    >
      {ticket.isPending ? (
        <p role="status">Cargando ticket…</p>
      ) : ticket.error ? (
        <ErrorBox error={ticket.error} />
      ) : (
        <>
          <p className="work-overline">
            TICKET #{String(ticket.data.data.ticketNumber).padStart(4, '0')}
          </p>
          <h3>{ticket.data.data.title}</h3>
          <p>{ticket.data.data.description}</p>
          <p>
            Estado: <strong>{labels[ticket.data.data.status] ?? ticket.data.data.status}</strong>
          </p>
          <p>
            Prioridad:{' '}
            <strong>{labels[ticket.data.data.priority] ?? ticket.data.data.priority}</strong>
          </p>
          {priority || technician ? (
            <p>Guarda o descarta los cambios antes de abrir el detalle completo.</p>
          ) : (
            <Link className="surface-link" to={`/tickets/${id}`} onClick={onClose}>
              Abrir detalle completo →
            </Link>
          )}
          {manager && !ticket.data.data.archivedAt && (
            <>
              <form
                className="comment-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  update.mutate();
                }}
              >
                <label>
                  Modificar prioridad
                  <select
                    required
                    value={priority}
                    onChange={(event) => setPriority(event.target.value)}
                  >
                    <option value="">Seleccionar prioridad</option>
                    {['baja', 'media', 'alta', 'urgente'].map((value) => (
                      <option key={value} value={value}>
                        {labels[value]}
                      </option>
                    ))}
                  </select>
                </label>
                {update.isError && (
                  <p role="alert">
                    {update.error instanceof Error
                      ? update.error.message
                      : 'No se pudo actualizar la prioridad.'}
                  </p>
                )}
                {update.isSuccess && <p role="status">Prioridad actualizada.</p>}
                <button
                  className="security-button"
                  disabled={!priority || update.isPending || assign.isPending || ticket.isFetching}
                >
                  Guardar prioridad
                </button>
              </form>
              <form
                className="comment-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  assign.mutate();
                }}
              >
                <label>
                  Asignar técnico
                  <select
                    required
                    value={technician}
                    onChange={(event) => setTechnician(event.target.value)}
                  >
                    <option value="">Seleccionar técnico</option>
                    {techs.data?.data.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.fullName}
                      </option>
                    ))}
                  </select>
                </label>
                {techs.isError && <p role="alert">No se pudieron cargar los técnicos.</p>}
                {assign.isError && (
                  <p role="alert">
                    {assign.error instanceof Error
                      ? assign.error.message
                      : 'No se pudo asignar el técnico.'}
                  </p>
                )}
                {assign.isSuccess && <p role="status">Asignación guardada.</p>}
                <button
                  className="security-button"
                  disabled={
                    !technician || assign.isPending || update.isPending || ticket.isFetching
                  }
                >
                  Guardar asignación
                </button>
              </form>
            </>
          )}
        </>
      )}
    </Surface>
  );
}
