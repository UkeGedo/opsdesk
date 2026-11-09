import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/security';
export function CreateTicket() {
  const { request, session } = useSession();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const manager = ['administrador', 'supervisor'].includes(session?.user.role ?? '');
  const canCreate = manager || session?.user.role === 'cliente';
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerId, setCustomer] = useState(''),
    [categoryId, setCategory] = useState(''),
    [title, setTitle] = useState(''),
    [description, setDescription] = useState(''),
    [priority, setPriority] = useState('media');
  const customers = useQuery({
    queryKey: ['customers', 'select', customerSearch],
    queryFn: async () =>
      (await request(`/customers?limit=100&sort=name&q=${encodeURIComponent(customerSearch)}`)) as {
        data: { id: string; name: string; status: string }[];
      },
    enabled: manager,
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await request('/categories')) as { data: { id: string; name: string }[] },
    enabled: canCreate,
  });
  const create = useMutation({
    mutationFn: async () =>
      (await request('/tickets', 'POST', {
        customerId: manager ? customerId : session?.user.customerId,
        categoryId,
        title,
        description,
        priority,
      })) as { data: { id: string } },
    onSuccess: (data) => {
      void cache.invalidateQueries({ queryKey: ['tickets'] });
      navigate(`/tickets/${data.data.id}`);
    },
  });
  if (!canCreate) return null;
  return (
    <section className="work-section">
      <h2>Nueva solicitud</h2>
      <form
        className="comment-form"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        {manager && (
          <label>
            Buscar cliente
            <input
              maxLength={100}
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
            />
          </label>
        )}
        {manager && (
          <label>
            Cliente
            <select required value={customerId} onChange={(e) => setCustomer(e.target.value)}>
              <option value="">Seleccionar cliente</option>
              {customers.data?.data
                .filter((c) => c.status === 'activo')
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        {!manager && !session?.user.customerId && (
          <p role="alert">Tu cuenta no está vinculada a un cliente. Contacta al administrador.</p>
        )}
        <label>
          Categoría
          <select required value={categoryId} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Seleccionar categoría</option>
            {categories.data?.data.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {categories.isError && <p role="alert">No se pudieron cargar las categorías.</p>}
        <label>
          Asunto
          <input
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Descripción
          <textarea
            required
            maxLength={10000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
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
        {create.isError && (
          <p role="alert">
            {create.error instanceof Error ? create.error.message : 'No se pudo crear el ticket.'}
          </p>
        )}
        <button
          className="security-button"
          disabled={create.isPending || (!manager && !session?.user.customerId)}
        >
          Crear ticket
        </button>
      </form>
    </section>
  );
}
