import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { migrateLocalStorageKeys } from './lib/migrateLocalStorage.ts'

migrateLocalStorageKeys()

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
      console.info('Gigboi is ready to work offline.')
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
