import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { titleForPath } from '../modules/nav'

/** Politely announce route changes for screen readers. */
export default function RouteAnnouncer() {
  const location = useLocation()
  const [message, setMessage] = useState('')

  useEffect(() => {
    const title = titleForPath(location.pathname) || 'RED REACH Central'
    // Defer so focus/DOM settle before the announcement.
    const t = window.setTimeout(() => setMessage(title), 50)
    return () => window.clearTimeout(t)
  }, [location.pathname])

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="rr-sr-only"
      id="rr-route-announcer"
    >
      {message ? `Navigated to ${message}` : ''}
    </div>
  )
}
