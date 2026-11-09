import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router-dom';
import { z } from 'zod';
import { Attachments } from '../tickets/attachments';
import { useSession } from '../../app/security';
import { TicketMaterials } from '../tickets/ticket-materials';
import { TicketStatus } from '../tickets/ticket-status';
import { type Ticket, activityDetail, date, ErrorBox, labels } from './shared';
import { useDirtyNavigation } from './navigation-guard';
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
    formState: { errors, isDirty },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { body: '', visibility: 'cliente' },
  });
  useDirtyNavigation(isDirty);
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
  useDirtyNavigation(assignmentForm.formState.isDirty);
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
