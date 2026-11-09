import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../app/security';
import { useDirtyNavigation } from '../workspace/navigation-guard';

type Template = {
  id: string;
  title: string;
  body: string;
  categoryId: string | null;
  active: boolean;
  updatedAt: string;
};
const empty = { title: '', body: '', categoryId: '', active: true };
export function ResponseTemplates({ onInsert }: { onInsert: (body: string) => void }) {
  const { request, session } = useSession();
  const cache = useQueryClient();
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState(empty);
  const [editing, setEditing] = useState<Template | null>(null);
  const manager = ['administrador', 'supervisor'].includes(session?.user.role ?? '');
  useDirtyNavigation(!!editing || JSON.stringify(draft) !== JSON.stringify(empty));
  const templates = useQuery({
    queryKey: ['response-templates', search],
    queryFn: async () =>
      (await request(
        `/service-desk/response-templates${search ? `?q=${encodeURIComponent(search)}` : ''}`,
      )) as { data: Template[] },
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await request('/categories')) as { data: { id: string; name: string }[] },
    enabled: manager,
  });
  const save = useMutation({
    mutationFn: () =>
      request(
        editing
          ? `/service-desk/response-templates/${encodeURIComponent(editing.id)}`
          : '/service-desk/response-templates',
        editing ? 'PUT' : 'POST',
        {
          ...draft,
          categoryId: draft.categoryId || null,
          ...(editing ? { expectedUpdatedAt: editing.updatedAt } : {}),
        },
      ),
    onSuccess: () => {
      setDraft(empty);
      setEditing(null);
      void cache.invalidateQueries({ queryKey: ['response-templates'] });
    },
  });
  return (
    <details>
      <summary>Respuestas predefinidas</summary>
      <label>
        Buscar plantillas
        <input value={search} onChange={(event) => setSearch(event.target.value)} maxLength={120} />
      </label>
      {templates.isError ? (
        <p role="alert">No se pudieron cargar las plantillas.</p>
      ) : templates.data?.data.length ? (
        <ul>
          {templates.data.data.map((template) => (
            <li key={template.id}>
              <strong>{template.title}</strong>
              {!template.active && ' · Inactiva'}{' '}
              {template.active && (
                <button type="button" onClick={() => onInsert(template.body)}>
                  Insertar
                </button>
              )}{' '}
              {manager && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(template);
                    setDraft({
                      title: template.title,
                      body: template.body,
                      categoryId: template.categoryId ?? '',
                      active: template.active,
                    });
                  }}
                >
                  Editar
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>Sin plantillas para esta búsqueda.</p>
      )}
      {manager && (
        <form
          className="comment-form"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <h4>{editing ? 'Editar plantilla' : 'Crear plantilla'}</h4>
          <label>
            Nombre de plantilla
            <input
              required
              maxLength={120}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <label>
            Texto de plantilla
            <textarea
              required
              maxLength={10000}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />
          </label>
          <label>
            Categoría de plantilla
            <select
              value={draft.categoryId}
              onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
            >
              <option value="">Todas</option>
              {categories.data?.data.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
            />{' '}
            Activa
          </label>
          {save.isError && (
            <p role="alert">
              {save.error instanceof Error ? save.error.message : 'No se pudo guardar.'}
            </p>
          )}
          {save.isSuccess && <p role="status">Plantilla guardada.</p>}
          <button type="submit" disabled={save.isPending}>
            Guardar plantilla
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setDraft(empty);
              }}
            >
              Cancelar edición
            </button>
          )}
        </form>
      )}
    </details>
  );
}
