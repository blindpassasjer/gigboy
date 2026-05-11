import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import '@radix-ui/themes/styles.css'
import './index.css'
import { migrateLocalStorageKeys } from './lib/migrateLocalStorage.ts'
import { isDynamicImportFailure, recoverFromDynamicImportFailure } from './lib/chunkRecovery.ts'

migrateLocalStorageKeys()

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

  const { registerSW } = await import('virtual:pwa-register')
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      const shouldRefresh = window.confirm('A new version is available. Reload now?')
      if (shouldRefresh) {
        void updateSW(true)
      }
    },
    onOfflineReady() {
      console.info('GIGBOY is ready to work offline.')
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
