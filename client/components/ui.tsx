import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {IconAlert, IconCheckCircle, IconInfo, IconX} from '../lib/icons';

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'ok' | 'error';
}

interface ToastApi {
  info: (message: string) => void;
  ok: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi>({info: () => {}, ok: () => {}, error: () => {}});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({children}: {children: ReactNode}) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((message: string, tone: Toast['tone']) => {
    const id = nextId.current++;
    setToasts((current) => [...current.slice(-3), {id, message, tone}]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), tone === 'error' ? 7000 : 3600);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      info: (m) => push(m, 'info'),
      ok: (m) => push(m, 'ok'),
      error: (m) => push(m, 'error'),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone === 'error' ? 'is-error' : t.tone === 'ok' ? 'is-ok' : ''}`}>
            {t.tone === 'ok' ? <IconCheckCircle size={15} /> : t.tone === 'error' ? <IconAlert size={15} /> : <IconInfo size={15} />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

/** Tracks nested dialogs so Escape only closes the one on top. */
const modalStack: symbol[] = [];

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide,
  labelledBy = 'modal-title',
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  labelledBy?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = Symbol('modal');
    modalStack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalStack.at(-1) === id) onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      const index = modalStack.indexOf(id);
      if (index >= 0) modalStack.splice(index, 1);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-lg' : ''}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy} ref={panel}>
        <div className="modal-head">
          <div>
            <h2 id={labelledBy}>{title}</h2>
            {subtitle && <div className="card-sub">{subtitle}</div>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <IconX size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Confirm                                                             */
/* ------------------------------------------------------------------ */

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  tone = 'default',
  onConfirm,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className={tone === 'danger' ? 'btn btn-danger' : 'btn btn-primary'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <div style={{fontSize: 14, lineHeight: 1.6, color: 'var(--ink-2)'}}>{message}</div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="field">
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && (
        <div className="tiny muted" style={{marginTop: 4}}>
          {hint}
        </div>
      )}
    </div>
  );
}

export function EmptyState({icon, title, hint}: {icon?: ReactNode; title: string; hint?: string}) {
  return (
    <div className="doc-empty">
      {icon && <div style={{color: 'var(--ink-4)', marginBottom: 6}}>{icon}</div>}
      <div className="title">{title}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
