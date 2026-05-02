import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
import './index.css'

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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
