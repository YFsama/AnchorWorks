import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Service-worker registration — `vite-plugin-pwa` injects the generated SW
// behind the `virtual:pwa-register` module. Wrapped in try/catch so dev
// builds (where the virtual module is a no-op) and SSR contexts don't blow up
// if registration fails or is unsupported.
try {
  // Dynamic import keeps the SW glue out of the critical path; failures are
  // silently swallowed (offline support is additive).
  void import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({ immediate: true })
  }).catch(() => { /* no-op: PWA support is best-effort */ })
} catch {
  /* no-op: e.g. SSR / non-browser environments */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
