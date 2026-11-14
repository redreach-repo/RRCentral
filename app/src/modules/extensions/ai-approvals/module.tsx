import { lazy } from 'react'
import { Sparkles } from 'lucide-react'
import type { ExtensionModule } from '../types'

const AiApprovalsPage = lazy(() => import('./AiApprovalsPage'))

const mod: ExtensionModule = {
  manifest: {
    id: 'aiApprovals',
    label: 'AI approvals',
    icon: Sparkles,
    items: [{ to: '/ai-approvals', label: 'AI approvals', icon: Sparkles, roles: ['admin', 'manager', 'sales', 'staff'] }],
  },
  routes: [{ path: 'ai-approvals', element: <AiApprovalsPage /> }],
}

export default mod
