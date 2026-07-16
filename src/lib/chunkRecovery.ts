const CHUNK_FAILURE_PATTERNS = [
  'failed to fetch dynamically imported module',
  'importing a module script failed',
  'chunkloaderror',
  'loading chunk',
]

const RELOAD_GUARD_KEY = 'gigboy:chunk-reload-attempted'

function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    return typeof message === 'string' ? message : ''
  }

  return ''
}

export function isDynamicImportFailure(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase()
  if (!message) return false

  return CHUNK_FAILURE_PATTERNS.some((pattern) => message.includes(pattern))
}

function withTimeout(promise: Promise<unknown>, ms: number): Promise<unknown> {
  return Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))])
}

async function clearStaleServiceWorkerState(): Promise<void> {
  const tasks: Promise<unknown>[] = []

  if ('serviceWorker' in navigator) {
    tasks.push(
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => undefined)
    )
  }

  if ('caches' in window) {
    tasks.push(
      caches
        .keys()
        .then((names) => Promise.all(names.map((name) => caches.delete(name))))
        .catch(() => undefined)
    )
  }

  await withTimeout(Promise.all(tasks), 1500)
}

function reloadWithClearedState(): void {
  const url = new URL(window.location.href)
  url.searchParams.set('chunk-reload', Date.now().toString())

  void clearStaleServiceWorkerState().finally(() => {
    window.location.replace(url.toString())
  })
}

export function recoverFromDynamicImportFailure(): boolean {
  try {
    if (window.sessionStorage.getItem(RELOAD_GUARD_KEY) === '1') {
      return false
    }

    window.sessionStorage.setItem(RELOAD_GUARD_KEY, '1')
    reloadWithClearedState()
    return true
  } catch {
    return false
  }
}

/**
 * Same cleanup as recoverFromDynamicImportFailure, but ignores the
 * one-shot guard. Used for the user-initiated "Reload app" button, which
 * would otherwise silently degrade to a plain reload once the automatic
 * recovery has already fired once this tab session (still stale SW/caches
 * if that first attempt didn't fully land, e.g. its 1.5s timeout elapsed
 * before unregister/cache-delete finished).
 */
export function forceReloadAfterChunkFailure(): void {
  try {
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, '1')
    reloadWithClearedState()
  } catch {
    window.location.reload()
  }
}
