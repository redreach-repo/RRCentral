import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Banknote,
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  CalendarClock,
  Contact,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LifeBuoy,
  Menu,
  MoreHorizontal,
  Package,
  Receipt,
  Timer,
  Truck,
  Users,
  Wallet,
  X,
  LogOut,
  ChevronDown,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useTenant } from '../contexts/TenantContext'
import { useI18n } from '../contexts/I18nContext'
import { useFollowUpReminders } from '../hooks/useFollowUpReminders'
import { useContractBillingSync } from '../hooks/useContractBillingSync'
import { useFridayHoursReminder } from '../hooks/useFridayHoursReminder'
import { useRunningTimer } from '../hooks/useRunningTimer'
import { elapsedLabel } from '../lib/timeTracking'
import { useRecurringDeductionsSync } from '../hooks/useRecurringDeductionsSync'
import { usePhoneShell } from '../hooks/useMediaQuery'
import { can, roleAtLeast } from '../lib/permissions'
import { shouldHidePipelineDetailNavItem } from '../lib/pipelineDetailNav'
import type { UserRole } from '../lib/types'
import { APP_MODULES, itemMatchesPath, moduleIdForPath, titleForPath } from '../modules/nav'
import type { ModuleNavItem } from '../modules/registry'
import BrandLogo from './BrandLogo'
import ErrorBoundary from './ErrorBoundary'
import styles from './Layout.module.css'

type NavItem = ModuleNavItem

const NAV_SECTION_KEY = 'rrcentral_nav_section'
const navGroups = APP_MODULES

const phonePrimaryNav: { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean }[] = [
  { to: '/app', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/crm', label: 'My Day', icon: Users },
  { to: '/quotations', label: 'Quotes', icon: FileText },
  { to: '/follow-ups', label: 'Follow-ups', icon: CalendarClock },
]

const staffPhoneNav: typeof phonePrimaryNav = [
  { to: '/app', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/accounts', label: 'Accounts', icon: Contact },
  { to: '/support', label: 'Support', icon: LifeBuoy },
]

/** Phone drawer shortcuts — destinations not already on the primary bottom tabs. */
const phoneShortcuts: NavItem[] = [
  { to: '/deals', label: 'Pipeline', icon: Briefcase, forStaff: true },
  { to: '/customer-files', label: 'Drive', icon: FolderOpen },
  { to: '/accounts', label: 'Accounts', icon: Contact, forStaff: true },
  { to: '/invoices', label: 'Invoices', icon: Receipt },
  { to: '/delivery-notes', label: 'Delivery notes', icon: Truck },
  { to: '/expenses', label: 'Expenses', icon: Wallet },
  { to: '/vendors', label: 'Vendors', icon: Building2 },
  { to: '/payments', label: 'Payments', icon: Banknote },
  { to: '/catalog', label: 'Catalog', icon: Package },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
]

function isPhonePrimaryActive(pathname: string, to: string, end?: boolean): boolean {
  if (end) return pathname === to
  return pathname === to || pathname.startsWith(`${to}/`)
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

function filterItems(
  items: NavItem[],
  userRole: UserRole,
  settings: Record<string, string | undefined>,
): NavItem[] {
  return items.filter((item) => {
    if (userRole === 'staff' && !item.forStaff) return false
    if (item.roles) return item.roles.includes(userRole)
    if (item.minRole) return roleAtLeast(userRole, item.minRole)
    if (shouldHidePipelineDetailNavItem(item.to, settings, userRole)) return false
    return true
  })
}

export default function Layout() {
  const { user, userRole, signOut, isLocalMode } = useAuth()
  const { settings } = useSettings()
  const { companies, activeCompanyId, setActiveCompanyId, activeCompany } = useTenant()
  const { t } = useI18n()
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
      .map((group) => ({ ...group, items: filterItems(group.items, userRole, settings) }))
      .filter((group) => group.items.length > 0)
  }, [userRole, settings])

  const pathSection = moduleIdForPath(location.pathname)
  const [expandedIds, setExpandedIds] = useState<string[]>(() => {
    const fromPath = moduleIdForPath(location.pathname)
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
    return titleForPath(location.pathname) || 'RED REACH Central'
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
      '/catalog',
      '/domains',
      '/templates',
      '/inventory',
      '/support',
      '/reports',
      '/app/wanders',
      '/products',
      '/delivery-settings',
      '/build-templates',
      '/mrr',
      '/insights',
      '/client-health',
      '/client-reports',
      '/client-updates',
      '/duplicates',
      '/audit-log',
      '/app-errors',
      '/system-check',
    ].includes(location.pathname) || location.pathname.startsWith('/accounts')

  const primaryActive = phoneNav.some((item) =>
    isPhonePrimaryActive(location.pathname, item.to, item.end),
  )

  const visiblePhoneShortcuts = useMemo(() => {
    const primaryPaths = new Set(phoneNav.map((item) => item.to))
    return filterItems(phoneShortcuts, userRole, settings).filter((item) => !primaryPaths.has(item.to))
  }, [phoneNav, userRole, settings])

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
          {phoneShell && visiblePhoneShortcuts.length > 0 ? (
            <div className={styles.phoneShortcuts}>
              <div className={styles.phoneShortcutsLabel}>Shortcuts</div>
              <div className={styles.phoneShortcutsGrid}>
                {visiblePhoneShortcuts.map((item) => {
                  const ItemIcon = item.icon
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) =>
                        `${styles.phoneShortcut} ${isActive ? styles.phoneShortcutActive : ''}`
                      }
                      onClick={() => setSidebarOpen(false)}
                    >
                      <ItemIcon size={16} strokeWidth={1.75} />
                      <span>{item.label}</span>
                    </NavLink>
                  )
                })}
              </div>
            </div>
          ) : null}
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
            {companies.length > 0 ? (
              <label className={styles.companySwitcher}>
                <span className={styles.companySwitcherLabel}>{t('shell.company')}</span>
                <select
                  className={styles.companySelect}
                  value={activeCompanyId || ''}
                  onChange={(e) => setActiveCompanyId(e.target.value)}
                  aria-label={t('shell.company')}
                  title={activeCompany?.legal_name || activeCompany?.name || t('shell.company')}
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <span className={styles.userEmail}>{user?.email}</span>
            <button
              type="button"
              className={styles.signOutBtn}
              onClick={() => void signOut()}
              aria-label={t('shell.signOut')}
            >
              <LogOut size={16} />
              <span className={styles.signOutLabel}>{t('shell.signOut')}</span>
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
              className={`${styles.bottomNavItem} ${!primaryActive ? styles.bottomNavItemActive : ''}`}
              onClick={() => setSidebarOpen(true)}
              aria-label="More pages"
              aria-expanded={sidebarOpen}
            >
              <span className={styles.bottomNavIconWrap}>
                <MoreHorizontal size={22} strokeWidth={!primaryActive ? 2.25 : 1.75} />
              </span>
              <span className={styles.bottomNavLabel}>More</span>
            </button>
          </nav>
        ) : null}
      </div>
    </div>
  )
}
