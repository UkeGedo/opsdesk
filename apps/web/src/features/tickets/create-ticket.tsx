import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/security';
import { useDirtyNavigation } from '../workspace/navigation-guard';
import { levels, type Level, type MatrixResponse } from './priority-matrix';
type Field = { key: string; label: string; required: boolean } & (
  { type: 'text'; maxLength: number } | { type: 'select'; options: string[] } | { type: 'boolean' }
);
type Service = {
  id: string;
  name: string;
  categoryId: string;
  active: boolean;
  defaultPriority: string;
  form: { version: number; fields: Field[] };
};
export function CreateTicket({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void } = {}) {
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
  const [serviceId, setServiceId] = useState('');
  const [requestType, setRequestType] = useState('incidente');
  const [customFields, setCustomFields] = useState<Record<string, string | boolean>>({});
  const [impact, setImpact] = useState<Level | ''>('');
  const [urgency, setUrgency] = useState<Level | ''>('');
  const clearGuard = useDirtyNavigation(
    !!(
      customerId ||
      categoryId ||
      title ||
      description ||
      priority !== 'media' ||
      serviceId ||
      impact ||
      urgency
    ),
  );
  useEffect(() => {
    onDirtyChange?.(
      !!(
        customerId ||
        categoryId ||
        title ||
        description ||
        priority !== 'media' ||
        serviceId ||
        impact ||
        urgency
      ),
    );
  }, [
    customerId,
    categoryId,
    title,
    description,
    priority,
    serviceId,
    impact,
    urgency,
    onDirtyChange,
  ]);
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
  const services = useQuery({
    queryKey: ['service-catalog'],
    queryFn: async () => (await request('/service-desk/services')) as { data: Service[] },
    enabled: canCreate,
  });
  const selectedService = services.data?.data.find((service) => service.id === serviceId);
  const matrix = useQuery({
    queryKey: ['priority-matrix'],
    queryFn: async () => (await request('/service-desk/priority-matrix')) as MatrixResponse,
    enabled: canCreate,
  });
  const calculated = impact && urgency ? matrix.data?.data?.matrix[impact][urgency] : undefined;
  const create = useMutation({
    mutationFn: async () =>
      (await request('/tickets', 'POST', {
        customerId: manager ? customerId : session?.user.customerId,
        categoryId,
        title,
        description,
        priority,
        ...(serviceId ? { serviceId, requestType, customFields } : {}),
        ...(impact && urgency ? { impact, urgency } : {}),
      })) as { data: { id: string } },
    onSuccess: (data) => {
      clearGuard();
      void cache.invalidateQueries({ queryKey: ['tickets'] });
      navigate(`/tickets/${data.data.id}`);
    },
  });
  if (!canCreate) return null;
  return (
    <section className="work-section" id="nueva-solicitud">
      <h2>Nueva solicitud</h2>
      <form
        className="comment-form"
        onChangeCapture={() => onDirtyChange?.(true)}
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
          <select
            required
            value={categoryId}
            onChange={(e) => {
              setCategory(e.target.value);
              setServiceId('');
              setCustomFields({});
            }}
          >
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
          Servicio
          <select
            value={serviceId}
            onChange={(e) => {
              const service = services.data?.data.find((item) => item.id === e.target.value);
              setServiceId(e.target.value);
              setCustomFields({});
              if (service) setPriority(service.defaultPriority);
            }}
          >
            <option value="">Sin servicio específico</option>
            {services.data?.data
              .filter((service) => service.active && service.categoryId === categoryId)
              .map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
          </select>
        </label>
        {services.isError && <p role="alert">No se pudo cargar el catálogo de servicios.</p>}
        {selectedService && (
          <>
            <label>
              Tipo de solicitud
              <select value={requestType} onChange={(e) => setRequestType(e.target.value)}>
                <option value="incidente">Incidente</option>
                <option value="solicitud">Solicitud de servicio</option>
                <option value="consulta">Consulta</option>
                <option value="operativo">Requerimiento operativo</option>
              </select>
            </label>
            {selectedService.form.fields.map((field) => (
              <label key={field.key}>
                {field.label}
                {field.type === 'text' ? (
                  <input
                    required={field.required}
                    maxLength={field.maxLength}
                    value={String(customFields[field.key] ?? '')}
                    onChange={(e) =>
                      setCustomFields({ ...customFields, [field.key]: e.target.value })
                    }
                  />
                ) : field.type === 'select' ? (
                  <select
                    required={field.required}
                    value={String(customFields[field.key] ?? '')}
                    onChange={(e) =>
                      setCustomFields({ ...customFields, [field.key]: e.target.value })
                    }
                  >
                    <option value="">Seleccionar</option>
                    {field.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    required={field.required}
                    value={
                      customFields[field.key] === undefined ? '' : String(customFields[field.key])
                    }
                    onChange={(e) => {
                      const next = { ...customFields };
                      if (e.target.value === '') delete next[field.key];
                      else next[field.key] = e.target.value === 'true';
                      setCustomFields(next);
                    }}
                  >
                    <option value="">Seleccionar</option>
                    <option value="true">Sí</option>
                    <option value="false">No</option>
                  </select>
                )}
              </label>
            ))}
          </>
        )}
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
        {matrix.data?.data && <p>Prioridad calculada al indicar impacto y urgencia.</p>}
        {matrix.data?.data && (
          <>
            <label>
              Impacto
              <select value={impact} onChange={(e) => setImpact(e.target.value as Level | '')}>
                <option value="">Sin calcular</option>
                {levels.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Urgencia
              <select value={urgency} onChange={(e) => setUrgency(e.target.value as Level | '')}>
                <option value="">Sin calcular</option>
                {levels.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
            {calculated && (
              <p>
                Impacto {impact} y urgencia {urgency}: prioridad {calculated}.
              </p>
            )}
          </>
        )}
        <label>
          Prioridad
          <select
            value={calculated ?? priority}
            disabled={!!calculated}
            onChange={(e) => setPriority(e.target.value)}
          >
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
          disabled={
            create.isPending || (!manager && !session?.user.customerId) || !!impact !== !!urgency
          }
        >
          Crear ticket
        </button>
      </form>
    </section>
  );
}
