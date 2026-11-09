import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useBlocker } from 'react-router-dom';
import { Surface } from './surface';

type Guard = { setDirty: (id: string, dirty: boolean) => void };
const GuardContext = createContext<Guard | null>(null);

export function NavigationGuard({ children }: { children: ReactNode }) {
  const dirty = useRef(new Set<string>());
  const [count, setCount] = useState(0);
  const setDirty = useCallback((id: string, value: boolean) => {
    if (value) dirty.current.add(id);
    else dirty.current.delete(id);
    setCount(dirty.current.size);
  }, []);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty.current.size > 0 && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!count) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [count]);
  return (
    <GuardContext.Provider value={{ setDirty }}>
      {children}
      {blocker.state === 'blocked' && (
        <Surface title="Cambios sin guardar" onClose={() => blocker.reset()}>
          <p>Hay información sin guardar. ¿Quieres salir y descartar los cambios?</p>
          <button type="button" onClick={() => blocker.reset()}>
            Seguir editando
          </button>{' '}
          <button
            type="button"
            onClick={() => {
              dirty.current.clear();
              setCount(0);
              blocker.proceed();
            }}
          >
            Descartar y salir
          </button>
        </Surface>
      )}
    </GuardContext.Provider>
  );
}
export function useDirtyNavigation(value: boolean) {
  const context = useContext(GuardContext);
  const id = useId();
  const setDirty = context?.setDirty;
  useEffect(() => {
    setDirty?.(id, value);
    return () => setDirty?.(id, false);
  }, [id, value, setDirty]);
  return useCallback(() => setDirty?.(id, false), [id, setDirty]);
}
