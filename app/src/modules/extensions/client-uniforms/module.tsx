import { lazy } from 'react'
import { Shirt } from 'lucide-react'
import type { ExtensionModule } from '../types'

const ClientUniformsPage = lazy(() => import('./ClientUniformsPage'))

/**
 * RR Threads (01): uniform sizes of our clients' staff and the issue log.
 * Same access as the clients list: admin / manager / sales edit, viewer reads.
 */
const mod: ExtensionModule = {
  manifest: {
    id: 'clientUniforms',
    label: 'Uniform sizes',
    icon: Shirt,
    items: [{ to: '/uniform-sizes', label: 'Uniform sizes', icon: Shirt, roles: ['admin', 'manager', 'sales', 'viewer'], section: 'Client care', flag: 'clients' }],
  },
  routes: [{ path: 'uniform-sizes', element: <ClientUniformsPage /> }],
  // Listed under Operations > Client care rather than as a sidebar group of its own.
  attachTo: 'ops',
}

export default mod
