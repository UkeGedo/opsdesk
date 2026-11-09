import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../app/security';
import { useDirtyNavigation } from '../workspace/navigation-guard';

type Service = {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  responsibleTeam: string;
  active: boolean;
  defaultPriority: string;
  updatedAt: string;
  form: { version: number; fields: unknown[] };
};
const empty = {
  name: '',
  description: '',
  categoryId: '',
  responsibleTeam: '',
  active: true,
  defaultPriority: 'media',
  fields: '[]',
};
export function ServiceCatalog() {
  const { request } = useSession();
  const cache = useQueryClient();
  const [draft, setDraft] = useState(empty);
  const [editing, setEditing] = useState<Service | null>(null);
  useDirtyNavigation(!!editing || JSON.stringify(draft) !== JSON.stringify(empty));
  const services = useQuery({
    queryKey: ['service-catalog'],
    queryFn: async () => (await request('/service-desk/services')) as { data: Service[] },
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await request('/categories')) as { data: { id: string; name: string }[] },
  });
  const save = useMutation({
    mutationFn: () => {
      let fields: unknown;
      try {
        fields = JSON.parse(draft.fields);
      } catch {
        throw new Error('Los campos deben ser una lista JSON válida.');
      }
      if (!Array.isArray(fields)) throw new Error('Los campos deben ser una lista JSON.');
      const values = {
        name: draft.name,
        description: draft.description,
        categoryId: draft.categoryId,
        responsibleTeam: draft.responsibleTeam,
        active: draft.active,
        defaultPriority: draft.defaultPriority,
      };
      return request(
        editing
          ? `/service-desk/services/${encodeURIComponent(editing.id)}`
          : '/service-desk/services',
        editing ? 'PUT' : 'POST',
        {
          ...values,
          form: { version: editing?.form.version ?? 1, fields },
          ...(editing ? { expectedUpdatedAt: editing.updatedAt } : {}),
        },
      );
    },
    onSuccess: () => {
      setDraft(empty);
      setEditing(null);
      void cache.invalidateQueries({ queryKey: ['service-catalog'] });
    },
  });
  return (
    <details className="desk-settings">
      <summary>Catálogo de servicios</summary>
      <p>
        Configura servicios y campos declarativos. Los datos de tickets existentes conservan su
        versión del formulario.
      </p>
      {services.isError ? (
        <p role="alert">No se pudo cargar el catálogo.</p>
      ) : services.data?.data.length ? (
        <ul>
          {services.data.data.map((service) => (
            <li key={service.id}>
              {service.name} · {service.active ? 'Activo' : 'Inactivo'}{' '}
              <button
                type="button"
                onClick={() => {
                  setEditing(service);
                  setDraft({
                    name: service.name,
                    description: service.description,
                    categoryId: service.categoryId,
                    responsibleTeam: service.responsibleTeam,
                    active: service.active,
                    defaultPriority: service.defaultPriority,
                    fields: JSON.stringify(service.form.fields, null, 2),
                  });
                }}
              >
                Editar
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>No hay servicios configurados.</p>
      )}
      <form
        className="comment-form"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <h3>{editing ? 'Editar servicio' : 'Nuevo servicio'}</h3>
        <label>
          Nombre del servicio
          <input
            required
            maxLength={120}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label>
          Descripción del servicio
          <textarea
            required
            maxLength={2000}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </label>
        <label>
          Categoría del servicio
          <select
            required
            value={draft.categoryId}
            onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
          >
            <option value="">Seleccionar categoría</option>
            {categories.data?.data.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Equipo responsable
          <input
            required
            maxLength={120}
            value={draft.responsibleTeam}
            onChange={(e) => setDraft({ ...draft, responsibleTeam: e.target.value })}
          />
        </label>
        <label>
          Prioridad predeterminada
          <select
            value={draft.defaultPriority}
            onChange={(e) => setDraft({ ...draft, defaultPriority: e.target.value })}
          >
            {['baja', 'media', 'alta', 'urgente'].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label>
          Campos adicionales (JSON)
          <textarea
            value={draft.fields}
            onChange={(e) => setDraft({ ...draft, fields: e.target.value })}
            rows={5}
          />
        </label>
        <p>
          Ejemplo:{' '}
          <code>
            {'[{"key":"equipo","label":"Equipo","type":"text","required":true,"maxLength":120}]'}
          </code>
        </p>
        <label>
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
          />{' '}
          Servicio activo
        </label>
        {save.isError && (
          <p role="alert">
            {save.error instanceof Error ? save.error.message : 'No se pudo guardar el servicio.'}
          </p>
        )}
        {save.isSuccess && <p role="status">Servicio guardado.</p>}
        <button type="submit" disabled={save.isPending}>
          Guardar servicio
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
    </details>
  );
}
