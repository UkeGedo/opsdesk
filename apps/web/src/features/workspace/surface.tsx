import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/** Native modal dialog keeps focus inside and restores it when closed. */
export function Surface({
  title,
  children,
  onClose,
  dirty = false,
  drawer = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  dirty?: boolean;
  drawer?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [confirming, setConfirming] = useState(false);
  const [width, setWidth] = useState(() => {
    try {
      const value = Number(localStorage.getItem('opsdesk-drawer-width'));
      return value >= 360 && value <= 720 ? value : 520;
    } catch {
      return 520;
    }
  });
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const preventLoss = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventLoss);
    return () => window.removeEventListener('beforeunload', preventLoss);
  }, [dirty]);
  function requestClose() {
    if (dirty) setConfirming(true);
    else onClose();
  }
  return (
    <dialog
      ref={ref}
      className={`surface ${drawer ? 'surface-drawer' : ''}`}
      aria-labelledby={titleId}
      style={drawer ? ({ '--drawer-width': `${width}px` } as CSSProperties) : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (confirming) setConfirming(false);
        else requestClose();
      }}
    >
      <div className="surface-header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" aria-label="Cerrar ventana" onClick={requestClose}>
          ×
        </button>
      </div>
      {drawer && (
        <label className="drawer-width">
          Ancho del panel
          <input
            type="range"
            min="360"
            max="720"
            step="20"
            value={width}
            onChange={(event) => {
              const value = Number(event.target.value);
              setWidth(value);
              try {
                localStorage.setItem('opsdesk-drawer-width', String(value));
              } catch {
                /* Preferencia opcional. */
              }
            }}
          />
        </label>
      )}
      {dirty && (
        <p className="surface-dirty" role="status">
          Hay cambios sin guardar.
        </p>
      )}
      {confirming && (
        <div className="surface-confirm" role="alert">
          <p>¿Descartar los cambios sin guardar?</p>
          <button type="button" onClick={() => setConfirming(false)}>
            Seguir editando
          </button>{' '}
          <button type="button" onClick={onClose}>
            Descartar cambios
          </button>
        </div>
      )}
      <div hidden={confirming}>{children}</div>
    </dialog>
  );
}
