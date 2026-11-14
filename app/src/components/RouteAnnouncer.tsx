import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useSettings } from '../contexts/SettingsContext'
import { useTenant } from '../contexts/TenantContext'
import { PRODUCT } from '../lib/product'
import { titleForPath } from '../modules/nav'

/** Politely announce route changes for screen readers. */
export default function RouteAnnouncer() {
  const location = useLocation()
  const { settings } = useSettings()
  const { activeCompany } = useTenant()
  const [message, setMessage] = useState('')

  useEffect(() => {
    const company =
      activeCompany?.name || settings.companyName || settings.brand || PRODUCT.name
    const page = titleForPath(location.pathname) || company
    const title = page === company ? company : `${page}, ${company}`
    document.title = title
    // Defer so focus/DOM settle before the announcement.
    const t = window.setTimeout(() => setMessage(page), 50)
    return () => window.clearTimeout(t)
  }, [location.pathname, activeCompany?.name, settings.companyName, settings.brand])

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
