import hotToast, { type ToastOptions } from 'react-hot-toast';
import { getActiveToastAnchor, getAnchoredToastStyle } from './toastAnchor';

const toastCardStyle = {
  border: '1px solid var(--border)',
  borderRadius: '10px',
  background: 'var(--surface)',
  color: 'var(--text)',
  boxShadow: 'var(--shadow)',
  padding: '0.7rem 0.8rem',
  minWidth: '280px',
  maxWidth: '420px',
} as const;

type AnchoredToastOptions = ToastOptions & { 
  icon?: string;
  action?: {
    label: string;
    href: string;
  };
};

function showAnchoredToast(message: string | React.ReactNode, options?: AnchoredToastOptions): string {
  const anchor = getActiveToastAnchor();
  const icon = options?.icon;
  const action = options?.action;

  return hotToast.custom(
    () => (
      <div style={{ ...toastCardStyle, ...getAnchoredToastStyle(anchor) }} role="status" aria-live="polite">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
            {icon ? <span style={{ marginRight: '0.45rem', flexShrink: 0 }}>{icon}</span> : null}
            <span style={{ wordBreak: 'break-word' }}>{message}</span>
          </div>
          {action ? (
            <a
              href={action.href}
              style={{
                color: 'var(--accent, #0f766e)',
                textDecoration: 'none',
                fontWeight: 500,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                padding: '0.3rem 0.5rem',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.textDecoration = 'underline';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.textDecoration = 'none';
              }}
            >
              {action.label}
            </a>
          ) : null}
        </div>
      </div>
    ),
    {
      id: options?.id,
      duration: options?.duration,
      ariaProps: options?.ariaProps,
      position: 'top-left',
    }
  );
}

const toast = Object.assign(
  (message: string | React.ReactNode, options?: AnchoredToastOptions) => showAnchoredToast(message, options),
  {
    success: (message: string | React.ReactNode, options?: AnchoredToastOptions) => showAnchoredToast(message, options),
    error: (message: string | React.ReactNode, options?: AnchoredToastOptions) => showAnchoredToast(message, options),
    dismiss: hotToast.dismiss,
    custom: hotToast.custom,
  }
);

export default toast;
