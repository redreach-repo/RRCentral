import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { WorshipHubIcon } from './worshiphub/WorshipHubIcon'
import {
  Bell,
  ShieldCheck,
  Building2,
  Contact,
  LayoutDashboard,
  Banknote,
  Users,
  CalendarClock,
  FileText,
  FolderOpen,
  Receipt,
  Truck,
  Package,
  Boxes,
  Plane,
  LayoutTemplate,
  BarChart3,
  Wallet,
  Globe,
  Settings,
  KeyRound,
  Menu,
  MoreHorizontal,
  X,
  LogOut,
  LifeBuoy,
  Briefcase,
  Timer,
  ClipboardList,
  FileSignature,
  ScrollText,
  HeartPulse,
  FileBarChart,
  TrendingUp,
  Bug,
  Activity,
  Gauge,
  MessageSquareWarning,
  Send,
  CopyCheck,
  PhoneCall,
  Wrench,
  ChevronDown,
  Handshake,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useFollowUpReminders } from '../hooks/useFollowUpReminders'
import { useContractBillingSync } from '../hooks/useContractBillingSync'
import { useFridayHoursReminder } from '../hooks/useFridayHoursReminder'
import { useRunningTimer } from '../hooks/useRunningTimer'
import { elapsedLabel } from '../lib/timeTracking'
import { useRecurringDeductionsSync } from '../hooks/useRecurringDeductionsSync'
import { usePhoneShell } from '../hooks/useMediaQuery'
import { can, roleAtLeast } from '../lib/permissions'
import type { UserRole } from '../lib/types'
import BrandLogo from './BrandLogo'
import ErrorBoundary from './ErrorBoundary'
import styles from './Layout.module.css'

type NavItem = {
  to: string
  label: string
  icon: ComponentType<{ size?: number; strokeWidth?: number }>
  end?: boolean
  /** Optional sub-heading inside the active section panel. */
  section?: string
  minRole?: UserRole
  roles?: UserRole[]
  forStaff?: boolean
}

type NavGroup = {
  id: string
  label: string
  icon: ComponentType<{ size?: number; strokeWidth?: number }>
  items: NavItem[]
}

const NAV_SECTION_KEY = 'rrcentral_nav_section'

/**
 * Accordion sidebar: labeled section groups expand to show their links.
 * Current route’s section stays open; multiple groups may be open at once.
 */
