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
  CalendarDays,
  ClipboardList,
  Clock,
  DraftingCompass,
  HardHat,
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
  Inbox,
  KeyRound,
  Layers,
  LayoutDashboard,
  Megaphone,
  LayoutTemplate,
  LifeBuoy,
  MessageSquareWarning,
  Package,
  Palette,
  PhoneCall,
  Plane,
  Receipt,
  ScrollText,
  Send,
  Settings,
  ShieldCheck,
  Target,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  Wrench,
  CreditCard,
} from 'lucide-react'
import { WorshipHubIcon } from '../components/worshiphub/WorshipHubIcon'
import { shouldHidePipelineDetailNavItem } from '../lib/pipelineDetailNav'
import { roleAtLeast } from '../lib/permissions'
import type { UserRole } from '../lib/types'
import { modulesEnabled, parseModuleFlags, type ModuleManifest, type ModuleNavItem } from './registry'
import { EXTENSION_MODULES } from './extensions'
import { mergeExtensionNav } from './extensions/collect'

/**
 * Sidebar, rebuilt Nov 2026: Home links at the top, then five separate groups.
 * Every page lives in exactly one group (nav.test.ts checks this).
 *
 * The Settings > Modules switches still work page by page: each link carries
 * the `flag` of the switch that used to hide it (sales, documents, clients,
 * delivery, ops, finance, hr, payroll, marketing, saasBilling, industryPacks),
 * and a group with no links left disappears on its own.
 */
