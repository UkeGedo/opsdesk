import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../app/security';
import { useDirtyNavigation } from '../workspace/navigation-guard';
export function TicketMaterials({
  ticketId,
  status,
  archived,
}: {
  ticketId: string;
  status: string;
  archived: boolean;
}) {
  const { request, session } = useSession();
  const cache = useQueryClient();
  const enabled =
    !!session &&
    session.user.role !== 'cliente' &&
    !archived &&
    !['resuelto', 'cerrado'].includes(status);
  const [productSearch, setProductSearch] = useState(''),
    [locationSearch, setLocationSearch] = useState('');
  const [productId, setProduct] = useState(''),
    [locationId, setLocation] = useState(''),
    [quantity, setQuantity] = useState(1),
    [reason, setReason] = useState('');
  const savedSelection = useRef({ productId: '', locationId: '' });
  useDirtyNavigation(
    !!reason ||
      quantity !== 1 ||
      productId !== savedSelection.current.productId ||
      locationId !== savedSelection.current.locationId,
  );
  const key = useRef(crypto.randomUUID());
  const products = useQuery({
    queryKey: ['inventory', 'product-options', productSearch],
    queryFn: async () =>
      (await request(`/inventory/products?q=${encodeURIComponent(productSearch)}`)) as {
        data: { id: string; name: string; unit: string }[];
      },
    enabled,
  });
  const locations = useQuery({
    queryKey: ['inventory', 'location-options', locationSearch],
    queryFn: async () =>
      (await request(`/inventory/locations?q=${encodeURIComponent(locationSearch)}`)) as {
        data: { id: string; name: string }[];
      },
    enabled,
  });
  const consume = useMutation({
    mutationFn: () =>
      request('/inventory/movements', 'POST', {
        requestId: key.current,
        productId,
        sourceId: locationId,
        ticketId,
        kind: 'salida',
        quantity,
        reason,
      }),
    onSuccess: () => {
      key.current = crypto.randomUUID();
      savedSelection.current = { productId, locationId };
      setReason('');
      setQuantity(1);
      void cache.invalidateQueries({ queryKey: ['history', ticketId] });
      void cache.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
  if (!enabled) return null;
  return (
    <section>
      <h2>Materiales utilizados</h2>
      <form
        className="comment-form"
        onSubmit={(e) => {
          e.preventDefault();
          consume.mutate();
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
          Material
          <select required value={productId} onChange={(e) => setProduct(e.target.value)}>
            <option value="">Seleccionar</option>
            {products.data?.data.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.unit}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ubicación de origen
          <select required value={locationId} onChange={(e) => setLocation(e.target.value)}>
            <option value="">Seleccionar</option>
            {locations.data?.data.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Cantidad
          <input
            type="number"
            min="1"
            max="1000000"
            required
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
        {(products.isError || locations.isError) && (
          <p role="alert">No se pudieron cargar los materiales o ubicaciones.</p>
        )}
        {consume.isError && (
          <p role="alert">
            {consume.error instanceof Error
              ? consume.error.message
              : 'No se pudo registrar el consumo.'}
          </p>
        )}
        {consume.isSuccess && <p role="status">Consumo registrado.</p>}
        <button className="security-button" disabled={consume.isPending}>
          Registrar consumo
        </button>
      </form>
    </section>
  );
}
