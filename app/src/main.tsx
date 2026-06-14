import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './features/pwa/installPrompt' // attach beforeinstallprompt listener on load
import './i18n'
import './index.css'

// autoUpdate: when a new SW activates, the page reloads itself once so a deploy
// reaches the device. We trigger the update check whenever the app is opened or
// brought to the foreground — an installed PWA resumed from the background never
// re-navigates, so the browser won't check sw.js on its own. The hourly tick
// covers sessions that stay open for days. Checks are throttled so toggling
// focus doesn't hammer the network.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    let lastCheck = 0
    const check = () => {
      const now = Date.now()
      if (now - lastCheck < 60_000) return
      lastCheck = now
      registration.update()
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
    setInterval(check, 60 * 60 * 1000)
  },
})

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
