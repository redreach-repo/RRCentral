import { lazy } from 'react'
import { LayoutDashboard } from 'lucide-react'
import type { ExtensionModule } from '../types'

const DashboardsPage = lazy(() => import('./DashboardsPage'))

const mod: ExtensionModule = {
  manifest: {
    id: 'dashboards',
    label: 'Dashboards',
    icon: LayoutDashboard,
    flag: 'overview',
    items: [
      {
        to: '/dashboards',
        label: 'Custom dashboards',
        icon: LayoutDashboard,
        forStaff: true,
      },
    ],
  },
  routes: [{ path: 'dashboards', element: <DashboardsPage /> }],
  attachTo: 'overview',
}

export default mod
