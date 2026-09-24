import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Banknote,
  Users,
  CalendarClock,
  FileText,
  Receipt,
  Truck,
  Package,
  Boxes,
  Plane,
  LayoutTemplate,
  BarChart3,
  Wallet,
  Settings,
  Menu,
  X,
  LogOut,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import BrandLogo from './BrandLogo'
import styles from './Layout.module.css'

type NavItem = {
  to: string
  label: string
  icon: typeof LayoutDashboard
  end?: boolean
  adminOnly?: boolean
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
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    items: [{ to: '/settings', label: 'Settings', icon: Settings, adminOnly: true }],
  },
]

const titleByPath: { match: (path: string) => boolean; title: string }[] = [
  { match: (p) => p === '/app', title: 'Dashboard' },
  { match: (p) => p.startsWith('/crm'), title: 'CRM' },
  { match: (p) => p.startsWith('/follow-ups'), title: 'Follow-ups' },
  { match: (p) => p.startsWith('/quotations'), title: 'Quotations' },
  { match: (p) => p.startsWith('/invoices'), title: 'Invoices' },
  { match: (p) => p.startsWith('/delivery-notes'), title: 'Delivery notes' },
  { match: (p) => p.startsWith('/app/wanders'), title: 'Wanders' },
  { match: (p) => p.startsWith('/catalog'), title: 'Catalog' },
  { match: (p) => p.startsWith('/inventory'), title: 'Inventory' },
  { match: (p) => p.startsWith('/payments'), title: 'Payments' },
  { match: (p) => p.startsWith('/templates'), title: 'Templates' },
  { match: (p) => p.startsWith('/reports'), title: 'Reports' },
  { match: (p) => p.startsWith('/expenses'), title: 'Expenses' },
  { match: (p) => p.startsWith('/settings'), title: 'Settings' },
]

export default function Layout() {
  const { user, userRole, signOut, isLocalMode } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  const pageTitle =
    titleByPath.find((t) => t.match(location.pathname))?.title || 'RED REACH Central'

  return (
    <div className={styles.shell}>
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
            const items = group.items.filter(
              (item) => !item.adminOnly || userRole === 'admin',
            )
            if (!items.length) return null
            return (
              <div key={group.id} className={styles.navGroup}>
                <div className={styles.navGroupLabel}>{group.label}</div>
                {items.map(({ to, label, icon: Icon, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
                    }
                    onClick={() => setSidebarOpen(false)}
                  >
                    <Icon size={18} strokeWidth={1.75} />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            )
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.divisionHint}>Multi-division CRM</div>
          <NavLink to="/" className={styles.navItem} style={{ marginTop: 8 }}>
            <span>Public site</span>
          </NavLink>
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
      </div>
    </div>
  )
}
