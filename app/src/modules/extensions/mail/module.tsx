import { lazy } from 'react'
import { Mail } from 'lucide-react'
import type { ExtensionModule } from '../types'

const MailPage = lazy(() => import('./MailPage'))

/**
 * Mail: each person's own Zoho mailbox inside RR Central (read only for now).
 * Admin, manager and sales, the same people the mail-inbox function lets in.
 * Nobody can open another person's mailbox.
 * Hide with app_settings.moduleFlags {"mail":false}.
 */
const mod: ExtensionModule = {
  manifest: {
    id: 'mail',
    label: 'Mail',
    icon: Mail,
    flag: 'mail',
    items: [{ to: '/mail', label: 'Mail', icon: Mail, roles: ['admin', 'manager', 'sales'] }],
  },
  routes: [{ path: 'mail', element: <MailPage /> }],
}

export default mod
