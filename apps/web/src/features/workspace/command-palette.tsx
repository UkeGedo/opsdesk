import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../app/security';
import { Surface } from './surface';

type Result = { id: string; name?: string; title?: string; serial?: string; ticketNumber?: number };
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const { request, session } = useSession();
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(text.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [text]);
  const manager = ['administrador', 'supervisor'].includes(session?.user.role ?? '');
  const staff = session?.user.role !== 'cliente';
  const search = useQuery({
    queryKey: ['command-search', term, session?.user.id],
    enabled: term.length >= 2,
    queryFn: async () => {
      const q = encodeURIComponent(term);
      const groups = await Promise.all([
        request(`/tickets?limit=5&q=${q}`),
        manager ? request(`/customers?limit=5&q=${q}`) : Promise.resolve({ data: [] }),
        staff ? request(`/inventory/assets?limit=5&q=${q}`) : Promise.resolve({ data: [] }),
      ]);
      return groups as { data: Result[] }[];
    },
  });
  const links = [
    { label: 'Panel principal', to: '/panel' },
    { label: 'Tickets', to: '/tickets' },
    ...(staff
      ? [
          { label: 'Tareas', to: '/tareas' },
          { label: 'Inventario', to: '/inventario' },
        ]
      : []),
    ...(manager ? [{ label: 'Clientes', to: '/clientes' }] : []),
    ...(['administrador', 'supervisor', 'cliente'].includes(session?.user.role ?? '')
      ? [{ label: 'Nueva solicitud', to: '/tickets#nueva-solicitud' }]
      : []),
    ...(session?.user.role === 'administrador'
      ? [{ label: 'Registrar cliente', to: '/clientes#registrar-cliente' }]
      : []),
  ].filter(
    (link) => !text || link.label.toLocaleLowerCase('es').includes(text.toLocaleLowerCase('es')),
  );
  return (
    <Surface title="Buscar y ejecutar acciones" onClose={onClose}>
      <label className="command-search">
        Buscar en OpsDesk
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ticket, cliente, activo o acción"
        />
      </label>
      <p className="muted">
        Escribe al menos dos caracteres para buscar registros. Usa Tab para recorrer resultados y
        Escape para cerrar.
      </p>
      {links.length > 0 && (
        <div className="command-group">
          <h3>Acciones y navegación</h3>
          {links.map((link) => (
            <Link key={link.to} to={link.to} onClick={onClose}>
              {link.label}
              <span aria-hidden="true">↗</span>
            </Link>
          ))}
        </div>
      )}
      {term.length >= 2 && text.trim() !== term && <p role="status">Preparando búsqueda…</p>}
      {term.length >= 2 && search.isFetching && <p role="status">Buscando…</p>}
      {term.length >= 2 && search.isError && (
        <p role="alert">No se pudieron buscar los registros. Inténtalo de nuevo.</p>
      )}
      {term.length >= 2 && !search.isFetching && search.data && (
        <>
          {search.data.map(
            (group, index) =>
              group.data.length > 0 && (
                <div className="command-group" key={index}>
                  <h3>{['Tickets', 'Clientes', 'Activos'][index]}</h3>
                  {group.data.map((item) => {
                    const target =
                      index === 0
                        ? `/tickets/${item.id}`
                        : index === 1
                          ? `/clientes?q=${encodeURIComponent(item.name ?? '')}`
                          : `/inventario?q=${encodeURIComponent(item.serial ?? item.name ?? '')}#equipos`;
                    return (
                      <Link key={item.id} to={target} onClick={onClose}>
                        {index === 0
                          ? `#${item.ticketNumber} · ${item.title}`
                          : index === 2
                            ? `${item.name} · ${item.serial}`
                            : item.name}
                        <span aria-hidden="true">↗</span>
                      </Link>
                    );
                  })}
                </div>
              ),
          )}
          {search.data.every((group) => group.data.length === 0) && (
            <p>No hay registros que coincidan.</p>
          )}
        </>
      )}
    </Surface>
  );
}
