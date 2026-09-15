import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import '@radix-ui/themes/styles.css'
import './index.css'
import { migrateLocalStorageKeys } from './lib/migrateLocalStorage.ts'
import { isDynamicImportFailure, recoverFromDynamicImportFailure } from './lib/chunkRecovery.ts'
import { initErrorMonitoring } from './lib/errorMonitoring.ts'
import { reloadWhenSafe } from './lib/reloadGuard.ts'

migrateLocalStorageKeys()
initErrorMonitoring()

function installChunkRecoveryHandlers() {
  window.addEventListener('error', (event) => {
    const maybeError = event.error ?? event.message
    if (isDynamicImportFailure(maybeError)) {
      recoverFromDynamicImportFailure()
    }
  })

  window.addEventListener('unhandledrejection', (event) => {
    if (isDynamicImportFailure(event.reason)) {
      event.preventDefault()
      recoverFromDynamicImportFailure()
    }
  })
}

installChunkRecoveryHandlers()

async function setupPwa() {
  if (!import.meta.env.PROD) return

  // registerType is 'autoUpdate', so a new SW can take control of this tab
  // silently in the background (no onNeedRefresh prompt) while it's still
  // running old JS. cleanupOutdatedCaches then removes the old chunk files,
  // so any later lazy import of a not-yet-loaded route 404s. Reload once a
  // new SW takes over from a SW that was already controlling this tab, so
  // it never lingers on stale JS.
  //
  // The very first controllerchange this tab ever sees (controller was null
  // beforehand) just means a freshly-installed SW is claiming this page for
  // the first time — the page was already running current JS, so there's
  // nothing stale to recover from and reloading would just be a pointless
  // flash on every first visit / cold cache.
  if ('serviceWorker' in navigator) {
    let sawInitialClaim = Boolean(navigator.serviceWorker.controller)
    let reloadedForNewController = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadedForNewController) return
      if (!sawInitialClaim) {
        sawInitialClaim = true
        return
      }
      reloadedForNewController = true
      reloadWhenSafe(() => window.location.reload())
    })
  }

  const { registerSW } = await import('virtual:pwa-register')
  registerSW({
    immediate: true,
    onOfflineReady() {
      console.info('GIGBOY is ready to work offline.')
    },
    // A SPA tab left open never re-fetches sw.js on its own — browsers only
    // check for a new SW on navigation or ~once per 24h. Poll explicitly so
    // an open tab picks up a new deploy within a minute instead of waiting
    // for the user to navigate or the 24h cap.
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return

      const checkForUpdate = () => {
        if (document.visibilityState === 'visible') {
          void registration.update()
        }
      }

      setInterval(checkForUpdate, 45_000)
      document.addEventListener('visibilitychange', checkForUpdate)
    },
  })
}

void setupPwa()

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element (#root) not found in DOM. Cannot initialize application.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
