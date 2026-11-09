import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../app/security';
import { useDirtyNavigation } from '../workspace/navigation-guard';
export type ViewFilters = {
  q: string;
  status: string;
  priority: string;
  assignedTo: string;
  sort: string;
  order: string;
};
type Saved = { id: string; name: string; filters: ViewFilters };
export function SavedViews({
  filters,
  onApply,
}: {
  filters: ViewFilters;
  onApply: (filters: ViewFilters) => void;
}) {
  const { request } = useSession();
  const cache = useQueryClient();
  const [name, setName] = useState('');
  useDirtyNavigation(!!name);
  const views = useQuery({
    queryKey: ['saved-ticket-views'],
    queryFn: async () => (await request('/service-desk/views')) as { data: Saved[] },
  });
  const refresh = () => void cache.invalidateQueries({ queryKey: ['saved-ticket-views'] });
  const save = useMutation({
    mutationFn: () => request('/service-desk/views', 'POST', { name, filters }),
    onSuccess: () => {
      setName('');
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => request(`/service-desk/views/${encodeURIComponent(id)}`, 'DELETE'),
    onSuccess: refresh,
  });
  const error = save.error ?? remove.error;
  return (
    <details className="desk-settings">
      <summary>Vistas guardadas</summary>
      <p>Guarda los filtros actuales para recuperarlos más adelante.</p>
      {views.isError ? (
        <p role="alert">No se pudieron cargar las vistas.</p>
      ) : views.data?.data.length ? (
        <ul>
          {views.data.data.map((view) => (
            <li key={view.id}>
              <button type="button" onClick={() => onApply(view.filters)}>
                {view.name}
              </button>{' '}
              <button
                type="button"
                aria-label={`Eliminar vista ${view.name}`}
                onClick={() => {
                  if (window.confirm(`¿Eliminar la vista «${view.name}»?`)) remove.mutate(view.id);
                }}
              >
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>No hay vistas guardadas.</p>
      )}
      <form
        className="comment-form"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <label>
          Nombre de la vista
          <input
            required
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button type="submit" disabled={save.isPending}>
          Guardar filtros actuales
        </button>
      </form>
      {(save.isError || remove.isError) && (
        <p role="alert">
          {error instanceof Error ? error.message : 'No se pudo completar la operación.'}
        </p>
      )}
    </details>
  );
}
