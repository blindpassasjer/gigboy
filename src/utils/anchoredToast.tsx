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

type AnchoredToastOptions = ToastOptions & { icon?: string };

function showAnchoredToast(message: string, options?: AnchoredToastOptions): string {
  const anchor = getActiveToastAnchor();
  const icon = options?.icon;

  return hotToast.custom(
    () => (
      <div style={{ ...toastCardStyle, ...getAnchoredToastStyle(anchor) }} role="status" aria-live="polite">
        {icon ? <span style={{ marginRight: '0.45rem' }}>{icon}</span> : null}
        {message}
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
  (message: string, options?: AnchoredToastOptions) => showAnchoredToast(message, options),
  {
    success: (message: string, options?: AnchoredToastOptions) => showAnchoredToast(message, options),
    error: (message: string, options?: AnchoredToastOptions) => showAnchoredToast(message, options),
    dismiss: hotToast.dismiss,
    custom: hotToast.custom,
  }
);

export default toast;
