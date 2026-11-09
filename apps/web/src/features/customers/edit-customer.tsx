import { useState } from 'react';
import type { CustomerRecord } from '@opsdesk/shared/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../app/security';
type Customer = CustomerRecord;
export function EditCustomer({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const { request } = useSession();
  const cache = useQueryClient();
  const [name, setName] = useState(customer.name),
    [email, setEmail] = useState(customer.email ?? ''),
    [phone, setPhone] = useState(customer.phone ?? ''),
    [status, setStatus] = useState(customer.status);
  const save = useMutation({
    mutationFn: () =>
      request(`/customers/${encodeURIComponent(customer.id)}`, 'PATCH', {
        name,
        email: email.trim() || null,
        phone: phone.trim() || null,
        status,
        expectedUpdatedAt: customer.updatedAt,
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['customers'] });
      onClose();
    },
    onError: () => {
      void cache.invalidateQueries({ queryKey: ['customers'] });
    },
  });
  return (
    <section className="work-section">
      <h2>Editar cliente</h2>
      <form
        className="comment-form"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <label>
          Nombre del cliente
          <input value={name} required maxLength={200} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Correo de contacto
          <input value={email} type="email" onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Teléfono de contacto
          <input value={phone} maxLength={500} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label>
          Estado del cliente
          <select
            value={status}
            onChange={(e) => {
              const value = e.target.value;
              if (value === 'activo' || value === 'inactivo') setStatus(value);
            }}
          >
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>
        </label>
        {save.isError && (
          <p role="alert">
            {save.error instanceof Error ? save.error.message : 'No se pudo actualizar el cliente.'}
          </p>
        )}
        <button className="security-button" disabled={save.isPending}>
          Guardar cliente
        </button>
        <button type="button" onClick={onClose}>
          Cancelar
        </button>
      </form>
    </section>
  );
}
