import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AccountRole } from '@opsdesk/shared/contracts';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { ThemeToggle } from './theme';

type User = {
  id: string;
  fullName: string;
  email: string;
  role: AccountRole;
  customerId?: string | null;
};
type Session = { user: User; csrf: string };
type SessionContext = {
  session: Session | null;
  loading: boolean;
  setSession: (s: Session | null) => void;
  request: (path: string, method?: string, body?: object) => Promise<unknown>;
};
const Context = createContext<SessionContext | null>(null);
async function send(path: string, method = 'GET', body?: object, csrf?: string) {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error('No se pudo conectar. Comprueba tu conexión e inténtalo de nuevo.');
  }
  if (!response.ok) {
    let message = 'No fue posible completar la operación.',
      code = '';
    try {
      const error = (await response.json()) as { error?: { message?: string; code?: string } };
      message = error.error?.message ?? message;
      code = error.error?.code ?? '';
    } catch {
      /* Respuesta inesperada */
    }
    throw Object.assign(new Error(message), { status: response.status, code });
  }
  return response.status === 204 ? null : response.json();
}
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSessionState] = useState<Session | null>(null);
  function setSession(value: Session | null) {
    queryClient.clear();
    setSessionState(value);
  }
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    send('/auth/me')
      .then((value) => {
        const data = value as { data: User; csrfToken: string };
        if (active) setSession({ user: data.data, csrf: data.csrfToken });
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function request(path: string, method = 'GET', body?: object) {
    try {
      return await send(path, method, body, session?.csrf);
    } catch (error) {
      if ((error as { code?: string }).code === 'UNAUTHENTICATED') setSession(null);
      throw error;
    }
  }
  return (
    <Context.Provider value={{ session, loading, setSession, request }}>
      {children}
    </Context.Provider>
  );
}
export function useSession() {
  const c = useContext(Context);
  if (!c) throw new Error('Falta SessionProvider');
  return c;
}
function Shell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="security-shell">
      <div className="security-top">
        <Link to="/" className="security-brand">
          ops<span>desk</span>
        </Link>
        <div className="security-top-actions">
          <ThemeToggle />
          <Link to="/">Volver al inicio</Link>
        </div>
      </div>
      <div className="security-card">
        <div className="security-kicker">OPSDESK · ACCESO SEGURO</div>
        <h1>{title}</h1>
        <p>{description}</p>
        {children}
      </div>
      <p className="security-footer">Un espacio para trabajar con claridad.</p>
    </main>
  );
}
function Notice({ text }: { text: string }) {
  return text ? (
    <p role="alert" className="form-notice">
      {text}
    </p>
  ) : null;
}
const loginSchema = z.object({
  email: z.email('Introduce un correo válido.'),
  password: z.string().min(1, 'Introduce tu contraseña.'),
});
export function Login() {
  const { session, setSession } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [message, setMessage] = useState(() =>
    (location.state as { sessionRequired?: boolean } | null)?.sessionRequired
      ? 'Tu sesión no está activa. Inicia sesión para continuar.'
      : '',
  );
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  async function submit(v: z.infer<typeof loginSchema>) {
    setMessage('');
    try {
      const value = (await send('/auth/login', 'POST', v)) as {
        data: { user: User; csrfToken: string };
      };
      setSession({ user: value.data.user, csrf: value.data.csrfToken });
      navigate('/panel', { replace: true });
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  if (session) return <Navigate to="/panel" replace />;
  return (
    <Shell
      title="Bienvenido de nuevo"
      description="Accede a tu espacio de trabajo con tu cuenta de OpsDesk."
    >
      <form onSubmit={handleSubmit(submit)} noValidate>
        <label htmlFor="email">Correo electrónico</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'email-error' : undefined}
          {...register('email')}
        />
        {errors.email && (
          <small id="email-error" className="field-error">
            {errors.email.message}
          </small>
        )}
        <label htmlFor="password">Contraseña</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? 'password-error' : undefined}
          {...register('password')}
        />
        {errors.password && (
          <small id="password-error" className="field-error">
            {errors.password.message}
          </small>
        )}
        <div className="form-row">
          <Link to="/recuperar">¿Olvidaste tu contraseña?</Link>
        </div>
        <Notice text={message} />
        <button className="security-button" disabled={isSubmitting}>
          {isSubmitting ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </Shell>
  );
}
const recoverySchema = z.object({ email: z.email('Introduce un correo válido.') });
export function Recovery() {
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof recoverySchema>>({ resolver: zodResolver(recoverySchema) });
  async function submit(v: z.infer<typeof recoverySchema>) {
    try {
      await send('/auth/forgot-password', 'POST', v);
      setDone(true);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <Shell
      title="Recupera tu acceso"
      description="Te enviaremos instrucciones si existe una cuenta asociada a tu correo."
    >
      {done ? (
        <p role="status">Si la cuenta existe, recibirás instrucciones de recuperación.</p>
      ) : (
        <form onSubmit={handleSubmit(submit)} noValidate>
          <label htmlFor="recover-email">Correo electrónico</label>
          <input
            id="recover-email"
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'recover-error' : undefined}
            {...register('email')}
          />
          {errors.email && (
            <small id="recover-error" className="field-error">
              {errors.email.message}
            </small>
          )}
          <Notice text={message} />
          <button className="security-button" disabled={isSubmitting}>
            {isSubmitting ? 'Enviando…' : 'Enviar instrucciones'}
          </button>
        </form>
      )}
      <Link className="security-back" to="/acceso">
        Volver a iniciar sesión
      </Link>
    </Shell>
  );
}
const resetSchema = z
  .object({
    newPassword: z.string().min(12, 'Usa al menos 12 caracteres.').max(256),
    confirmPassword: z.string().min(1, 'Confirma tu contraseña.'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Las contraseñas no coinciden.',
  });
export function Reset() {
  const [token] = useState(() => window.location.hash.slice(1));
  const [valid, setValid] = useState<boolean | null>(null);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema) });
  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname);
    let active = true;
    send('/auth/validate-reset', 'POST', { token })
      .then(() => {
        if (active) setValid(true);
      })
      .catch(() => {
        if (active) setValid(false);
      });
    return () => {
      active = false;
    };
  }, [token]);
  async function submit(v: z.infer<typeof resetSchema>) {
    try {
      await send('/auth/reset-password', 'POST', { token, newPassword: v.newPassword });
      setDone(true);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <Shell
      title="Crea una contraseña"
      description="Elige una contraseña de al menos 12 caracteres."
    >
      {valid === null ? (
        <p role="status">Comprobando enlace…</p>
      ) : !valid ? (
        <p role="alert">El enlace no es válido o ha vencido. Solicita uno nuevo.</p>
      ) : done ? (
        <p role="status">Contraseña actualizada. Ya puedes iniciar sesión.</p>
      ) : (
        <form onSubmit={handleSubmit(submit)}>
          <label htmlFor="new-password">Nueva contraseña</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.newPassword}
            aria-describedby={errors.newPassword ? 'new-error' : undefined}
            {...register('newPassword')}
          />
          {errors.newPassword && (
            <small id="new-error" className="field-error">
              {errors.newPassword.message}
            </small>
          )}
          <label htmlFor="confirm-password">Confirmar contraseña</label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.confirmPassword}
            aria-describedby={errors.confirmPassword ? 'confirm-error' : undefined}
            {...register('confirmPassword')}
          />
          {errors.confirmPassword && (
            <small id="confirm-error" className="field-error">
              {errors.confirmPassword.message}
            </small>
          )}
          <Notice text={message} />
          <button className="security-button" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando…' : 'Guardar contraseña'}
          </button>
        </form>
      )}
      <Link className="security-back" to={valid === false ? '/recuperar' : '/acceso'}>
        {valid === false ? 'Solicitar otro enlace' : 'Ir a iniciar sesión'}
      </Link>
    </Shell>
  );
}
type SessionRow = { id: string; createdAt: string; expiresAt: string; current: boolean };
export function Profile() {
  const { session, loading, setSession, request } = useSession();
  const [message, setMessage] = useState('');
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [name, setName] = useState('');
  useEffect(() => {
    if (session) {
      setName(session.user.fullName);
      request('/auth/sessions')
        .then((v) => setSessions((v as { data: SessionRow[] }).data))
        .catch(() => {});
    }
  }, [session?.user.id]);
  if (loading)
    return (
      <Shell title="Comprobando sesión" description="Un momento, por favor.">
        <p role="status">Cargando…</p>
      </Shell>
    );
  if (!session) return <Navigate to="/acceso" state={{ sessionRequired: true }} replace />;
  async function logout() {
    try {
      await request('/auth/logout', 'POST');
      setSession(null);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await request('/auth/password', 'POST', { currentPassword, newPassword });
      setCurrent('');
      setNew('');
      setMessage('Contraseña actualizada. Las demás sesiones se cerraron.');
      setSessions((s) => s.filter((x) => x.current));
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function updateName(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    try {
      const v = (await request('/profile', 'PATCH', { fullName: name })) as { data: User };
      setSession({ ...session!, user: v.data });
      setMessage('Perfil actualizado.');
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  async function revoke() {
    if (!currentPassword) {
      setMessage('Introduce tu contraseña actual para cerrar otras sesiones.');
      return;
    }
    try {
      await request('/auth/sessions/revoke-others', 'POST', { password: currentPassword });
      setSessions((s) => s.filter((x) => x.current));
      setCurrent('');
      setMessage('Las demás sesiones se cerraron.');
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function revokeOne(id: string) {
    if (!currentPassword) {
      setMessage('Introduce tu contraseña actual para cerrar una sesión.');
      return;
    }
    try {
      await request(`/auth/sessions/${id}/revoke`, 'POST', { password: currentPassword });
      setSessions((list) => list.filter((item) => item.id !== id));
      setCurrent('');
      setMessage('La sesión seleccionada se cerró.');
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  return (
    <Shell title="Tu perfil" description="Administra tu información y protege tu cuenta.">
      <div className="profile-summary">
        <span>{session.user.email}</span>
        <strong>{session.user.role}</strong>
      </div>
      <form onSubmit={updateName}>
        <label htmlFor="name">Nombre completo</label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          minLength={1}
          maxLength={200}
          required
        />
        <button className="security-secondary">Guardar nombre</button>
      </form>
      <hr />
      <h2>Contraseña y sesiones</h2>
      <form onSubmit={changePassword}>
        <label htmlFor="current">Contraseña actual</label>
        <input
          id="current"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
        <label htmlFor="new">Nueva contraseña</label>
        <input
          id="new"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={256}
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
          required
        />
        <button className="security-secondary" disabled={saving}>
          {saving ? 'Guardando…' : 'Cambiar contraseña'}
        </button>
      </form>
      <p className="session-count">Sesiones activas: {sessions.length}</p>
      <ul className="session-list">
        {sessions.map((s) => (
          <li key={s.id}>
            {s.current ? 'Esta sesión' : 'Otra sesión'} · iniciada{' '}
            {new Date(s.createdAt).toLocaleString('es-CO')}
            {!s.current && (
              <button
                className="session-revoke"
                type="button"
                onClick={() => revokeOne(s.id)}
                aria-label={`Cerrar sesión iniciada ${new Date(s.createdAt).toLocaleString('es-CO')}`}
              >
                Cerrar
              </button>
            )}
          </li>
        ))}
      </ul>
      <button className="security-secondary" type="button" onClick={revoke}>
        Cerrar otras sesiones
      </button>
      {message && (
        <p role="status" className="form-notice">
          {message}
        </p>
      )}
      <hr />
      <button className="security-button" type="button" onClick={logout}>
        Cerrar sesión
      </button>
    </Shell>
  );
}
export function Denied() {
  return (
    <Shell
      title="Acceso no disponible"
      description="Tu cuenta no tiene permisos para abrir esta sección."
    >
      <Link to="/perfil" className="security-back">
        Volver a tu perfil
      </Link>
    </Shell>
  );
}
