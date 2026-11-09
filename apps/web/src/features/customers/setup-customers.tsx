import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../app/security';
export function CreateCustomer({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const { request } = useSession();
  const cache = useQueryClient();
  const [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [phone, setPhone] = useState('');
  useEffect(() => {
    onDirtyChange?.(!!(name || email || phone));
  }, [name, email, phone, onDirtyChange]);
  const create = useMutation({
    mutationFn: () =>
      request('/customers', 'POST', {
        name,
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
      }),
    onSuccess: () => {
      setName('');
      setEmail('');
      setPhone('');
      void cache.invalidateQueries({ queryKey: ['customers'] });
    },
  });
  return (
    <section className="work-section" id="registrar-cliente">
      <h2>Registrar cliente</h2>
      <form
        className="comment-form"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <label>
          Nombre
          <input required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Correo
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Teléfono
          <input maxLength={500} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        {create.isError && (
          <p role="alert">
            {create.error instanceof Error ? create.error.message : 'No se pudo registrar.'}
          </p>
        )}
        {create.isSuccess && <p role="status">Cliente registrado.</p>}
        <button className="security-button" disabled={create.isPending}>
          Registrar cliente
        </button>
      </form>
    </section>
  );
}
export function SetupCustomers({
  hideCustomer = false,
  onDirtyChange,
}: {
  hideCustomer?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { request, session } = useSession();
  const cache = useQueryClient();
  const [category, setCategory] = useState('');
  const addCategory = useMutation({
    mutationFn: () => request('/categories', 'POST', { name: category }),
    onSuccess: () => {
      setCategory('');
      void cache.invalidateQueries({ queryKey: ['categories'] });
    },
  });
  if (session?.user.role !== 'administrador') return null;
  return (
    <div className="detail-grid">
      {!hideCustomer && <CreateCustomer onDirtyChange={onDirtyChange} />}
      <section className="work-section">
        <h2>Registrar categoría de ticket</h2>
        <form
          className="comment-form"
          onSubmit={(e) => {
            e.preventDefault();
            addCategory.mutate();
          }}
        >
          <label>
            Nombre
            <input
              required
              maxLength={200}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </label>
          {addCategory.isError && (
            <p role="alert">
              {addCategory.error instanceof Error
                ? addCategory.error.message
                : 'No se pudo registrar.'}
            </p>
          )}
          {addCategory.isSuccess && <p role="status">Categoría registrada.</p>}
          <button className="security-button" disabled={addCategory.isPending}>
            Registrar categoría
          </button>
        </form>
      </section>
    </div>
  );
}
