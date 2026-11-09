import type { ReactNode } from 'react';

/** Estructuras reutilizables para futuras rutas protegidas; no habilitan acceso. */
export function ApplicationLayout({
  navigation,
  children,
}: {
  navigation: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="application-layout">
      <aside aria-label="Navegación de la aplicación">{navigation}</aside>
      <main>{children}</main>
    </div>
  );
}
export function AuthenticationLayout({ children }: { children: ReactNode }) {
  return (
    <main className="authentication-layout">
      <section aria-label="Acceso a OpsDesk">{children}</section>
    </main>
  );
}
