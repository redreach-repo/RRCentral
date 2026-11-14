/**
 * App sidebar module manifests (M1). Layout renders these; edit here, not in Layout.tsx.
 */
import {
  Activity,
  Banknote,
  BarChart3,
  BookOpen,
  Boxes,
  Briefcase,
  Bug,
  Building2,
  CalendarClock,
  ClipboardList,
  Contact,
  CopyCheck,
  FileBarChart,
  FileSignature,
  FileText,
  FolderOpen,
  Gauge,
  Globe,
  Handshake,
  HeartPulse,
  KeyRound,
  LayoutDashboard,
  LayoutTemplate,
  LifeBuoy,
  MessageSquareWarning,
  Package,
  PhoneCall,
  Plane,
  Receipt,
  ScrollText,
  Send,
  Settings,
  ShieldCheck,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react'
import { WorshipHubIcon } from '../components/worshiphub/WorshipHubIcon'
import { shouldHidePipelineDetailNavItem } from '../lib/pipelineDetailNav'
import { roleAtLeast } from '../lib/permissions'
import type { UserRole } from '../lib/types'
import { modulesEnabled, parseModuleFlags, type ModuleManifest, type ModuleNavItem } from './registry'

export const APP_MODULES: ModuleManifest[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: LayoutDashboard,
    items: [
      { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/guide', label: 'Guide', icon: BookOpen },
    ],
  },
  {
    id: 'sales',
    label: 'Sales',
    icon: Users,
    items: [
      { to: '/quick-add', label: 'Quick add', icon: PhoneCall, minRole: 'sales', section: 'Work' },
      { to: '/deals', label: 'Pipeline', icon: Briefcase, forStaff: true, section: 'Work' },
      { to: '/crm', label: 'My Day', icon: Users, section: 'Work' },
      { to: '/follow-ups', label: 'Follow-ups', icon: CalendarClock, section: 'Work' },
      { to: '/sales', label: 'AI CRM detail', icon: TrendingUp, minRole: 'sales', section: 'Work' },
      { to: '/ctrm', label: 'CTRM detail', icon: Handshake, minRole: 'sales', section: 'Work' },
      { to: '/quotations', label: 'Quotations', icon: FileText, section: 'Documents' },
      { to: '/invoices', label: 'Invoices', icon: Receipt, section: 'Documents' },
      { to: '/delivery-notes', label: 'Delivery notes', icon: Truck, section: 'Documents' },
      { to: '/customer-files', label: 'Google Drive', icon: FolderOpen, section: 'Documents' },
    ],
  },
  {
    id: 'clients',
    label: 'Clients',
    icon: Contact,
    items: [
      { to: '/accounts', label: 'Accounts', icon: Contact, forStaff: true },
      { to: '/support', label: 'Support', icon: LifeBuoy, forStaff: true },
      { to: '/ctrm-issues', label: 'CTRM issues', icon: MessageSquareWarning, forStaff: true },
      { to: '/client-health', label: 'Client health', icon: HeartPulse, forStaff: true },
      { to: '/client-reports', label: 'Monthly reports', icon: FileBarChart, forStaff: true },
      { to: '/client-updates', label: 'Weekly updates', icon: Send, forStaff: true },
    ],
  },
  {
    id: 'delivery',
    label: 'Delivery',
    icon: Package,
    items: [
      { to: '/products', label: 'WorshipHub', icon: WorshipHubIcon, forStaff: true },
      { to: '/delivery-settings', label: 'Packages', icon: Package, minRole: 'manager' },
      { to: '/build-templates', label: 'Build templates', icon: ClipboardList, forStaff: true },
      { to: '/agreement-template', label: 'Agreement', icon: ScrollText, forStaff: true },
      { to: '/nda-template', label: 'NDA template', icon: FileSignature, forStaff: true },
      { to: '/clause-library', label: 'Clause library', icon: ScrollText, forStaff: true },
      { to: '/obligations', label: 'Obligations', icon: ClipboardList, forStaff: true },
    ],
  },
  {
    id: 'ops',
    label: 'Operations',
    icon: Wrench,
    /** Soft-hide via app_settings.moduleFlags JSON, e.g. {"ops":false}. */
    flag: 'ops',
    items: [
      { to: '/app/wanders', label: 'Wanders', icon: Plane },
      { to: '/catalog', label: 'Catalog', icon: Package },
      { to: '/inventory', label: 'Inventory', icon: Boxes },
      { to: '/templates', label: 'Templates', icon: LayoutTemplate },
      { to: '/domains', label: 'Domains', icon: Globe },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    icon: Banknote,
    items: [
      { to: '/payments', label: 'Payments', icon: Banknote },
      { to: '/expenses', label: 'Expenses', icon: Wallet },
      { to: '/vendors', label: 'Vendors', icon: Building2 },
      { to: '/reports', label: 'Reports', icon: BarChart3 },
      { to: '/mrr', label: 'MRR', icon: TrendingUp, minRole: 'manager' },
      { to: '/insights', label: 'Utilisation', icon: Gauge, minRole: 'manager' },
      { to: '/duplicates', label: 'Duplicates', icon: CopyCheck, minRole: 'manager' },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: Settings,
    items: [
      { to: '/settings', label: 'Settings', icon: Settings, minRole: 'admin' },
      {
        to: '/settings#account',
        label: 'Account',
        icon: KeyRound,
        roles: ['manager', 'sales', 'staff', 'viewer'],
        forStaff: true,
      },
      { to: '/audit-log', label: 'Audit log', icon: ShieldCheck, minRole: 'admin' },
      { to: '/app-errors', label: 'App errors', icon: Bug, minRole: 'admin' },
      { to: '/system-check', label: 'System check', icon: Activity, minRole: 'admin' },
    ],
  },
]

/** Topbar titles that differ from the short nav label (longer / more specific). */
const PATH_TITLE_OVERRIDES: { match: (path: string) => boolean; title: string }[] = [
  { match: (p) => p.startsWith('/delivery-settings'), title: 'Packages and rates' },
  { match: (p) => p.startsWith('/agreement-template'), title: 'Agreement template' },
  { match: (p) => p.startsWith('/clause-library'), title: 'Clause library' },
  { match: (p) => p.startsWith('/obligations'), title: 'Obligations board' },
  { match: (p) => p.startsWith('/mrr'), title: 'Monthly recurring revenue' },
  { match: (p) => p.startsWith('/insights'), title: 'Utilisation and profit' },
]

function navItemPath(to: string): string {
  return to.split('#')[0] || to
}

export function itemMatchesPath(pathname: string, item: ModuleNavItem): boolean {
  const base = navItemPath(item.to)
  if (item.end) return pathname === base
  return pathname === base || pathname.startsWith(`${base}/`)
}

/** Module id whose items cover this path (default sales). */
export function moduleIdForPath(pathname: string, modules: ModuleManifest[] = APP_MODULES): string {
  for (const group of modules) {
    if (group.items.some((item) => itemMatchesPath(pathname, item))) return group.id
  }
  return 'sales'
}

/** Document title / topbar string for the current path. */
export function titleForPath(pathname: string, modules: ModuleManifest[] = APP_MODULES): string | null {
  for (const over of PATH_TITLE_OVERRIDES) {
    if (over.match(pathname)) return over.title
  }
  // Longer paths first so /delivery-settings wins over /delivery-notes-style prefixes when shared.
  const items = modules
    .flatMap((m) => m.items)
    .slice()
    .sort((a, b) => navItemPath(b.to).length - navItemPath(a.to).length)
  for (const item of items) {
    if (itemMatchesPath(pathname, item)) return item.label
  }
  return null
}

export function enabledAppModules(flags: Record<string, boolean> = {}): ModuleManifest[] {
  return modulesEnabled(APP_MODULES, flags)
}

/** Whether a nav item is shown for this role (mirrors Layout / Cmd+K). */
export function navItemVisible(
  item: ModuleNavItem,
  userRole: UserRole,
  settings: Record<string, string | undefined> = {},
): boolean {
  if (userRole === 'staff' && !item.forStaff) return false
  // Soft-hide must run before minRole — /sales and /ctrm both set minRole: sales.
  if (shouldHidePipelineDetailNavItem(item.to, settings, userRole)) return false
  if (item.roles) return item.roles.includes(userRole)
  if (item.minRole) return roleAtLeast(userRole, item.minRole)
  return true
}

/**
 * Modules after feature flags, with items filtered by role / settings.
 * Empty modules are dropped. Used by Layout and the command palette.
 */
export function visibleAppModules(
  userRole: UserRole,
  settings: Record<string, string | undefined> = {},
  flags?: Record<string, boolean>,
  modules: ModuleManifest[] = APP_MODULES,
): ModuleManifest[] {
  const resolvedFlags = flags ?? parseModuleFlags(settings)
  return modulesEnabled(modules, resolvedFlags)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => navItemVisible(item, userRole, settings)),
    }))
    .filter((group) => group.items.length > 0)
}
