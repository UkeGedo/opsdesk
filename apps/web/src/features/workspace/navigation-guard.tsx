import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useBlocker } from 'react-router-dom';
import { Surface } from './surface';

type Guard = {
  setDirty: (id: string, dirty: boolean, protectTicketSelection?: boolean) => void;
  confirmDiscard: () => boolean;
};
const GuardContext = createContext<Guard | null>(null);

export function NavigationGuard({ children }: { children: ReactNode }) {
  const dirty = useRef(new Map<string, boolean>());
  const [count, setCount] = useState(0);
  const [expired, setExpired] = useState(false);
  const setDirty = useCallback((id: string, value: boolean, protectTicketSelection = false) => {
    if (value) dirty.current.set(id, protectTicketSelection);
    else dirty.current.delete(id);
    setCount(dirty.current.size);
  }, []);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty.current.size > 0 &&
      (currentLocation.pathname !== nextLocation.pathname ||
        (Array.from(dirty.current.values()).some(Boolean) &&
          new URLSearchParams(currentLocation.search).get('ticket') !==
            new URLSearchParams(nextLocation.search).get('ticket'))),
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
  useEffect(() => {
    function handleExpired(event: Event) {
      if (dirty.current.size === 0) return;
      event.preventDefault();
      setExpired(true);
    }
    window.addEventListener('opsdesk:session-expired', handleExpired);
    return () => window.removeEventListener('opsdesk:session-expired', handleExpired);
  }, []);
  return (
    <GuardContext.Provider
      value={{
        setDirty,
        confirmDiscard: () =>
          dirty.current.size === 0 ||
          window.confirm('Hay cambios sin guardar. ¿Cerrar sesión y descartarlos?'),
      }}
    >
      {children}
      {expired && (
        <div className="session-expired-banner" role="alert">
          <p>
            Tu sesión venció. Copia tus cambios antes de volver a iniciar sesión; no pueden
            guardarse con la sesión vencida.
          </p>
          <button
            type="button"
            onClick={() => {
              if (
                dirty.current.size &&
                !window.confirm('Los cambios sin guardar se descartarán. ¿Ir a iniciar sesión?')
              )
                return;
              dirty.current.clear();
              setCount(0);
              window.dispatchEvent(new Event('opsdesk:exit-expired'));
            }}
          >
            Ir a iniciar sesión
          </button>
        </div>
      )}
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
export function useConfirmDirty() {
  return useContext(GuardContext)?.confirmDiscard ?? (() => true);
}
export function useDirtyNavigation(value: boolean, protectTicketSelection = false) {
  const context = useContext(GuardContext);
  const id = useId();
  const setDirty = context?.setDirty;
  useLayoutEffect(() => {
    setDirty?.(id, value, protectTicketSelection);
    return () => setDirty?.(id, false);
  }, [id, value, setDirty, protectTicketSelection]);
  return useCallback(() => setDirty?.(id, false), [id, setDirty]);
}
