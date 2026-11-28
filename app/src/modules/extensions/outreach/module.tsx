import { lazy } from 'react'
import { MailPlus } from 'lucide-react'
import type { ExtensionModule } from '../types'

const OutreachPage = lazy(() => import('./OutreachPage'))

/**
 * Prospect outreach (CTRM Next): import prospects, review and approve each
 * email, send it one at a time from your own Zoho mailbox.
 * Admin and manager only; the database refuses everyone else, AI connector
 * keys included. Listed in Settings, Users so it can be hidden per person.
 */
const mod: ExtensionModule = {
  manifest: {
    id: 'outreach',
    label: 'Prospect outreach',
    icon: MailPlus,
    items: [{ to: '/outreach', label: 'Prospect outreach', icon: MailPlus, roles: ['admin', 'manager'], section: 'Marketing', flag: 'sales' }],
  },
  routes: [{ path: 'outreach', element: <OutreachPage /> }],
  // Sales > Marketing, next to Campaigns.
  attachTo: 'sales',
}

export default mod
