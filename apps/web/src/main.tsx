import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import {
  ArrowDown,
  ArrowRight,
  Check,
  CircleHelp,
  ClipboardList,
  Layers3,
  LifeBuoy,
  Package,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import './styles.css';
import './design-system.css';
import './interaction.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider, Login, Recovery, Reset, Profile, Denied } from './app/security';
import { ThemeProvider, ThemeToggle } from './app/theme';

const Workspace = lazy(() =>
  import('./features/workspace/layout').then((m) => ({ default: m.Workspace })),
);
const Dashboard = lazy(() =>
  import('./features/workspace/dashboard').then((m) => ({ default: m.Dashboard })),
);
const Tickets = lazy(() =>
  import('./features/workspace/tickets').then((m) => ({ default: m.Tickets })),
);
const TicketDetail = lazy(() =>
  import('./features/workspace/ticket-detail').then((m) => ({ default: m.TicketDetail })),
);
const Customers = lazy(() =>
  import('./features/workspace/customers').then((m) => ({ default: m.Customers })),
);
const Inventory = lazy(() =>
  import('./features/inventory/inventory').then((m) => ({ default: m.Inventory })),
);
const Tasks = lazy(() => import('./features/tasks/tasks').then((m) => ({ default: m.Tasks })));

function Logo() {
  return (
    <Link className="brand" to="/">
      <span className="brand-mark">
        <span />
      </span>
      <span>
        ops<span className="brand-accent">desk</span>
        <small>OPERACIONES CON CLARIDAD</small>
      </span>
    </Link>
  );
}
function Header() {
  return (
    <header className="header">
      <div className="container header-inner">
        <Logo />
        <nav aria-label="Navegación principal">
          <a href="/#capacidades">Capacidades</a>
          <a href="/#como-funciona">Cómo funciona</a>
          <a href="/#fundamentos">Fundamentos</a>
        </nav>
        <div className="header-actions">
          <ThemeToggle className="theme" />
          <Link className="signin-link" to="/acceso">
            Ingresar
          </Link>
          <a className="top-link" href="/#estado">
            Estado del proyecto <ArrowRight size={16} />
          </a>
        </div>
      </div>
    </header>
  );
}
const capabilities = [
  {
    icon: LifeBuoy,
    n: '01',
    title: 'Solicitudes y soporte',
    text: 'Un punto de partida claro para recibir, asignar y dar seguimiento a cada incidencia.',
  },
  {
    icon: UsersRound,
    n: '02',
    title: 'Personas y clientes',
    text: 'El contexto de cada cliente y las responsabilidades del equipo, en un mismo lugar.',
  },
  {
    icon: Package,
    n: '03',
    title: 'Inventario y activos',
    text: 'Visibilidad sobre los recursos que respaldan el trabajo y sus movimientos.',
  },
  {
    icon: Layers3,
    n: '04',
    title: 'Seguimiento operativo',
    text: 'Actividad, historial y reportes para tomar decisiones con mejor información.',
  },
];
function Home() {
  return (
    <>
      <Header />
      <main>
        <section className="hero">
          <div className="container hero-grid">
            <div className="hero-copy">
              <div className="eyebrow">
                <span className="pulse" /> UNA NUEVA FORMA DE ORGANIZAR EL TRABAJO
              </div>
              <h1>
                La operación fluye
                <br />
                <em>cuando todo está</em>
                <br />
                en su lugar.
              </h1>
              <p>
                OpsDesk reúne el soporte, las personas y los recursos de tu equipo en un espacio
                diseñado para trabajar con claridad.
              </p>
              <div className="hero-actions">
                <a className="button primary" href="#capacidades">
                  Explorar OpsDesk <ArrowDown size={17} />
                </a>
                <a className="button text-button" href="#como-funciona">
                  Conoce el enfoque <ArrowRight size={17} />
                </a>
              </div>
              <div className="hero-note">
                <ShieldCheck size={17} /> Diseñado para equipos que hacen que las cosas sucedan.
              </div>
            </div>
            <div className="visual" aria-hidden="true">
              <div className="visual-top">
                <div className="visual-logo">
                  <span className="mini-mark">▦</span> opsdesk
                </div>
                <div className="visual-dots">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <div className="visual-body">
                <aside>
                  <div className="side-label">ESPACIO DE TRABAJO</div>
                  <div className="side-item active">
                    <span>◫</span> Resumen
                  </div>
                  <div className="side-item">
                    <span>◇</span> Solicitudes
                  </div>
                  <div className="side-item">
                    <span>▣</span> Clientes
                  </div>
                  <div className="side-item">
                    <span>▤</span> Inventario
                  </div>
                  <div className="side-line" />
                  <div className="side-item">
                    <span>⚙</span> Configuración
                  </div>
                </aside>
                <div className="visual-content">
                  <div className="visual-eyebrow">
                    TU ESPACIO DE TRABAJO <span>● VISTA CONCEPTUAL</span>
                  </div>
                  <h2>
                    Todo empieza
                    <br />
                    con una visión clara.
                  </h2>
                  <p>
                    Un lugar para conectar los detalles
                    <br />
                    que mueven tu operación.
                  </p>
                  <div className="concept-card">
                    <div className="concept-icon">
                      <ClipboardList size={20} />
                    </div>
                    <div>
                      <strong>Trabajo en contexto</strong>
                      <small>De la solicitud a la solución</small>
                    </div>
                    <span className="concept-arrow">↗</span>
                  </div>
                  <div className="concept-lines">
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              </div>
              <div className="visual-caption">
                VISTA CONCEPTUAL <span>01 / 03</span>
              </div>
            </div>
          </div>
          <div className="container hero-bottom">
            <span>UNA PLATAFORMA, UNA VISIÓN COMPARTIDA</span>
            <span>
              HECHO PARA EL TRABAJO REAL <ArrowDown size={14} />
            </span>
          </div>
        </section>
        <section className="capabilities section" id="capacidades">
          <div className="container">
            <div className="section-heading">
              <div>
                <div className="section-kicker">01 / CAPACIDADES</div>
                <h2>
                  Menos dispersión.
                  <br />
                  <em>Más perspectiva.</em>
                </h2>
              </div>
              <p>
                Las operaciones tienen muchas piezas. OpsDesk propone una manera más sencilla de
                mantenerlas conectadas.
              </p>
            </div>
            <div className="cap-grid">
              {capabilities.map(({ icon: Icon, n, title, text }) => (
                <article className="cap" key={n}>
                  <div className="cap-top">
                    <span className="icon-box">
                      <Icon size={21} />
                    </span>
                    <span>{n}</span>
                  </div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="approach section" id="como-funciona">
          <div className="container approach-grid">
            <div>
              <div className="section-kicker light">02 / EL ENFOQUE</div>
              <h2>
                El contexto correcto,
                <br />
                <em>en cada paso.</em>
              </h2>
              <p>
                Desde que llega una solicitud hasta que se resuelve, cada persona necesita saber qué
                hacer y dónde encontrar la información.
              </p>
              <a className="approach-link" href="#fundamentos">
                Descubre los fundamentos <ArrowRight size={17} />
              </a>
            </div>
            <div className="steps">
              <div>
                <span>01</span>
                <div>
                  <h3>Recibir</h3>
                  <p>Dar un lugar a cada solicitud y su contexto.</p>
                </div>
              </div>
              <div>
                <span>02</span>
                <div>
                  <h3>Coordinar</h3>
                  <p>Conectar el trabajo con las personas adecuadas.</p>
                </div>
              </div>
              <div>
                <span>03</span>
                <div>
                  <h3>Resolver</h3>
                  <p>Conservar el seguimiento y aprender de cada caso.</p>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section className="foundation section" id="fundamentos">
          <div className="container foundation-grid">
            <div>
              <div className="section-kicker">03 / FUNDAMENTOS</div>
              <h2>
                Construido con
                <br />
                <em>intención.</em>
              </h2>
            </div>
            <div>
              <p className="foundation-lead">
                Una base pensada para crecer con orden, mantener la información protegida y poner a
                las personas primero.
              </p>
              <div className="principles">
                <span>
                  <Check size={16} /> Seguridad desde el diseño
                </span>
                <span>
                  <Check size={16} /> Accesibilidad y claridad
                </span>
                <span>
                  <Check size={16} /> Historial trazable
                </span>
                <span>
                  <Check size={16} /> Arquitectura mantenible
                </span>
              </div>
            </div>
          </div>
        </section>
        <section className="status" id="estado">
          <div className="container status-inner">
            <div>
              <span className="status-label">
                <span className="pulse" /> OPERACIONES · DEMOSTRACIÓN LOCAL
              </span>
              <h2>Conoce OpsDesk en funcionamiento.</h2>
              <p>
                Explora tickets, clientes, tareas e inventario en el espacio de trabajo. La
                demostración local utiliza datos ficticios.
              </p>
            </div>
            <CircleHelp size={28} />
          </div>
        </section>
      </main>
      <footer>
        <div className="container footer-inner">
          <Logo />
          <span>Una mejor manera de mantener todo en movimiento.</span>
          <span>© 2026 OPSDESK</span>
        </div>
      </footer>
    </>
  );
}
function NotFound() {
  return (
    <>
      <Header />
      <main className="notfound">
        <div className="section-kicker">ERROR 404</div>
        <h1>Esta página no está aquí.</h1>
        <p>Puede que la dirección haya cambiado o no exista.</p>
        <Link className="button primary" to="/">
          Volver al inicio <ArrowRight size={17} />
        </Link>
      </main>
    </>
  );
}
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15000 } },
});
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <SessionProvider>
            <Suspense
              fallback={
                <main className="work-empty" role="status">
                  Cargando sección…
                </main>
              }
            >
              <Routes>
                <Route path="/" element={<Home />} />
                <Route element={<Workspace />}>
                  <Route path="/panel" element={<Dashboard />} />
                  <Route path="/tickets" element={<Tickets />} />
                  <Route path="/tickets/:id" element={<TicketDetail />} />
                  <Route path="/clientes" element={<Customers />} />
                  <Route path="/inventario" element={<Inventory />} />
                  <Route path="/tareas" element={<Tasks />} />
                </Route>
                <Route path="/acceso" element={<Login />} />
                <Route path="/recuperar" element={<Recovery />} />
                <Route path="/restablecer" element={<Reset />} />
                <Route path="/perfil" element={<Profile />} />
                <Route path="/denegado" element={<Denied />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </SessionProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