const CORE_MODULES: ModuleManifest[] = [
  {
    id: 'overview',
    label: 'Home',
    icon: LayoutDashboard,
    /** Plain links at the top, no group heading. */
    flat: true,
    items: [
      { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true, flag: 'overview' },
      { to: '/guide', label: 'Guide', icon: BookOpen, flag: 'overview' },
    ],
  },
  {
    /** Mail, calendar and contacts. Mail joins from modules/extensions/mail. */
    id: 'connect',
    label: 'Mail, calendar, contacts',
    icon: Inbox,
    items: [
      { to: '/follow-ups', label: 'Calendar and follow-ups', icon: CalendarClock, flag: 'sales' },
      { to: '/accounts', label: 'Clients and contacts', icon: Contact, forStaff: true, flag: 'clients' },
    ],
  },
  {
    id: 'sales',
    label: 'Sales',
    icon: TrendingUp,
    items: [
      { to: '/quick-add', label: 'Quick add', icon: PhoneCall, minRole: 'sales', section: 'Work', flag: 'sales' },
      { to: '/deals', label: 'Pipeline', icon: Briefcase, forStaff: true, section: 'Work', flag: 'sales' },
      { to: '/crm', label: 'My Day', icon: Users, section: 'Work', flag: 'sales' },
      { to: '/sales', label: 'AI CRM detail', icon: TrendingUp, minRole: 'sales', section: 'Work', flag: 'sales' },
      { to: '/ctrm', label: 'CTRM detail', icon: Handshake, minRole: 'sales', section: 'Work', flag: 'sales' },
      { to: '/quotations', label: 'Quotations', icon: FileText, section: 'Quotes and orders', flag: 'documents' },
      { to: '/client-pos', label: 'Client POs', icon: ClipboardList, section: 'Quotes and orders', flag: 'documents' },
      { to: '/marketing', label: 'Campaigns', icon: Megaphone, minRole: 'manager', section: 'Marketing', flag: 'marketing' },
    ],
  },
  {
    id: 'ops',
    label: 'Operations',
    icon: Wrench,
    items: [
      { to: '/support', label: 'Support', icon: LifeBuoy, forStaff: true, section: 'Client care', flag: 'clients' },
      { to: '/ctrm-issues', label: 'CTRM issues', icon: MessageSquareWarning, forStaff: true, section: 'Client care', flag: 'clients' },
      { to: '/client-health', label: 'Client health', icon: HeartPulse, forStaff: true, section: 'Client care', flag: 'clients' },
      { to: '/client-reports', label: 'Monthly reports', icon: FileBarChart, forStaff: true, section: 'Client care', flag: 'clients' },
      { to: '/client-updates', label: 'Weekly updates', icon: Send, forStaff: true, section: 'Client care', flag: 'clients' },
      // Uniform sizes joins Client care from modules/extensions/client-uniforms.
      { to: '/products', label: 'WorshipHub', icon: WorshipHubIcon, forStaff: true, section: 'Delivery', flag: 'delivery' },
      { to: '/delivery-settings', label: 'Packages', icon: Package, minRole: 'manager', section: 'Delivery', flag: 'delivery' },
      { to: '/build-templates', label: 'Build templates', icon: ClipboardList, forStaff: true, section: 'Delivery', flag: 'delivery' },
      { to: '/delivery-notes', label: 'Delivery notes', icon: Truck, section: 'Delivery', flag: 'documents' },
      { to: '/agreement-template', label: 'Agreement', icon: ScrollText, forStaff: true, section: 'Contracts', flag: 'delivery' },
      { to: '/nda-template', label: 'NDA template', icon: FileSignature, forStaff: true, section: 'Contracts', flag: 'delivery' },
      { to: '/clause-library', label: 'Clause library', icon: ScrollText, forStaff: true, section: 'Contracts', flag: 'delivery' },
      { to: '/obligations', label: 'Obligations', icon: ClipboardList, forStaff: true, section: 'Contracts', flag: 'delivery' },
      { to: '/projects', label: 'Projects', icon: Briefcase, minRole: 'manager', section: 'Projects', flag: 'ops' },
      { to: '/construction-sites', label: 'Sites', icon: HardHat, minRole: 'manager', section: 'Projects', flag: 'ops' },
      { to: '/eng-register', label: 'Eng register', icon: DraftingCompass, minRole: 'manager', section: 'Projects', flag: 'ops' },
      { to: '/app/wanders', label: 'Wanders', icon: Plane, section: 'Projects', flag: 'ops' },
      { to: '/catalog', label: 'Catalog', icon: Package, section: 'Stock and buying', flag: 'ops' },
      { to: '/inventory', label: 'Inventory', icon: Boxes, section: 'Stock and buying', flag: 'ops' },
      { to: '/purchase-orders', label: 'Purchase orders', icon: Truck, section: 'Stock and buying', flag: 'ops' },
      { to: '/templates', label: 'Templates', icon: LayoutTemplate, section: 'Web and files', flag: 'ops' },
      { to: '/domains', label: 'Domains', icon: Globe, section: 'Web and files', flag: 'ops' },
      { to: '/customer-files', label: 'Google Drive', icon: FolderOpen, section: 'Web and files', flag: 'documents' },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    icon: Banknote,
    items: [
      { to: '/invoices', label: 'Invoices', icon: Receipt, section: 'Money in', flag: 'documents' },
      { to: '/payments', label: 'Payments', icon: Banknote, section: 'Money in', flag: 'finance' },
      { to: '/expenses', label: 'Expenses', icon: Wallet, section: 'Money out', flag: 'finance' },
      { to: '/vendors', label: 'Vendors', icon: Building2, section: 'Money out', flag: 'finance' },
      { to: '/ledger', label: 'Ledger', icon: BookOpen, minRole: 'manager', section: 'Books and reports', flag: 'finance' },
      { to: '/reports', label: 'Reports', icon: BarChart3, section: 'Books and reports', flag: 'finance' },
      { to: '/mrr', label: 'MRR', icon: TrendingUp, minRole: 'manager', section: 'Books and reports', flag: 'finance' },
      { to: '/insights', label: 'Utilisation', icon: Gauge, minRole: 'manager', section: 'Books and reports', flag: 'finance' },
      { to: '/planning-goals', label: 'Goals', icon: Target, minRole: 'manager', section: 'Books and reports', flag: 'finance' },
    ],
  },
  {
    /** HR, payroll and everything admin. AI connector joins System from its extension. */
    id: 'admin',
    label: 'HR and admin',
    icon: Building2,
    items: [
      { to: '/hr/people', label: 'People', icon: Users, minRole: 'manager', section: 'People', flag: 'hr' },
      { to: '/hr/leave', label: 'Leave', icon: CalendarDays, minRole: 'manager', section: 'People', flag: 'hr' },
      { to: '/hr/attendance', label: 'Attendance', icon: Clock, minRole: 'manager', section: 'People', flag: 'hr' },
      { to: '/payroll', label: 'Payroll runs', icon: Wallet, minRole: 'manager', section: 'People', flag: 'payroll' },
      { to: '/approvals', label: 'Approvals', icon: ShieldCheck, minRole: 'manager', section: 'Company' },
      // AI approvals joins Company from modules/extensions/ai-approvals.
      { to: '/settings', label: 'Settings', icon: Settings, minRole: 'admin', section: 'Company' },
      {
        to: '/settings#account',
        label: 'Account',
        icon: KeyRound,
        roles: ['manager', 'sales', 'staff', 'viewer'],
        forStaff: true,
        section: 'Company',
      },
      { to: '/theme-studio', label: 'Theme studio', icon: Palette, minRole: 'admin', section: 'Company' },
      { to: '/saas-billing', label: 'HighMast plan', icon: CreditCard, minRole: 'admin', section: 'Company', flag: 'saasBilling' },
      { to: '/industry-packs', label: 'Industry packs', icon: Layers, minRole: 'admin', section: 'Company', flag: 'industryPacks' },
      { to: '/country-packs', label: 'Country packs', icon: Globe, minRole: 'admin', section: 'Company', flag: 'industryPacks' },
      { to: '/public-api', label: 'API and webhooks', icon: KeyRound, minRole: 'admin', section: 'System' },
      { to: '/audit-log', label: 'Audit log', icon: ShieldCheck, minRole: 'admin', section: 'System' },
      { to: '/dsr', label: 'Data requests', icon: ShieldCheck, minRole: 'admin', section: 'System' },
      { to: '/duplicates', label: 'Duplicates', icon: CopyCheck, minRole: 'manager', section: 'System', flag: 'finance' },
      { to: '/app-errors', label: 'App errors', icon: Bug, minRole: 'admin', section: 'System' },
      { to: '/system-check', label: 'System check', icon: Activity, minRole: 'admin', section: 'System' },
    ],
  },
]

/** Core groups, then gap plan modules from modules/extensions (docs/MODULE_BUILD_PLAN.md). */
export const APP_MODULES: ModuleManifest[] = mergeExtensionNav(CORE_MODULES, EXTENSION_MODULES)

/** Topbar titles that differ from the short nav label (longer / more specific). */
const PATH_TITLE_OVERRIDES: { match: (path: string) => boolean; title: string }[] = [
  { match: (p) => p.startsWith('/delivery-settings'), title: 'Packages and rates' },
  { match: (p) => p.startsWith('/agreement-template'), title: 'Agreement template' },
  { match: (p) => p.startsWith('/clause-library'), title: 'Clause library' },
  { match: (p) => p.startsWith('/obligations'), title: 'Obligations board' },
  { match: (p) => p.startsWith('/mrr'), title: 'Monthly recurring revenue' },
  { match: (p) => p.startsWith('/insights'), title: 'Utilisation and profit' },
  { match: (p) => p.startsWith('/about-product'), title: 'About' },
  { match: (p) => p.startsWith('/follow-ups'), title: 'Follow-ups' },
  { match: (p) => p.startsWith('/accounts'), title: 'Accounts' },
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
      items: group.items.filter(
        (item) => (!item.flag || resolvedFlags[item.flag] !== false) && navItemVisible(item, userRole, settings),
      ),
    }))
    .filter((group) => group.items.length > 0)
}
