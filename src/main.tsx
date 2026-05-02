import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

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
      console.info('Folio is ready to work offline.')
    },
  })
}

void setupPwa()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
