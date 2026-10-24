import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import StagingBanner from './components/StagingBanner'
import { handoffTarget, isStagingBuild, routerBasename, stagingHandoff } from './lib/appEnv'
import './index.css'
import { installErrorReporting } from './lib/errorReporting'

installErrorReporting()

const staging = isStagingBuild()
const handoff = stagingHandoff(window.location, staging)

if (handoff) {
  // A staging deep link landed on the live app's 404 page.
  window.location.replace(handoff)
} else {
  if (staging) {
    const target = handoffTarget(window.location.search)
    if (target) window.history.replaceState(null, '', target)
    document.title = `[Staging] ${document.title}`
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter basename={routerBasename()}>
        {staging ? <StagingBanner /> : null}
        <App />
      </BrowserRouter>
    </StrictMode>,
  )
}

// The live app's service worker covers /RRCentral/, so staging does not install its own.
if (import.meta.env.PROD && !staging && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* installability is best-effort */
    })
  })
}
