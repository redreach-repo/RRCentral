import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  ShieldCheck,
  Building2,
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
  Settings,
  KeyRound,
  Menu,
  MoreHorizontal,
  X,
  LogOut,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useFollowUpReminders } from '../hooks/useFollowUpReminders'
import { useRecurringDeductionsSync } from '../hooks/useRecurringDeductionsSync'
import { usePhoneShell } from '../hooks/useMediaQuery'
import { roleAtLeast } from '../lib/permissions'
import type { UserRole } from '../lib/types'
import BrandLogo from './BrandLogo'
import styles from './Layout.module.css'

type NavItem = {
  to: string
  label: string
  icon: typeof LayoutDashboard
  end?: boolean
  /** Minimum role required (admin > manager > sales). */
  minRole?: UserRole
  /** If set, only these roles see the item (overrides minRole). */
  roles?: UserRole[]
}

type NavGroup = { id: string; label: string; items: NavItem[] }

const navGroups: NavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [{ to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true }],
  },
  {
    id: 'sales',
    label: 'Sales',
    items: [
      { to: '/crm', label: 'CRM', icon: Users },
      { to: '/follow-ups', label: 'Follow-ups', icon: CalendarClock },
      { to: '/quotations', label: 'Quotations', icon: FileText },
      { to: '/invoices', label: 'Invoices', icon: Receipt },
      { to: '/delivery-notes', label: 'Delivery notes', icon: Truck },
      { to: '/customer-files', label: 'Customer files', icon: FolderOpen },
    ],
  },
  {
    id: 'ops',
    label: 'Operations',
    items: [
      { to: '/app/wanders', label: 'Wanders', icon: Plane },
      { to: '/catalog', label: 'Catalog', icon: Package },
      { to: '/inventory', label: 'Inventory', icon: Boxes },
      { to: '/templates', label: 'Templates', icon: LayoutTemplate },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    items: [
      { to: '/payments', label: 'Payments', icon: Banknote },
      { to: '/reports', label: 'Reports', icon: BarChart3 },
      { to: '/expenses', label: 'Expenses', icon: Wallet },
      { to: '/vendors', label: 'Vendors', icon: Building2 },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    items: [
      { to: '/settings', label: 'Settings', icon: Settings, minRole: 'admin' },
      { to: '/settings', label: 'Account', icon: KeyRound, roles: ['manager', 'sales'] },
      { to: '/audit-log', label: 'Audit log', icon: ShieldCheck, minRole: 'admin' },
    ],
  },
]

const titleByPath: { match: (path: string) => boolean; title: string }[] = [
  { match: (p) => p === '/app', title: 'Dashboard' },
  { match: (p) => p.startsWith('/crm'), title: 'CRM' },
  { match: (p) => p.startsWith('/follow-ups'), title: 'Follow-ups' },
  { match: (p) => p.startsWith('/quotations'), title: 'Quotations' },
  { match: (p) => p.startsWith('/invoices'), title: 'Invoices' },
  { match: (p) => p.startsWith('/delivery-notes'), title: 'Delivery notes' },
  { match: (p) => p.startsWith('/customer-files'), title: 'Customer files' },
  { match: (p) => p.startsWith('/app/wanders'), title: 'Wanders' },
  { match: (p) => p.startsWith('/catalog'), title: 'Catalog' },
  { match: (p) => p.startsWith('/inventory'), title: 'Inventory' },
  { match: (p) => p.startsWith('/payments'), title: 'Payments' },
  { match: (p) => p.startsWith('/templates'), title: 'Templates' },
  { match: (p) => p.startsWith('/reports'), title: 'Reports' },
  { match: (p) => p.startsWith('/expenses'), title: 'Expenses' },
  { match: (p) => p.startsWith('/vendors'), title: 'Vendors' },
  { match: (p) => p.startsWith('/settings'), title: 'Settings' },
  { match: (p) => p.startsWith('/audit-log'), title: 'Audit log' },
]

/** Primary destinations for phone / foldable bottom nav (big phones included). */
const phonePrimaryNav: { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean }[] = [
  { to: '/app', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/crm', label: 'CRM', icon: Users },
  { to: '/follow-ups', label: 'Follow-ups', icon: CalendarClock },
  { to: '/quotations', label: 'Quotes', icon: FileText },
]

function isPhonePrimaryActive(pathname: string, to: string, end?: boolean): boolean {
  if (end) return pathname === to
  return pathname === to || pathname.startsWith(`${to}/`)
}

export default function Layout() {
  const { user, userRole, signOut, isLocalMode } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const phoneShell = usePhoneShell()
  const reminders = useFollowUpReminders(user?.email)
  useRecurringDeductionsSync(Boolean(user))

  function openReminders() {
    if (reminders.permission === 'default') void reminders.enableNotifications()
    navigate('/follow-ups')
  }

  const pageTitle =
    titleByPath.find((t) => t.match(location.pathname))?.title || 'RED REACH Central'

  const primaryActive = phonePrimaryNav.some((item) =>
    isPhonePrimaryActive(location.pathname, item.to, item.end),
  )

  return (
    <div className={`${styles.shell} ${phoneShell ? styles.shellPhone : ''}`}>
      <div className={styles.ambient} aria-hidden />
      {isLocalMode && (
        <div className={styles.localBanner} role="status">
          Local mode — data stays in this browser until you connect Supabase in Settings
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
        <div className={styles.brand}>
          <BrandLogo height={44} className={styles.brandLogo} />
          <button
            type="button"
            className={styles.closeBtn}
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <nav className={styles.nav}>
          {navGroups.map((group) => {
            const items = group.items.filter((item) => {
              if (item.roles) return item.roles.includes(userRole)
              if (item.minRole) return roleAtLeast(userRole, item.minRole)
              return true
            })
            if (!items.length) return null
            return (
              <div key={group.id} className={styles.navGroup}>
                <div className={styles.navGroupLabel}>{group.label}</div>
                {items.map(({ to, label, icon: Icon, end }) => (
                  <NavLink
                    key={`${to}-${label}`}
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
                    }
                    onClick={() => setSidebarOpen(false)}
                  >
                    <Icon size={18} strokeWidth={1.75} />
                    <span>{label}</span>
                    {to === '/follow-ups' && reminders.due > 0 && (
                      <span className={styles.navBadge} aria-label={`${reminders.due} due`}>
                        {reminders.due > 99 ? '99+' : reminders.due}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            )
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.divisionHint}>Multi-division CRM</div>
        </div>
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

          <div className={styles.topbarCopy}>
            <p className={styles.topbarEyebrow}>RED REACH Central</p>
            <h1 className={styles.title}>{pageTitle}</h1>
          </div>

          <div className={styles.topbarRight}>
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
          <Outlet />
        </main>

        {phoneShell ? (
          <nav className={styles.bottomNav} aria-label="Primary">
            {phonePrimaryNav.map(({ to, label, icon: Icon, end }) => {
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
                    {to === '/follow-ups' && reminders.due > 0 ? (
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
