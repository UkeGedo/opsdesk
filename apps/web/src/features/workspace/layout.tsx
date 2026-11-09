import {
  BarChart3,
  ClipboardList,
  ListChecks,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Package,
  Search,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { LiveUpdates } from './live-updates';
import { useSession } from '../../app/security';
import { Notifications } from './notifications';
import { ThemeToggle } from '../../app/theme';
import { CommandPalette } from './command-palette';
import { WorkTabs } from './work-tabs';
import { NavigationGuard, useConfirmDirty } from './navigation-guard';
import { WorkspaceScroll } from './workspace-scroll';
function LogoutControl({ logout, collapsed }: { logout: () => Promise<void>; collapsed: boolean }) {
  const confirmDiscard = useConfirmDirty();
  return (
    <button
      onClick={() => {
        if (confirmDiscard()) void logout();
      }}
      aria-label="Cerrar sesión"
      title={collapsed ? 'Cerrar sesión' : undefined}
    >
      <LogOut size={17} />
      <span>Cerrar sesión</span>
    </button>
  );
}
export function Workspace() {
  const { session, loading, setSession, request } = useSession();
  const [menu, setMenu] = useState(false);
  const [commands, setCommands] = useState(false);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      )
        return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommands(true);
      }
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('opsdesk-sidebar') === 'collapsed';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('opsdesk-sidebar', collapsed ? 'collapsed' : 'expanded');
    } catch {
      /* La vista conserva la preferencia en memoria. */
    }
  }, [collapsed]);
  useEffect(() => {
    if (!menu) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenu(false);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menu]);
  const location = useLocation();
  if (loading) return <main className="work-loading">Comprobando sesión…</main>;
  if (!session) return <Navigate to="/acceso" state={{ sessionRequired: true }} replace />;
  const admin = ['administrador', 'supervisor'].includes(session.user.role);
  const title = location.pathname.startsWith('/tareas')
    ? 'Tareas'
    : location.pathname.startsWith('/inventario')
      ? 'Inventario'
      : location.pathname.startsWith('/clientes')
        ? 'Clientes'
        : location.pathname.startsWith('/tickets')
          ? 'Tickets'
          : 'Panel principal';
  async function logout() {
    try {
      await request('/auth/logout', 'POST');
      setSession(null);
    } catch {
      window.alert('No fue posible cerrar la sesión. Inténtalo de nuevo.');
    }
  }
  return (
    <NavigationGuard>
      <WorkspaceScroll />
      {
        <div className={`work ${collapsed ? 'sidebar-collapsed' : ''}`}>
          <LiveUpdates userId={session.user.id} />
          <aside id="work-sidebar" className={`work-sidebar ${menu ? 'open' : ''}`}>
            <Link className="work-logo" to="/panel">
              <span className="work-logo-mark">▦</span>
              <span className="work-logo-word">
                ops<span>desk</span>
              </span>
            </Link>
            <div className="work-space">ESPACIO DE TRABAJO</div>
            <nav aria-label="Navegación de la aplicación">
              <NavLink
                to="/panel"
                aria-label="Panel principal"
                title={collapsed ? 'Panel principal' : undefined}
                onClick={() => setMenu(false)}
              >
                <BarChart3 size={18} />
                <span>Panel principal</span>
              </NavLink>
              <NavLink
                to="/tickets"
                aria-label="Tickets"
                title={collapsed ? 'Tickets' : undefined}
                onClick={() => setMenu(false)}
              >
                <ClipboardList size={18} />
                <span>Tickets</span>
              </NavLink>
              {session.user.role !== 'cliente' && (
                <NavLink
                  to="/tareas"
                  aria-label="Tareas"
                  title={collapsed ? 'Tareas' : undefined}
                  onClick={() => setMenu(false)}
                >
                  <ListChecks size={18} />
                  <span>Tareas</span>
                </NavLink>
              )}
              {session.user.role !== 'cliente' && (
                <NavLink
                  to="/inventario"
                  aria-label="Inventario"
                  title={collapsed ? 'Inventario' : undefined}
                  onClick={() => setMenu(false)}
                >
                  <Package size={18} />
                  <span>Inventario</span>
                </NavLink>
              )}
              {admin && (
                <NavLink
                  to="/clientes"
                  aria-label="Clientes"
                  title={collapsed ? 'Clientes' : undefined}
                  onClick={() => setMenu(false)}
                >
                  <UsersRound size={18} />
                  <span>Clientes</span>
                </NavLink>
              )}
            </nav>
            <div className="work-sidebar-bottom">
              <Link to="/perfil" aria-label="Mi perfil" title={collapsed ? 'Mi perfil' : undefined}>
                <UserRound size={17} />
                <span>Mi perfil</span>
              </Link>
              <LogoutControl logout={logout} collapsed={collapsed} />
              <button
                type="button"
                className="sidebar-collapse"
                onClick={() => setCollapsed(!collapsed)}
                aria-label={collapsed ? 'Expandir barra lateral' : 'Contraer barra lateral'}
                aria-expanded={!collapsed}
                aria-controls="work-sidebar"
                title={collapsed ? 'Expandir barra lateral' : 'Contraer barra lateral'}
              >
                {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
                <span>Contraer barra</span>
              </button>
            </div>
          </aside>
          {menu && (
            <button
              className="work-scrim"
              aria-label="Cerrar menú"
              onClick={() => setMenu(false)}
            />
          )}
          <div className="work-body">
            <header className="work-top">
              <button
                className="work-menu"
                onClick={() => setMenu(!menu)}
                aria-label={menu ? 'Cerrar menú' : 'Abrir menú'}
                aria-expanded={menu}
                aria-controls="work-sidebar"
              >
                <Menu size={21} />
              </button>
              <div className="work-breadcrumb">
                Espacio de trabajo <span>/</span> <strong>{title}</strong>
              </div>
              <button type="button" className="command-trigger" onClick={() => setCommands(true)}>
                <Search size={17} />
                <span>Buscar</span>
                <kbd aria-hidden="true">Ctrl K</kbd>
              </button>
              <Notifications />
              <ThemeToggle />
              <Link className="work-user" to="/perfil">
                <span>{session.user.fullName.slice(0, 1).toUpperCase()}</span>
                <div>
                  <strong>{session.user.fullName}</strong>
                  <small>{session.user.role}</small>
                </div>
              </Link>
            </header>
            <WorkTabs />
            <main className="work-main">
              <Outlet />
            </main>
          </div>
          {commands && <CommandPalette onClose={() => setCommands(false)} />}
        </div>
      }
    </NavigationGuard>
  );
}
