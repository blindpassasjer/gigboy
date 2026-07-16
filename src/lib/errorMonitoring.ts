import * as Sentry from '@sentry/react'

/**
 * No-op unless VITE_SENTRY_DSN is set, so local/dev builds never phone home.
 */
export function initErrorMonitoring(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  })
}
