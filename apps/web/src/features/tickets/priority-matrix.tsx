import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../app/security';
import { useDirtyNavigation } from '../workspace/navigation-guard';
export const levels = ['baja', 'media', 'alta', 'urgente'] as const;
export type Level = (typeof levels)[number];
export type Matrix = Record<Level, Record<Level, Level>>;
export type MatrixResponse = { data: { version: number; matrix: Matrix } | null };
export function PriorityMatrix() {
  const { request } = useSession();
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ['priority-matrix'],
    queryFn: async () => (await request('/service-desk/priority-matrix')) as MatrixResponse,
  });
  const [draft, setDraft] = useState<Matrix | null>(null);
  const [expectedVersion, setExpectedVersion] = useState<number | null>(null);
  useDirtyNavigation(!!draft);
  const save = useMutation({
    mutationFn: () =>
      request('/service-desk/priority-matrix', 'POST', { matrix: draft, expectedVersion }),
    onSuccess: () => {
      setDraft(null);
      void cache.invalidateQueries({ queryKey: ['priority-matrix'] });
    },
  });
  function start() {
    const suggested = Object.fromEntries(
      levels.map((impact, i) => [
        impact,
        Object.fromEntries(levels.map((urgency, j) => [urgency, levels[Math.max(i, j)]])),
      ]),
    ) as Matrix;
    setDraft(structuredClone(query.data?.data?.matrix ?? suggested));
    setExpectedVersion(query.data?.data?.version ?? null);
  }
  return (
    <details className="desk-settings">
      <summary>Matriz de impacto y urgencia</summary>
      <p>
        La prioridad se calcula con la matriz vigente al crear el ticket. Las versiones anteriores
        quedan en su historial.
      </p>
      {query.isError ? (
        <p role="alert">No se pudo cargar la matriz.</p>
      ) : (
        <p>
          {query.data?.data
            ? `Versión vigente: ${query.data.data.version}`
            : 'Aún no hay matriz configurada.'}
        </p>
      )}
      {!draft && (
        <button type="button" disabled={query.isPending} onClick={start}>
          {query.data?.data ? 'Editar matriz' : 'Configurar matriz'}
        </button>
      )}
      {draft && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <table>
            <caption>Prioridad resultante por impacto y urgencia</caption>
            <thead>
              <tr>
                <th>Impacto / urgencia</th>
                {levels.map((level) => (
                  <th key={level}>{level}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {levels.map((impact) => (
                <tr key={impact}>
                  <th>{impact}</th>
                  {levels.map((urgency) => (
                    <td key={urgency}>
                      <label>
                        <span className="sr-only">
                          Impacto {impact}, urgencia {urgency}
                        </span>
                        <select
                          value={draft[impact][urgency]}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              [impact]: {
                                ...draft[impact],
                                [urgency]: event.target.value as Level,
                              },
                            })
                          }
                        >
                          {levels.map((level) => (
                            <option key={level} value={level}>
                              {level}
                            </option>
                          ))}
                        </select>
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {save.isError && (
            <p role="alert">
              {save.error instanceof Error ? save.error.message : 'No se pudo guardar.'}
            </p>
          )}
          <button type="submit" disabled={save.isPending}>
            Guardar matriz
          </button>
          <button type="button" onClick={() => setDraft(null)}>
            Cancelar edición
          </button>
        </form>
      )}
    </details>
  );
}
