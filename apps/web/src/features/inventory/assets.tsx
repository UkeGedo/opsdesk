import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../app/security';
import { Link, useLocation } from 'react-router-dom';
import { Surface } from '../workspace/surface';
import { useDirtyNavigation } from '../workspace/navigation-guard';
import { RowActions } from '../workspace/row-actions';
type Asset = {
  id: string;
  name: string;
  serial: string;
  locationId: string;
  assignedTo: string | null;
  ticketId: string | null;
  updatedAt: string;
};
export function Assets() {
  const location = useLocation();
  const { request, session } = useSession();
  const cache = useQueryClient();
  const manager = ['administrador', 'supervisor'].includes(session?.user.role ?? '');
  const [techSearch, setTechSearch] = useState(''),
    [locationSearch, setLocationSearch] = useState('');
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(() => new URLSearchParams(location.search).get('q') ?? '');
  useEffect(() => {
    setSearch(new URLSearchParams(location.search).get('q') ?? '');
  }, [location.search]);
  useEffect(() => {
    if (location.hash === '#equipos') document.getElementById('equipos')?.scrollIntoView();
  }, [location.hash]);
  const [name, setName] = useState(''),
    [serial, setSerial] = useState(''),
    [locationId, setLocation] = useState(''),
    [assigneeId, setAssignee] = useState(''),
    [ticketId, setTicket] = useState(''),
    [reason, setReason] = useState(''),
    [selected, setSelected] = useState('');
  useDirtyNavigation(!!(name || serial || locationId || assigneeId || ticketId || reason));
  const assets = useQuery({
    queryKey: ['inventory', 'assets', page, search],
    queryFn: async () =>
      (await request(
        `/inventory/assets?page=${page}&limit=20&q=${encodeURIComponent(search)}`,
      )) as { data: Asset[]; meta: { total: number; limit: number } },
  });
  const locations = useQuery({
    queryKey: ['inventory', 'locations', locationSearch],
    queryFn: async () =>
      (await request(`/inventory/locations?q=${encodeURIComponent(locationSearch)}`)) as {
        data: { id: string; name: string }[];
      },
  });
  const tech = useQuery({
    queryKey: ['technicians', techSearch],
    queryFn: async () =>
      (await request(`/technicians?q=${encodeURIComponent(techSearch)}`)) as {
        data: { id: string; fullName: string }[];
      },
    enabled: manager,
  });
  const history = useQuery({
    queryKey: ['asset-history', selected],
    queryFn: async () =>
      (await request(`/inventory/assets/${encodeURIComponent(selected)}/history`)) as {
        data: { id: string; action: string; createdAt: string }[];
      },
    enabled: !!selected,
  });
  const create = useMutation({
    mutationFn: () => request('/inventory/assets', 'POST', { name, serial, locationId }),
    onSuccess: () => {
      setName('');
      setSerial('');
      setLocation('');
      void cache.invalidateQueries({ queryKey: ['inventory', 'assets'] });
    },
  });
  const assign = useMutation({
    mutationFn: ({ asset, returning }: { asset: Asset; returning: boolean }) =>
      request(`/inventory/assets/${asset.id}/assignment`, 'POST', {
        assigneeId: returning ? null : assigneeId,
        ticketId: returning ? null : ticketId || null,
        locationId: locationId || asset.locationId,
        expectedUpdatedAt: asset.updatedAt,
        reason,
      }),
    onSuccess: () => {
      setReason('');
      setTicket('');
      setAssignee('');
      setLocation('');
      void cache.invalidateQueries({ queryKey: ['inventory', 'assets'] });
      void cache.invalidateQueries({ queryKey: ['asset-history'] });
    },
  });
  return (
    <section className="work-section" id="equipos">
      <h2>Equipos identificables</h2>
      <p>
        Los números de serie son únicos y se controlan por separado de los materiales fungibles.
      </p>
      <label>
        Buscar equipo o serie
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          maxLength={120}
        />
      </label>
      <label>
        Buscar ubicación
        <input
          maxLength={120}
          value={locationSearch}
          onChange={(e) => setLocationSearch(e.target.value)}
        />
      </label>
      {manager && (
        <label>
          Buscar técnico
          <input
            maxLength={120}
            value={techSearch}
            onChange={(e) => setTechSearch(e.target.value)}
          />
        </label>
      )}
      {assets.isError ? (
        <p role="alert">No se pudieron cargar los equipos.</p>
      ) : assets.isPending ? (
        <p role="status">Cargando equipos…</p>
      ) : !assets.data?.data.length ? (
        <p className="muted">No hay equipos disponibles para mostrar.</p>
      ) : (
        assets.data.data.map((a) => (
          <article className="comment" key={a.id}>
            <div>
              <strong>{a.name}</strong>
              <small>Serie: {a.serial}</small>
            </div>
            <p>
              {a.assignedTo
                ? `Asignado: ${tech.data?.data.find((t) => t.id === a.assignedTo)?.fullName ?? 'técnico'}`
                : 'Disponible'}{' '}
              · Ubicación: {locations.data?.data.find((l) => l.id === a.locationId)?.name ?? '—'}
            </p>
            <button type="button" onClick={() => setSelected(selected === a.id ? '' : a.id)}>
              Ver historial
            </button>
            <RowActions label={`Acciones de equipo ${a.name}`}>
              <button type="button" onClick={() => setSelected(a.id)}>
                Abrir ficha de equipo
              </button>
              {a.ticketId && <Link to={`/tickets/${a.ticketId}`}>Ver ticket asociado</Link>}
            </RowActions>
            {(manager || a.assignedTo === session?.user.id) && (
              <div className="comment-form">
                {manager && (
                  <label>
                    Asignar a
                    <select value={assigneeId} onChange={(e) => setAssignee(e.target.value)}>
                      <option value="">Seleccionar técnico</option>
                      {tech.data?.data.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.fullName}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {manager && (
                  <label>
                    Ticket opcional
                    <input value={ticketId} onChange={(e) => setTicket(e.target.value)} />
                  </label>
                )}
                <label>
                  Ubicación
                  <select value={locationId} onChange={(e) => setLocation(e.target.value)}>
                    <option value="">Mantener actual</option>
                    {locations.data?.data.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Motivo
                  <input
                    maxLength={1000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                {manager && (
                  <button
                    type="button"
                    disabled={!assigneeId || !reason.trim() || assign.isPending}
                    onClick={() => assign.mutate({ asset: a, returning: false })}
                  >
                    Asignar equipo
                  </button>
                )}
                {a.assignedTo && (
                  <button
                    type="button"
                    disabled={!reason.trim() || assign.isPending}
                    onClick={() => assign.mutate({ asset: a, returning: true })}
                  >
                    Registrar devolución
                  </button>
                )}
              </div>
            )}
          </article>
        ))
      )}
      {selected && (
        <Surface title="Ficha e historial de equipo" drawer onClose={() => setSelected('')}>
          {assets.data?.data
            .filter((asset) => asset.id === selected)
            .map((asset) => (
              <div key={asset.id}>
                <h3>{asset.name}</h3>
                <p>Serie: {asset.serial}</p>
                <p>
                  {asset.assignedTo ? 'Asignado' : 'Disponible'} · Ubicación:{' '}
                  {locations.data?.data.find((location) => location.id === asset.locationId)
                    ?.name ?? '—'}
                </p>
              </div>
            ))}
          <h3>Historial</h3>
          {history.isPending ? (
            <p role="status">Cargando historial…</p>
          ) : history.isError ? (
            <p role="alert">No se pudo cargar el historial.</p>
          ) : history.data?.data.length ? (
            <ol>
              {history.data.data.map((event) => (
                <li key={event.id}>
                  {event.action} · {new Date(event.createdAt).toLocaleString('es-CO')}
                </li>
              ))}
            </ol>
          ) : (
            <p>No hay actividad registrada.</p>
          )}
        </Surface>
      )}
      {assets.data && (
        <div aria-label="Paginación de equipos">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Anterior
          </button>
          <span>
            {' '}
            Página {page} · {assets.data.meta.total} equipos{' '}
          </span>
          <button
            type="button"
            disabled={page * assets.data.meta.limit >= assets.data.meta.total}
            onClick={() => setPage(page + 1)}
          >
            Siguiente
          </button>
        </div>
      )}
      {assign.isError && (
        <p role="alert">
          {assign.error instanceof Error
            ? assign.error.message
            : 'No se pudo actualizar el equipo.'}
        </p>
      )}
      {manager && (
        <form
          className="comment-form"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <h3>Registrar equipo</h3>
          <label>
            Nombre
            <input
              required
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Número de serie
            <input
              required
              value={serial}
              maxLength={120}
              onChange={(e) => setSerial(e.target.value)}
            />
          </label>
          <label>
            Ubicación
            <select required value={locationId} onChange={(e) => setLocation(e.target.value)}>
              <option value="">Seleccionar</option>
              {locations.data?.data.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          {create.isError && (
            <p role="alert">
              {create.error instanceof Error ? create.error.message : 'No se pudo registrar.'}
            </p>
          )}
          <button className="security-button" disabled={create.isPending}>
            Registrar equipo
          </button>
        </form>
      )}
    </section>
  );
}
