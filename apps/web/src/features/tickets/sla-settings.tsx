import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../app/security';
import { useDirtyNavigation } from '../workspace/navigation-guard';

type Policy = {
  id: string;
  name: string;
  version: number;
  priority: string | null;
  serviceId: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
  firstResponseMs: number;
  resolutionMs: number;
  calendar: {
    timeZone: string;
    weekly: Record<string, { start: number; end: number }[]>;
    exceptions: Record<string, { start: number; end: number }[]>;
  };
  pauseStatuses: string[];
};
const initial = {
  name: '',
  serviceId: '',
  priority: '',
  timeZone: 'America/Bogota',
  start: '09:00',
  end: '17:00',
  days: [1, 2, 3, 4, 5],
  holidays: '',
  response: '4',
  resolution: '16',
  pause: true,
};
const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export function SlaSettings() {
  const { request } = useSession();
  const cache = useQueryClient();
  const [value, setValue] = useState(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editError, setEditError] = useState('');
  useDirtyNavigation(!!editingId || JSON.stringify(value) !== JSON.stringify(initial));
  const policies = useQuery({
    queryKey: ['sla-policies'],
    queryFn: async () => (await request('/service-desk/policies')) as { data: Policy[] },
  });
  const services = useQuery({
    queryKey: ['service-catalog'],
    queryFn: async () =>
      (await request('/service-desk/services')) as { data: { id: string; name: string }[] },
  });
  const create = useMutation({
    mutationFn: () =>
      request(
        editingId
          ? `/service-desk/policies/${encodeURIComponent(editingId)}/versions`
          : '/service-desk/policies',
        'POST',
        {
          name: value.name,
          serviceId: value.serviceId || null,
          priority: value.priority || null,
          effectiveFrom: new Date().toISOString(),
          effectiveUntil: null,
          firstResponseMs: Number(value.response) * 3600000,
          resolutionMs: Number(value.resolution) * 3600000,
          calendar: {
            timeZone: value.timeZone,
            weekly: Object.fromEntries(
              value.days.map((day) => [
                day,
                [{ start: minutes(value.start), end: minutes(value.end) }],
              ]),
            ),
            exceptions: Object.fromEntries(
              value.holidays
                .split(/\s+/)
                .filter(Boolean)
                .map((date) => [date, []]),
            ),
          },
          pauseStatuses: value.pause ? ['pendiente_cliente'] : [],
        },
      ),
    onSuccess: () => {
      setValue(initial);
      setEditingId(null);
      void cache.invalidateQueries({ queryKey: ['sla-policies'] });
    },
  });
  function edit(policy: Policy) {
    const entries = Object.entries(policy.calendar.weekly).filter(
      ([, intervals]) => intervals.length,
    );
    const first = entries[0]?.[1][0];
    if (
      !first ||
      entries.some(
        ([, intervals]) =>
          intervals.length !== 1 ||
          intervals[0].start !== first.start ||
          intervals[0].end !== first.end,
      ) ||
      Object.values(policy.calendar.exceptions).some((intervals) => intervals.length)
    ) {
      setEditError(
        'Este calendario contiene horarios especiales que deben editarse mediante la API.',
      );
      return;
    }
    const time = (n: number) =>
      `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
    if (first.end === 1440) {
      setEditError('Este horario de 24 horas debe editarse mediante la API.');
      return;
    }
    setEditError('');
    setEditingId(policy.id);
    setValue({
      name: policy.name,
      serviceId: policy.serviceId ?? '',
      priority: policy.priority ?? '',
      timeZone: policy.calendar.timeZone,
      start: time(first.start),
      end: time(first.end),
      days: entries.map(([day]) => Number(day)),
      holidays: Object.keys(policy.calendar.exceptions).join('\n'),
      response: String(policy.firstResponseMs / 3600000),
      resolution: String(policy.resolutionMs / 3600000),
      pause: policy.pauseStatuses.includes('pendiente_cliente'),
    });
  }
  return (
    <details className="desk-settings">
      <summary>Configurar acuerdos de servicio</summary>
      <p>
        Las políticas se aplican a los tickets creados desde su vigencia. Los tickets anteriores
        conservan su acuerdo original.
      </p>
      {policies.isError ? (
        <p role="alert">No se pudieron cargar las políticas.</p>
      ) : policies.data?.data.length ? (
        <ul>
          {policies.data.data.map((policy) => (
            <li key={policy.id}>
              {policy.name} · {policy.priority ?? 'todas las prioridades'} · versión{' '}
              {policy.version}
              {!policy.effectiveUntil && (
                <button type="button" onClick={() => edit(policy)}>
                  Nueva versión
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>No hay políticas configuradas.</p>
      )}
      {editError && <p role="alert">{editError}</p>}
      <form
        className="comment-form"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <label>
          Nombre del acuerdo
          <input
            required
            maxLength={120}
            value={value.name}
            onChange={(e) => setValue({ ...value, name: e.target.value })}
          />
        </label>
        <label>
          Servicio aplicable
          <select
            value={value.serviceId}
            disabled={!!editingId}
            onChange={(e) => setValue({ ...value, serviceId: e.target.value })}
          >
            <option value="">Todos los servicios</option>
            {services.data?.data.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Prioridad aplicable
          <select
            value={value.priority}
            disabled={!!editingId}
            onChange={(e) => setValue({ ...value, priority: e.target.value })}
          >
            <option value="">Todas</option>
            <option value="baja">Baja</option>
            <option value="media">Media</option>
            <option value="alta">Alta</option>
            <option value="urgente">Urgente</option>
          </select>
        </label>
        <label>
          Zona horaria
          <input
            required
            value={value.timeZone}
            onChange={(e) => setValue({ ...value, timeZone: e.target.value })}
          />
        </label>
        <fieldset>
          <legend>Días de atención</legend>
          {days.map((day, index) => (
            <label key={day}>
              <input
                type="checkbox"
                checked={value.days.includes(index)}
                onChange={(e) =>
                  setValue({
                    ...value,
                    days: e.target.checked
                      ? [...value.days, index]
                      : value.days.filter((d) => d !== index),
                  })
                }
              />{' '}
              {day}
            </label>
          ))}
        </fieldset>
        <label>
          Hora de inicio
          <input
            type="time"
            required
            value={value.start}
            onChange={(e) => setValue({ ...value, start: e.target.value })}
          />
        </label>
        <label>
          Hora de cierre
          <input
            type="time"
            required
            value={value.end}
            onChange={(e) => setValue({ ...value, end: e.target.value })}
          />
        </label>
        <label>
          Festivos sin atención (una fecha AAAA-MM-DD por línea)
          <textarea
            value={value.holidays}
            onChange={(e) => setValue({ ...value, holidays: e.target.value })}
          />
        </label>
        <label>
          Primera respuesta: horas laborales
          <input
            type="number"
            min="1"
            max="2160"
            required
            value={value.response}
            onChange={(e) => setValue({ ...value, response: e.target.value })}
          />
        </label>
        <label>
          Resolución: horas laborales
          <input
            type="number"
            min="1"
            max="2160"
            required
            value={value.resolution}
            onChange={(e) => setValue({ ...value, resolution: e.target.value })}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={value.pause}
            onChange={(e) => setValue({ ...value, pause: e.target.checked })}
          />{' '}
          Pausar cuando esté pendiente del cliente
        </label>
        {create.isError && (
          <p role="alert">
            {create.error instanceof Error
              ? create.error.message
              : 'No se pudo guardar la política.'}
          </p>
        )}
        {create.isSuccess && <p role="status">Política creada.</p>}
        <button
          className="security-button"
          disabled={
            create.isPending || !value.days.length || minutes(value.start) >= minutes(value.end)
          }
        >
          {editingId ? 'Guardar nueva versión' : 'Guardar política'}
        </button>
        {editingId && (
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setValue(initial);
            }}
          >
            Cancelar edición
          </button>
        )}
      </form>
    </details>
  );
}
