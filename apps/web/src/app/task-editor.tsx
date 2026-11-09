import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from './security';
type Task = {
  id: string;
  title: string;
  description: string;
  assigneeId: string;
  priority: string;
  ticketId: string | null;
  dueAt: string | null;
  updatedAt: string;
};
export function TaskEditor({
  task,
  technicians,
  onClose,
}: {
  task: Task;
  technicians: { id: string; fullName: string }[];
  onClose: () => void;
}) {
  const { request } = useSession();
  const cache = useQueryClient();
  const [title, setTitle] = useState(task.title),
    [description, setDescription] = useState(task.description),
    [assigneeId, setAssigneeId] = useState(task.assigneeId),
    [priority, setPriority] = useState(task.priority),
    [ticketId, setTicketId] = useState(task.ticketId ?? ''),
    [dueAt, setDueAt] = useState(() => {
      if (!task.dueAt) return '';
      const date = new Date(task.dueAt);
      return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    });
  const edit = useMutation({
    mutationFn: () =>
      request(`/tasks/${encodeURIComponent(task.id)}`, 'PATCH', {
        title,
        description,
        assigneeId,
        priority,
        ticketId: ticketId || null,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        expectedUpdatedAt: task.updatedAt,
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['tasks'] });
      void cache.invalidateQueries({ queryKey: ['task-history'] });
      onClose();
    },
  });
  return (
    <form
      className="comment-form"
      onSubmit={(e) => {
        e.preventDefault();
        edit.mutate();
      }}
    >
      <label>
        Título
        <input required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
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
          {technicians.map((t) => (
            <option key={t.id} value={t.id}>
              {t.fullName}
            </option>
          ))}
        </select>
      </label>
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
        <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
      </label>
      <label>
        Ticket opcional
        <input value={ticketId} onChange={(e) => setTicketId(e.target.value)} />
      </label>
      {edit.isError && (
        <p role="alert">
          {edit.error instanceof Error ? edit.error.message : 'No se pudo editar.'}
        </p>
      )}
      <button disabled={edit.isPending}>Guardar cambios</button>
      <button type="button" onClick={onClose}>
        Cancelar
      </button>
    </form>
  );
}