const navGroups: NavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: LayoutDashboard,
    items: [{ to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true }],
  },
  {
    id: 'sales',
    label: 'Sales',
    icon: Users,
    items: [
      { to: '/quick-add', label: 'Quick add', icon: PhoneCall, minRole: 'sales', section: 'Work' },
      { to: '/crm', label: 'My Day', icon: Users, section: 'Work' },
      { to: '/deals', label: 'Pipeline', icon: Briefcase, forStaff: true, section: 'Work' },
      { to: '/sales', label: 'AI CRM stages', icon: TrendingUp, minRole: 'sales', section: 'Work' },
      { to: '/ctrm', label: 'CTRM stages', icon: Handshake, minRole: 'sales', section: 'Work' },
      { to: '/follow-ups', label: 'Follow-ups', icon: CalendarClock, section: 'Work' },
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
      {
        to: '/ctrm-issues',
        label: 'CTRM issues',
        icon: MessageSquareWarning,
        forStaff: true,
      },
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
    ],
  },
  {
    id: 'ops',
    label: 'Operations',
    icon: Wrench,
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

const titleByPath: { match: (path: string) => boolean; title: string }[] = [
  { match: (p) => p === '/app', title: 'Dashboard' },
  { match: (p) => p.startsWith('/accounts'), title: 'Accounts' },
  { match: (p) => p.startsWith('/delivery-settings'), title: 'Packages and rates' },
  { match: (p) => p.startsWith('/build-templates'), title: 'Build templates' },
  { match: (p) => p.startsWith('/agreement-template'), title: 'Agreement template' },
  { match: (p) => p.startsWith('/nda-template'), title: 'NDA template' },
  { match: (p) => p.startsWith('/client-health'), title: 'Client health' },
  { match: (p) => p.startsWith('/client-reports'), title: 'Monthly reports' },
  { match: (p) => p.startsWith('/mrr'), title: 'Monthly recurring revenue' },
  { match: (p) => p.startsWith('/duplicates'), title: 'Duplicates' },
  { match: (p) => p.startsWith('/ctrm-issues'), title: 'CTRM issues' },
  { match: (p) => p.startsWith('/client-updates'), title: 'Weekly updates' },
  { match: (p) => p.startsWith('/quick-add'), title: 'Quick add' },
  { match: (p) => p.startsWith('/insights'), title: 'Utilisation and profit' },
  { match: (p) => p.startsWith('/support'), title: 'Support' },
  { match: (p) => p.startsWith('/ctrm'), title: 'CTRM Next stages' },
  { match: (p) => p.startsWith('/sales'), title: 'AI CRM stages' },
  { match: (p) => p.startsWith('/deals'), title: 'Pipeline' },
  { match: (p) => p.startsWith('/products'), title: 'WorshipHub' },
  { match: (p) => p.startsWith('/crm'), title: 'My Day' },
  { match: (p) => p.startsWith('/follow-ups'), title: 'Follow-ups' },
  { match: (p) => p.startsWith('/quotations'), title: 'Quotations' },
  { match: (p) => p.startsWith('/invoices'), title: 'Invoices' },
  { match: (p) => p.startsWith('/delivery-notes'), title: 'Delivery notes' },
  { match: (p) => p.startsWith('/customer-files'), title: 'Google Drive' },
  { match: (p) => p.startsWith('/app/wanders'), title: 'Wanders' },
  { match: (p) => p.startsWith('/catalog'), title: 'Catalog' },
  { match: (p) => p.startsWith('/inventory'), title: 'Inventory' },
  { match: (p) => p.startsWith('/payments'), title: 'Payments' },
  { match: (p) => p.startsWith('/templates'), title: 'Templates' },
  { match: (p) => p.startsWith('/reports'), title: 'Reports' },
  { match: (p) => p.startsWith('/expenses'), title: 'Expenses' },
  { match: (p) => p.startsWith('/vendors'), title: 'Vendors' },
  { match: (p) => p.startsWith('/domains'), title: 'Domains' },
  { match: (p) => p.startsWith('/settings'), title: 'Settings' },
  { match: (p) => p.startsWith('/audit-log'), title: 'Audit log' },
  { match: (p) => p.startsWith('/app-errors'), title: 'App errors' },
  { match: (p) => p.startsWith('/system-check'), title: 'System check' },
]

const phonePrimaryNav: { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean }[] = [
  { to: '/app', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/crm', label: 'My Day', icon: Users },
  { to: '/quotations', label: 'Quotes', icon: FileText },
  { to: '/invoices', label: 'Invoices', icon: Receipt },
]

const staffPhoneNav: typeof phonePrimaryNav = [
  { to: '/accounts', label: 'Accounts', icon: Contact },
  { to: '/support', label: 'Support', icon: LifeBuoy },
]

function isPhonePrimaryActive(pathname: string, to: string, end?: boolean): boolean {
  if (end) return pathname === to
  return pathname === to || pathname.startsWith(`${to}/`)
}

function navItemPath(to: string): string {
  return to.split('#')[0] || to
}

function itemMatchesPath(pathname: string, item: NavItem): boolean {
  const base = navItemPath(item.to)
  if (item.end) return pathname === base
  return pathname === base || pathname.startsWith(`${base}/`)
}

function sectionForPath(pathname: string): string {
  for (const group of navGroups) {
    if (group.items.some((item) => itemMatchesPath(pathname, item))) return group.id
  }
  return 'sales'
}

function readSavedSection(): string | null {
  try {
    return localStorage.getItem(NAV_SECTION_KEY)
  } catch {
    return null
  }
}

function writeSavedSection(id: string) {
  try {
    localStorage.setItem(NAV_SECTION_KEY, id)
  } catch {
    /* ignore */
  }
}

function filterItems(items: NavItem[], userRole: UserRole): NavItem[] {
  return items.filter((item) => {
    if (userRole === 'staff' && !item.forStaff) return false
    if (item.roles) return item.roles.includes(userRole)
    if (item.minRole) return roleAtLeast(userRole, item.minRole)
    return true
  })
}

export default function Layout() {
  const { user, userRole, signOut, isLocalMode } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const phoneShell = usePhoneShell()
  const reminders = useFollowUpReminders(user?.email)
  const { timer, now } = useRunningTimer(user?.email)
  useFridayHoursReminder(Boolean(user) && userRole !== 'viewer', reminders.permission)
  useContractBillingSync(Boolean(user) && can(userRole, 'delivery.contracts'))
  useRecurringDeductionsSync(Boolean(user) && roleAtLeast(userRole, 'sales'))
  const phoneNav = userRole === 'staff' ? staffPhoneNav : phonePrimaryNav

  const visibleGroups = useMemo(() => {
    return navGroups
      .map((group) => ({ ...group, items: filterItems(group.items, userRole) }))
      .filter((group) => group.items.length > 0)
  }, [userRole])

  const pathSection = sectionForPath(location.pathname)
  const [expandedIds, setExpandedIds] = useState<string[]>(() => {
    const fromPath = sectionForPath(location.pathname)
    const saved = readSavedSection()
    const seed = saved && navGroups.some((g) => g.id === saved) ? saved : fromPath
    return Array.from(new Set([fromPath, seed].filter(Boolean)))
  })

  useEffect(() => {
    writeSavedSection(pathSection)
    setExpandedIds((prev) => (prev.includes(pathSection) ? prev : [...prev, pathSection]))
  }, [pathSection])

  function toggleSection(id: string) {
    setExpandedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      writeSavedSection(id)
      return next.length ? next : [id]
    })
  }

  function openReminders() {
    if (reminders.permission === 'default') void reminders.enableNotifications()
    navigate('/follow-ups')
  }

  const pageTitle = (() => {
    if (location.pathname.startsWith('/settings')) {
      return can(userRole, 'settings.manage') ? 'Settings' : 'Account'
    }
    return titleByPath.find((t) => t.match(location.pathname))?.title || 'RED REACH Central'
  })()

  const hideTopbarTitle =
    [
      '/app',
      '/crm',
      '/deals',
      '/sales',
      '/ctrm',
      '/quotations',
      '/invoices',
      '/delivery-notes',
      '/follow-ups',
      '/customer-files',
      '/expenses',
      '/vendors',
      '/payments',
    ].includes(location.pathname) || location.pathname.startsWith('/accounts')

  const primaryActive = phoneNav.some((item) =>
    isPhonePrimaryActive(location.pathname, item.to, item.end),
  )

  return (
    <div className={`${styles.shell} ${phoneShell ? styles.shellPhone : ''}`}>
      <div className={styles.ambient} aria-hidden />
      {isLocalMode && (
        <div className={styles.localBanner} role="alert">
          <strong>Local mode.</strong> CRM data stays in Supabase — this browser is empty until you{' '}
          <Link to="/settings#connect-supabase" style={{ color: 'inherit', textDecoration: 'underline' }}>
            Connect Supabase
          </Link>{' '}
          (URL <code>https://pszjylxrpvlumldtptrr.supabase.co</code> + anon key), then{' '}
          <Link to="/settings#google-drive" style={{ color: 'inherit', textDecoration: 'underline' }}>
            Google Drive
          </Link>
          .
        </div>
      )}
      {sidebarOpen && (
        <button
          type="button"
          className={styles.overlay}
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.sideBrand}>
          <BrandLogo height={28} className={styles.sideLogo} />
          <button
            type="button"
            className={styles.closeBtn}
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <nav className={styles.sideNav} aria-label="Main">
          {visibleGroups.map((group) => {
            const Icon = group.icon
            const open = expandedIds.includes(group.id)
            const groupActive = group.items.some((item) => itemMatchesPath(location.pathname, item))
            const hasDue =
              group.id === 'sales' &&
              group.items.some((i) => i.to === '/follow-ups') &&
              reminders.due > 0
            return (
              <div key={group.id} className={styles.sideGroup}>
                <button
                  type="button"
                  className={`${styles.sideGroupBtn} ${groupActive ? styles.sideGroupBtnActive : ''} ${open ? styles.sideGroupBtnOpen : ''}`}
                  aria-expanded={open}
                  onClick={() => toggleSection(group.id)}
                >
                  <Icon size={17} strokeWidth={groupActive ? 2.1 : 1.75} />
                  <span className={styles.sideGroupLabel}>{group.label}</span>
                  {hasDue ? (
                    <span className={styles.navBadge} aria-label={`${reminders.due} due`}>
                      {reminders.due > 99 ? '99+' : reminders.due}
                    </span>
                  ) : null}
                  <ChevronDown
                    size={15}
                    className={`${styles.sideChevron} ${open ? styles.sideChevronOpen : ''}`}
                    aria-hidden
                  />
                </button>
                {open ? (
                  <div className={styles.sideItems}>
                    {group.items.map((item, idx, items) => {
                      const ItemIcon = item.icon
                      const prevSection = idx > 0 ? items[idx - 1]?.section : undefined
                      const showSection = Boolean(item.section && item.section !== prevSection)
                      return (
                        <div key={`${item.to}-${item.label}`}>
                          {showSection ? (
                            <div className={styles.panelSectionLabel}>{item.section}</div>
                          ) : null}
                          <NavLink
                            to={item.to}
                            end={item.end}
                            className={({ isActive }) =>
                              `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
                            }
                            onClick={() => setSidebarOpen(false)}
                          >
                            <ItemIcon size={15} strokeWidth={1.75} />
                            <span>{item.label}</span>
                            {item.to === '/follow-ups' && reminders.due > 0 && (
                              <span className={styles.navBadge} aria-label={`${reminders.due} due`}>
                                {reminders.due > 99 ? '99+' : reminders.due}
                              </span>
                            )}
                          </NavLink>
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )
          })}
        </nav>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <button
            type="button"
            className={styles.menuBtn}
            aria-label="Open menu"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={20} />
          </button>

          <div className={styles.topbarCopy} aria-label={pageTitle}>
            <p className={styles.topbarEyebrow}>RED REACH Central</p>
            {hideTopbarTitle ? null : <h1 className={styles.title}>{pageTitle}</h1>}
          </div>

          <div className={styles.topbarRight}>
            {timer ? (
              <NavLink
                to={`/accounts/${timer.accountId}`}
                className={styles.timerChip}
                title={`Timer running on ${timer.accountName}. Open the client to stop it.`}
                aria-label={`Timer running on ${timer.accountName}, ${elapsedLabel(timer.startedAt, now)}`}
              >
                <Timer size={15} />
                <span className={styles.timerChipName}>{timer.accountName}</span>
                <span>{elapsedLabel(timer.startedAt, now)}</span>
              </NavLink>
            ) : null}
            <button
              type="button"
              className={styles.reminderBtn}
              onClick={openReminders}
              title={
                reminders.due
                  ? `${reminders.counts.overdue} overdue, ${reminders.counts.today} due today (${reminders.counts.mine} yours)` +
                    (reminders.permission === 'default' ? ' — click to enable desktop reminders' : '')
                  : reminders.permission === 'default'
                    ? 'Enable desktop reminders for due follow-ups'
                    : 'No follow-ups due'
              }
              aria-label={`Follow-up reminders: ${reminders.due} due`}
            >
              <Bell size={16} />
              {reminders.due > 0 && <span className={styles.reminderCount}>{reminders.due}</span>}
            </button>
            <span className={styles.userEmail}>{user?.email}</span>
            <button
              type="button"
              className={styles.signOutBtn}
              onClick={() => void signOut()}
              aria-label="Sign out"
            >
              <LogOut size={16} />
              <span className={styles.signOutLabel}>Sign out</span>
            </button>
          </div>
        </header>

        <main className={styles.content}>
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>

        {phoneShell ? (
          <nav className={styles.bottomNav} aria-label="Primary">
            {phoneNav.map(({ to, label, icon: Icon, end }) => {
              const active = isPhonePrimaryActive(location.pathname, to, end)
              return (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={`${styles.bottomNavItem} ${active ? styles.bottomNavItemActive : ''}`}
                >
                  <span className={styles.bottomNavIconWrap}>
                    <Icon size={22} strokeWidth={active ? 2.25 : 1.75} />
                    {(to === '/crm' || to === '/follow-ups') && reminders.due > 0 ? (
                      <span className={styles.bottomNavBadge} aria-hidden>
                        {reminders.due > 99 ? '99+' : reminders.due}
                      </span>
                    ) : null}
                  </span>
                  <span className={styles.bottomNavLabel}>{label}</span>
                </NavLink>
              )
            })}
            <button
              type="button"
              className={`${styles.bottomNavItem} ${!primaryActive && sidebarOpen ? styles.bottomNavItemActive : ''}`}
              onClick={() => setSidebarOpen(true)}
              aria-label="More pages"
            >
              <span className={styles.bottomNavIconWrap}>
                <MoreHorizontal size={22} strokeWidth={1.75} />
              </span>
              <span className={styles.bottomNavLabel}>More</span>
            </button>
          </nav>
        ) : null}
      </div>
    </div>
  )
}
