import { lazy } from 'react'
import { CheckCheck } from 'lucide-react'
import type { ExtensionModule } from '../types'

const ApprovalsPage = lazy(() => import('./ApprovalsPage'))

const mod: ExtensionModule = {
  manifest: {
    id: 'approvals',
    label: 'Approvals',
    icon: CheckCheck,
    flag: 'approvals',
    items: [{ to: '/approvals', label: 'Approval queue', icon: CheckCheck, forStaff: true }],
  },
  routes: [{ path: 'approvals', element: <ApprovalsPage /> }],
}

export default mod
