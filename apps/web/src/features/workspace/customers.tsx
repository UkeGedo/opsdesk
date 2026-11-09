import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { EditCustomer } from '../customers/edit-customer';
import { useSession } from '../../app/security';
import { CreateCustomer, SetupCustomers } from '../customers/setup-customers';
import { type Customer, type List, ErrorBox, LoadingRows } from './shared';
import { Surface } from './surface';
import { RowActions } from './row-actions';
import { useViewState } from './workspace-memory';
export function Customers() {
  const { request, session } = useSession();
  const location = useLocation();
  const [search, setSearch] = useViewState(
    'customers.search',
    () => new URLSearchParams(location.search).get('q') ?? '',
  );
  useEffect(() => {
    const incoming = new URLSearchParams(location.search).get('q');
    if (incoming !== null) setSearch(incoming);
  }, [location.search, setSearch]);
  useEffect(() => {
    if (location.hash === '#registrar-cliente')
      document.getElementById('registrar-cliente')?.scrollIntoView();
  }, [location.hash]);
  const [page, setPage] = useViewState('customers.page', 1);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [viewing, setViewing] = useState<Customer | null>(null);
  const [dirty, setDirty] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDirty, setCreateDirty] = useState(false);
  const query = useQuery({
    queryKey: ['customers', search, page],
    queryFn: async () =>
      (await request(
        `/customers?limit=20&sort=name&page=${page}${search ? '&q=' + encodeURIComponent(search) : ''}`,
      )) as List<Customer>,
    enabled: !!session && ['administrador', 'supervisor'].includes(session.user.role),
  });
  if (session && !['administrador', 'supervisor'].includes(session.user.role))
    return <Navigate to="/denegado" replace />;
  return (
    <>
      <div className="work-heading">
        <div>
          <div className="work-overline">RELACIONES / ORGANIZACIONES</div>
          <h1>Clientes</h1>
          <p>La información de contacto de las organizaciones atendidas.</p>
        </div>
        {session?.user.role === 'administrador' && (
          <button
            type="button"
            className="security-button"
            onClick={() => {
              if (
                createDirty &&
                !window.confirm(
                  'Hay un cliente sin guardar. ¿Descartar los cambios y abrir una nueva ventana?',
                )
              )
                return;
              setCreateDirty(false);
              setCreateOpen(true);
            }}
          >
            Registrar cliente en ventana
          </button>
        )}
      </div>
      <section className="work-section">
        <div className="section-bar">
          <div>
            <h2>Directorio de clientes</h2>
            <p>{query.data ? `${query.data.meta.total} resultados` : 'Clientes registrados'}</p>
          </div>
          <label className="work-search">
            <Search size={17} />
            <span className="sr-only">Buscar clientes</span>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar nombre o identificación"
            />
          </label>
        </div>
        {query.isPending ? (
          <LoadingRows label="Cargando clientes…" />
        ) : query.error ? (
          <ErrorBox error={query.error} />
        ) : query.data?.data.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Correo</th>
                  <th>Teléfono</th>
                  <th>Estado</th>
                  {session?.user.role === 'administrador' && <th>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {query.data.data.map((c) => (
                  <tr key={c.id}>
                    <td className="table-title">
                      <button type="button" className="customer-view" onClick={() => setViewing(c)}>
                        {c.name}
                      </button>
                    </td>
                    <td>{c.email || '—'}</td>
                    <td>{c.phone || '—'}</td>
                    <td>
                      <span className="work-badge">{c.status}</span>
                    </td>
                    {session?.user.role === 'administrador' && (
                      <td>
                        <RowActions label={`Acciones de ${c.name}`}>
                          <button type="button" onClick={() => setViewing(c)}>
                            Ver ficha
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDirty(false);
                              setEditing(c);
                            }}
                          >
                            Editar cliente
                          </button>
                        </RowActions>{' '}
                        <button
                          type="button"
                          onClick={() => {
                            setDirty(false);
                            setEditing(c);
                          }}
                          aria-label={`Editar ${c.name}`}
                        >
                          Editar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="work-empty">
            <strong>No hay clientes para mostrar.</strong>
            <p>Los clientes registrados aparecerán aquí.</p>
          </div>
        )}
        {query.data && query.data.meta.total > query.data.meta.limit && (
          <nav aria-label="Paginación de clientes">
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Anterior
            </button>
            <span>
              {' '}
              Página {page} · {query.data.meta.total} resultados{' '}
            </span>
            <button
              type="button"
              disabled={page * query.data.meta.limit >= query.data.meta.total}
              onClick={() => setPage(page + 1)}
            >
              Siguiente
            </button>
          </nav>
        )}
      </section>
      {editing && (
        <Surface title="Editar cliente" dirty={dirty} onClose={() => setEditing(null)}>
          <EditCustomer
            key={editing.id}
            customer={editing}
            onClose={() => setEditing(null)}
            onSaved={() => setEditing(null)}
            onDirtyChange={setDirty}
            hideCancel
          />
        </Surface>
      )}
      {viewing && (
        <Surface title="Ficha de cliente" drawer onClose={() => setViewing(null)}>
          <h3>{viewing.name}</h3>
          <p>Correo: {viewing.email || 'No registrado'}</p>
          <p>Teléfono: {viewing.phone || 'No registrado'}</p>
          <p>Estado: {viewing.status}</p>
        </Surface>
      )}
      <SetupCustomers hideCustomer={createOpen} onDirtyChange={setCreateDirty} />
      {createOpen && (
        <Surface title="Registrar cliente" dirty={createDirty} onClose={() => setCreateOpen(false)}>
          <CreateCustomer onDirtyChange={setCreateDirty} />
        </Surface>
      )}
    </>
  );
}
