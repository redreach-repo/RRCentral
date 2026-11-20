import { lazy } from 'react'
import { Bot } from 'lucide-react'
import type { ExtensionModule } from '../types'

const AiConnectorPage = lazy(() => import('./AiConnectorPage'))

/**
 * AI connector: keys for the HighMast MCP server (Edge Function highmast-mcp),
 * which AI assistants such as Grok Bot use. Admin only; sits in the Admin group.
 */
const mod: ExtensionModule = {
  manifest: {
    id: 'ai-connector',
    label: 'AI connector',
    icon: Bot,
    items: [{ to: '/ai-connector', label: 'AI connector', icon: Bot, minRole: 'admin' }],
  },
  routes: [{ path: 'ai-connector', element: <AiConnectorPage /> }],
  attachTo: 'admin',
}

export default mod
