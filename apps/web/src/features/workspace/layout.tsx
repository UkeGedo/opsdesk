import {
  BarChart3,
  ClipboardList,
  ListChecks,
  LogOut,
  Menu,
  Package,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { LiveUpdates } from './live-updates';
import { useSession } from '../../app/security';
import { Notifications } from './notifications';
export function Workspace() {
  const { session, loading, setSession, request } = useSession();
  const [menu, setMenu] = useState(false);
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
    <div className="work">
      <LiveUpdates userId={session.user.id} />
      <aside className={`work-sidebar ${menu ? 'open' : ''}`}>
        <Link className="work-logo" to="/panel">
          <span className="work-logo-mark">▦</span> ops<span>desk</span>
        </Link>
        <div className="work-space">ESPACIO DE TRABAJO</div>
        <nav aria-label="Navegación de la aplicación">
          <NavLink to="/panel" onClick={() => setMenu(false)}>
            <BarChart3 size={18} /> Panel principal
          </NavLink>
          <NavLink to="/tickets" onClick={() => setMenu(false)}>
            <ClipboardList size={18} /> Tickets
          </NavLink>
          {session.user.role !== 'cliente' && (
            <NavLink to="/tareas" onClick={() => setMenu(false)}>
              <ListChecks size={18} /> Tareas
            </NavLink>
          )}
          {session.user.role !== 'cliente' && (
            <NavLink to="/inventario" onClick={() => setMenu(false)}>
              <Package size={18} /> Inventario
            </NavLink>
          )}
          {admin && (
            <NavLink to="/clientes" onClick={() => setMenu(false)}>
              <UsersRound size={18} /> Clientes
            </NavLink>
          )}
        </nav>
        <div className="work-sidebar-bottom">
          <Link to="/perfil">
            <UserRound size={17} /> Mi perfil
          </Link>
          <button onClick={logout}>
            <LogOut size={17} /> Cerrar sesión
          </button>
        </div>
      </aside>
      {menu && (
        <button className="work-scrim" aria-label="Cerrar menú" onClick={() => setMenu(false)} />
      )}
      <div className="work-body">
        <header className="work-top">
          <button
            className="work-menu"
            onClick={() => setMenu(!menu)}
            aria-label={menu ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menu}
          >
            <Menu size={21} />
          </button>
          <div className="work-breadcrumb">
            Espacio de trabajo <span>/</span> <strong>{title}</strong>
          </div>
          <Notifications />
          <Link className="work-user" to="/perfil">
            <span>{session.user.fullName.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{session.user.fullName}</strong>
              <small>{session.user.role}</small>
            </div>
          </Link>
        </header>
        <main className="work-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
