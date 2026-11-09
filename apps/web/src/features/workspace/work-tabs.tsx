import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

type Tab = { key: string; href: string; label: string };
function labelFor(path: string) {
  if (path.startsWith('/tickets/'))
    return `Ticket · ${path.slice('/tickets/'.length, '/tickets/'.length + 8)}`;
  return (
    (
      {
        '/panel': 'Panel',
        '/tickets': 'Tickets',
        '/clientes': 'Clientes',
        '/inventario': 'Inventario',
        '/tareas': 'Tareas',
      } as Record<string, string>
    )[path] ?? 'Espacio'
  );
}
export function WorkTabs() {
  const location = useLocation();
  const navigate = useNavigate();
  const [tabs, setTabs] = useState<Tab[]>([]);
  useEffect(() => {
    const { pathname, search, hash } = location;
    setTabs((current) => {
      const next = { key: pathname, href: pathname + search + hash, label: labelFor(pathname) };
      const index = current.findIndex((tab) => tab.key === pathname);
      if (index < 0) return [...current.slice(-7), next];
      if (current[index].href === next.href) return current;
      return current.map((tab, i) => (i === index ? next : tab));
    });
  }, [location]);
  function close(tab: Tab) {
    const remaining = tabs.filter((entry) => entry.key !== tab.key);
    setTabs(remaining);
    if (tab.key === location.pathname) navigate(remaining.at(-1)?.href ?? '/panel');
  }
  return (
    <nav className="work-tabs" aria-label="Pestañas de trabajo">
      {tabs.map((tab) => (
        <div key={tab.key} className={tab.key === location.pathname ? 'active' : ''}>
          <button
            type="button"
            aria-current={tab.key === location.pathname ? 'page' : undefined}
            onClick={() => navigate(tab.href)}
          >
            {tab.label}
          </button>
          <button
            type="button"
            className="work-tab-close"
            aria-label={`Cerrar ${tab.label}`}
            onClick={() => close(tab)}
          >
            ×
          </button>
        </div>
      ))}
    </nav>
  );
}
