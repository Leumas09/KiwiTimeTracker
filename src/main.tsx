import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './i18n'
import './index.css'

// Pick up new deployments without closing the app: check when the window
// comes back to the front (at most every 5 minutes). In autoUpdate mode the
// page reloads by itself once the new version is active.
const CHECK_EVERY_MS = 5 * 60_000
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    let lastCheck = Date.now()
    const check = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastCheck < CHECK_EVERY_MS) return
      lastCheck = Date.now()
      registration.update().catch(() => {
        // Offline: try again next time.
      })
    }
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
