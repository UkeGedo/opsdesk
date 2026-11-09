import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from './security';
type Product = { id: string; name: string; unit: string; minimum: number; updatedAt: string };
type LowProduct = Product & { quantity: number };
export function ProductCatalog() {
  const { request, session } = useSession();
  const cache = useQueryClient();
  const manager = ['administrador', 'supervisor'].includes(session?.user.role ?? '');
  const [page, setPage] = useState(1);
  const [lowPage, setLowPage] = useState(1);
  const [version, setVersion] = useState('');
  const [q, setQ] = useState(''),
    [selected, setSelected] = useState(''),
    [name, setName] = useState(''),
    [unit, setUnit] = useState(''),
    [minimum, setMinimum] = useState(0);
  const products = useQuery({
    queryKey: ['catalog', q, page],
    queryFn: async () =>
      (await request(`/inventory/products?q=${encodeURIComponent(q)}&page=${page}&limit=20`)) as {
        data: Product[];
        meta: { total: number; limit: number };
      },
  });
  const low = useQuery({
    queryKey: ['inventory', 'low-stock', lowPage],
    queryFn: async () =>
      (await request(`/inventory/low-stock?page=${lowPage}&limit=20`)) as {
        data: LowProduct[];
        meta: { total: number; limit: number };
      },
  });
  const edit = useMutation({
    mutationFn: () =>
      request(`/inventory/products/${encodeURIComponent(selected)}`, 'PATCH', {
        name,
        unit,
        minimum,
        expectedUpdatedAt: version,
      }),
    onSuccess: () => {
      setSelected('');
      void cache.invalidateQueries({ queryKey: ['catalog'] });
      void cache.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
  return (
    <section className="work-section">
      <h2>Catálogo y existencias bajas</h2>
      {low.isError ? (
        <p role="alert">No se pudieron consultar los mínimos.</p>
      ) : (
        <p>{low.data?.meta.total ?? 0} productos bajo el mínimo total entre ubicaciones.</p>
      )}
      {low.data?.data.map((p) => (
        <p key={p.id}>
          <strong>{p.name}</strong>: {p.quantity} {p.unit}; mínimo {p.minimum}.
        </p>
      ))}
      {low.data && (
        <div aria-label="Paginación de existencias bajas">
          <button type="button" disabled={lowPage <= 1} onClick={() => setLowPage(lowPage - 1)}>
            Anterior
          </button>
          <span> Página {lowPage} </span>
          <button
            type="button"
            disabled={lowPage * low.data.meta.limit >= low.data.meta.total}
            onClick={() => setLowPage(lowPage + 1)}
          >
            Siguiente
          </button>
        </div>
      )}
      <label>
        Buscar producto
        <input
          value={q}
          maxLength={120}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
      </label>
      {products.isError ? (
        <p role="alert">No se pudo cargar el catálogo.</p>
      ) : products.isPending ? (
        <p role="status">Cargando…</p>
      ) : products.data?.data.length ? (
        <ul>
          {products.data.data.map((p) => (
            <li key={p.id}>
              {p.name} · {p.unit} · mínimo {p.minimum}{' '}
              {manager && (
                <button
                  type="button"
                  onClick={() => {
                    setSelected(p.id);
                    setVersion(p.updatedAt);
                    setName(p.name);
                    setUnit(p.unit);
                    setMinimum(p.minimum);
                  }}
                >
                  Editar
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>No hay productos que coincidan.</p>
      )}
      {products.data && (
        <div aria-label="Paginación del catálogo">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Anterior
          </button>
          <span>
            {' '}
            Página {page} · {products.data.meta.total} productos{' '}
          </span>
          <button
            type="button"
            disabled={page * products.data.meta.limit >= products.data.meta.total}
            onClick={() => setPage(page + 1)}
          >
            Siguiente
          </button>
        </div>
      )}
      {selected && manager && (
        <form
          className="comment-form"
          onSubmit={(e) => {
            e.preventDefault();
            edit.mutate();
          }}
        >
          <h3>Editar producto</h3>
          <label>
            Nombre
            <input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Unidad
            <input
              required
              maxLength={120}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
          </label>
          <label>
            Stock mínimo
            <input
              type="number"
              required
              min="0"
              max="1000000"
              value={minimum}
              onChange={(e) => setMinimum(Number(e.target.value))}
            />
          </label>
          {edit.isError && (
            <p role="alert">
              {edit.error instanceof Error
                ? edit.error.message
                : 'No se pudo actualizar el producto.'}
            </p>
          )}
          <button className="security-button" disabled={edit.isPending}>
            Guardar producto
          </button>
          <button type="button" onClick={() => setSelected('')}>
            Cancelar
          </button>
        </form>
      )}
    </section>
  );
}
