import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../../app/security';

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
  const { session } = useSession();
  const storageKey = `opsdesk-tabs:${session?.user.id ?? ''}`;
  const handledClose = useRef(new Set<string>());
  const [tabs, setTabs] = useState<Tab[]>(() => {
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? '[]');
      if (!Array.isArray(saved)) return [];
      return saved
        .filter(
          (path): path is string =>
            typeof path === 'string' &&
            /^\/(panel|tickets(?:\/[0-9a-f-]{36})?|clientes|inventario|tareas)$/.test(path),
        )
        .slice(-8)
        .map((path) => ({ key: path, href: path, label: labelFor(path) }));
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(tabs.map((tab) => tab.key)));
    } catch {
      /* Preferencia opcional. */
    }
  }, [tabs, storageKey]);
  useEffect(() => {
    const { pathname, search, hash } = location;
    const requestedClose = (location.state as { closedWorkspaceTab?: unknown } | null)
      ?.closedWorkspaceTab;
    const closed =
      typeof requestedClose === 'string' &&
      requestedClose !== pathname &&
      !handledClose.current.has(location.key)
        ? requestedClose
        : null;
    if (closed) handledClose.current.add(location.key);
    setTabs((current) => {
      if (closed) current = current.filter((tab) => tab.key !== closed);
      const next = { key: pathname, href: pathname + search + hash, label: labelFor(pathname) };
      const index = current.findIndex((tab) => tab.key === pathname);
      if (index < 0) return [...current.slice(-7), next];
      if (current[index].href === next.href) return current;
      return current.map((tab, i) => (i === index ? next : tab));
    });
  }, [location]);
  function close(tab: Tab) {
    const remaining = tabs.filter((entry) => entry.key !== tab.key);
    if (tab.key === location.pathname) {
      navigate(remaining.at(-1)?.href ?? '/panel', { state: { closedWorkspaceTab: tab.key } });
    } else setTabs(remaining);
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
