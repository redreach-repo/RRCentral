import { lazy } from 'react'
import { Webhook } from 'lucide-react'
import type { ExtensionModule } from '../types'

const DevelopersPage = lazy(() => import('./DevelopersPage'))

const mod: ExtensionModule = {
  manifest: {
    id: 'developers',
    label: 'Developers',
    icon: Webhook,
    flag: 'developers',
    items: [{ to: '/developers', label: 'API keys and webhooks', icon: Webhook, roles: ['admin'] }],
  },
  routes: [{ path: 'developers', element: <DevelopersPage /> }],
}

export default mod
