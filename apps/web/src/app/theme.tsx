import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark';
const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return localStorage.getItem('opsdesk-theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('opsdesk-theme', theme);
    } catch {
      // La preferencia sigue activa durante esta sesión.
    }
  }, [theme]);
  return (
    <ThemeContext.Provider
      value={{ theme, toggle: () => setTheme((v) => (v === 'dark' ? 'light' : 'dark')) }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
export function ThemeToggle({ className = 'theme-toggle' }: { className?: string }) {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('Falta ThemeProvider');
  const label = context.theme === 'dark' ? 'Activar tema claro' : 'Activar tema oscuro';
  return (
    <button
      type="button"
      className={className}
      onClick={context.toggle}
      aria-label={label}
      title={label}
    >
      {context.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
