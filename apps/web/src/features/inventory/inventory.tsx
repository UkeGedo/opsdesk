import { ProductCatalog } from './product-catalog';
import { Assets } from './assets';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../app/security';
import { useDirtyNavigation } from '../workspace/navigation-guard';
import { useViewState } from '../workspace/workspace-memory';
type Product = { id: string; name: string; unit: string; minimum: number };
type Location = { id: string; name: string };
type Stock = {
  id: string;
  productId: string;
  locationId: string;
  quantity: number;
  productName: string;
  locationName: string;
  minimum: number;
};
type Movement = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  kind: string;
  reason: string;
  createdAt: string;
};
export function Inventory() {
  const { request, session } = useSession();
  const cache = useQueryClient();
  const manager = ['administrador', 'supervisor'].includes(session?.user.role ?? '');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('unidad');
  const [minimum, setMinimum] = useState(0);
  const [locationName, setLocationName] = useState('');
  const [productSearch, setProductSearch] = useViewState('inventory.productSearch', ''),
    [locationSearch, setLocationSearch] = useViewState('inventory.locationSearch', '');
  const [product, setProduct] = useState('');
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [kind, setKind] = useState(manager ? 'entrada' : 'salida');
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const [ticket, setTicket] = useState('');
  const movementBaseline = useRef({
    product: '',
    source: '',
    destination: '',
    kind: manager ? 'entrada' : 'salida',
  });
  const movementChanged =
    product !== movementBaseline.current.product ||
    source !== movementBaseline.current.source ||
    destination !== movementBaseline.current.destination ||
    kind !== movementBaseline.current.kind;
  useDirtyNavigation(
    !!(
      name ||
      locationName ||
      reason ||
      ticket ||
      minimum ||
      quantity !== 1 ||
      unit !== 'unidad' ||
      movementChanged
    ),
  );
  const [stockPage, setStockPage] = useViewState('inventory.stockPage', 1),
    [movementPage, setMovementPage] = useViewState('inventory.movementPage', 1);
  const key = useRef(crypto.randomUUID());
  const products = useQuery({
    queryKey: ['inventory', 'products'],
    queryFn: async () => (await request('/inventory/products')) as { data: Product[] },
  });
  const locations = useQuery({
    queryKey: ['inventory', 'locations'],
    queryFn: async () => (await request('/inventory/locations')) as { data: Location[] },
  });
  const productOptions = useQuery({
    queryKey: ['inventory', 'product-options', productSearch],
    queryFn: async () =>
      (await request(`/inventory/products?q=${encodeURIComponent(productSearch)}`)) as {
        data: Product[];
      },
  });
  const locationOptions = useQuery({
    queryKey: ['inventory', 'location-options', locationSearch],
    queryFn: async () =>
      (await request(`/inventory/locations?q=${encodeURIComponent(locationSearch)}`)) as {
        data: Location[];
      },
  });
  const stock = useQuery({
    queryKey: ['inventory', 'stock', stockPage],
    queryFn: async () =>
      (await request(`/inventory/stock?page=${stockPage}&limit=20`)) as {
        data: Stock[];
        meta: { total: number; limit: number };
      },
  });
  const movements = useQuery({
    queryKey: ['inventory', 'movements', movementPage],
    queryFn: async () =>
      (await request(`/inventory/movements?page=${movementPage}&limit=20`)) as {
        data: Movement[];
        meta: { total: number; limit: number };
      },
  });
  const refresh = () => void cache.invalidateQueries({ queryKey: ['inventory'] });
  const addProduct = useMutation({
    mutationFn: () => request('/inventory/products', 'POST', { name, unit, minimum }),
    onSuccess: () => {
      setName('');
      setMinimum(0);
      setUnit('unidad');
      refresh();
    },
  });
  const addLocation = useMutation({
    mutationFn: () => request('/inventory/locations', 'POST', { name: locationName }),
    onSuccess: () => {
      setLocationName('');
      refresh();
    },
  });
  const move = useMutation({
    mutationFn: () =>
      request('/inventory/movements', 'POST', {
        requestId: key.current,
        productId: product,
        kind,
        quantity,
        reason,
        ...(!['entrada', 'ajuste_entrada'].includes(kind) ? { sourceId: source } : {}),
        ...(!['salida', 'ajuste_salida'].includes(kind) ? { destinationId: destination } : {}),
        ...(ticket ? { ticketId: ticket } : {}),
      }),
    onSuccess: () => {
      key.current = crypto.randomUUID();
      movementBaseline.current = { product, source, destination, kind };
      setReason('');
      setTicket('');
      setQuantity(1);
      refresh();
    },
  });
  if (!session || session.user.role === 'cliente')
    return <div className="work-empty">No tiene acceso al inventario.</div>;
  const errors = [products.error, locations.error, stock.error, movements.error];
  return (
    <>
      <div className="work-heading">
        <div>
          <div className="work-overline">OPERACIONES / RECURSOS</div>
          <h1>Inventario</h1>
          <p>Existencias, ubicaciones y movimientos de materiales.</p>
        </div>
      </div>
      {errors.some(Boolean) && <p role="alert">No se pudo cargar el inventario.</p>}
      {(products.isPending || locations.isPending || stock.isPending) && (
        <p role="status">Cargando inventario…</p>
      )}
      <section className="work-section">
        <h2>Existencias por ubicación</h2>
        {stock.data?.data.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Ubicación</th>
                  <th>Cantidad</th>
                  <th>Mínimo del producto</th>
                </tr>
              </thead>
              <tbody>
                {stock.data.data.map((s) => (
                  <tr key={s.id}>
                    <td>{s.productName}</td>
                    <td>{s.locationName}</td>
                    <td>{s.quantity}</td>
                    <td>{s.minimum}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Aún no hay existencias registradas.</p>
        )}
      </section>
      {stock.data && (
        <div aria-label="Paginación de existencias">
          <button
            type="button"
            disabled={stockPage <= 1}
            onClick={() => setStockPage(stockPage - 1)}
          >
            Anterior
          </button>
          <span>
            {' '}
            Página {stockPage} · {stock.data.meta.total} registros{' '}
          </span>
          <button
            type="button"
            disabled={stockPage * stock.data.meta.limit >= stock.data.meta.total}
            onClick={() => setStockPage(stockPage + 1)}
          >
            Siguiente
          </button>
        </div>
      )}
      {manager && (
        <div className="detail-grid">
          <section className="work-section">
            <h2>Nuevo producto</h2>
            <form
              className="comment-form"
              onSubmit={(e) => {
                e.preventDefault();
                addProduct.mutate();
              }}
            >
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
                  min="0"
                  max="1000000"
                  required
                  value={minimum}
                  onChange={(e) => setMinimum(Number(e.target.value))}
                />
              </label>
              {addProduct.isError && <p role="alert">No se pudo crear el producto.</p>}
              <button className="security-button" disabled={addProduct.isPending}>
                Crear producto
              </button>
            </form>
          </section>
          <section className="work-section">
            <h2>Nueva ubicación</h2>
            <form
              className="comment-form"
              onSubmit={(e) => {
                e.preventDefault();
                addLocation.mutate();
              }}
            >
              <label>
                Nombre
                <input
                  required
                  maxLength={120}
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                />
              </label>
              {addLocation.isError && <p role="alert">No se pudo crear la ubicación.</p>}
              <button className="security-button" disabled={addLocation.isPending}>
                Crear ubicación
              </button>
            </form>
          </section>
        </div>
      )}
      <section className="work-section">
        <h2>Registrar movimiento</h2>
        <form
          className="comment-form"
          onSubmit={(e) => {
            e.preventDefault();
            move.mutate();
          }}
        >
          <label>
            Filtrar materiales
            <input
              maxLength={120}
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
          </label>
          <label>
            Filtrar ubicaciones
            <input
              maxLength={120}
              value={locationSearch}
              onChange={(e) => setLocationSearch(e.target.value)}
            />
          </label>
          <label>
            Producto
            <select required value={product} onChange={(e) => setProduct(e.target.value)}>
              <option value="">Seleccionar</option>
              {productOptions.data?.data.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.unit})
                </option>
              ))}
            </select>
          </label>
          <label>
            Tipo
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setTicket('');
              }}
            >
              {manager && <option value="entrada">Entrada</option>}
              <option value="salida">Salida</option>
              {manager && <option value="transferencia">Transferencia</option>}
              {manager && <option value="ajuste_entrada">Ajuste positivo</option>}
              {manager && <option value="ajuste_salida">Ajuste negativo</option>}
            </select>
          </label>
          {!['entrada', 'ajuste_entrada'].includes(kind) && (
            <label>
              Origen
              <select required value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="">Seleccionar</option>
                {locationOptions.data?.data.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!['salida', 'ajuste_salida'].includes(kind) && (
            <label>
              Destino
              <select required value={destination} onChange={(e) => setDestination(e.target.value)}>
                <option value="">Seleccionar</option>
                {locationOptions.data?.data.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {kind === 'salida' && (
            <label>
              Identificador del ticket {!manager && '(obligatorio)'}
              <input
                required={!manager}
                value={ticket}
                onChange={(e) => setTicket(e.target.value)}
              />
            </label>
          )}
          <label>
            Cantidad
            <input
              type="number"
              required
              min="1"
              max="1000000"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </label>
          <label>
            Motivo
            <input
              required
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {move.isError && (
            <p role="alert">
              {move.error instanceof Error
                ? move.error.message
                : 'No se pudo guardar el movimiento.'}
            </p>
          )}
          {move.isSuccess && <p role="status">Movimiento registrado.</p>}
          <button className="security-button" disabled={move.isPending}>
            {move.isPending ? 'Guardando…' : 'Guardar movimiento'}
          </button>
        </form>
      </section>
      <section className="work-section">
        <h2>Últimos movimientos</h2>
        {movements.data?.data.length ? (
          <ul>
            {movements.data.data.map((m) => (
              <li key={m.id}>
                {m.kind}: {m.quantity} · {m.productName} · {m.reason} ·{' '}
                {new Date(m.createdAt).toLocaleString('es-CO')}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Aún no hay movimientos.</p>
        )}
      </section>
      {movements.data && (
        <div aria-label="Paginación de movimientos">
          <button
            type="button"
            disabled={movementPage <= 1}
            onClick={() => setMovementPage(movementPage - 1)}
          >
            Anterior
          </button>
          <span>
            {' '}
            Página {movementPage} · {movements.data.meta.total} movimientos{' '}
          </span>
          <button
            type="button"
            disabled={movementPage * movements.data.meta.limit >= movements.data.meta.total}
            onClick={() => setMovementPage(movementPage + 1)}
          >
            Siguiente
          </button>
        </div>
      )}
      <ProductCatalog />
      <Assets />
    </>
  );
}
