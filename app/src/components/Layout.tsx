import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  CalendarClock,
  FileText,
  Receipt,
  Package,
  Boxes,
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

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/crm', label: 'CRM', icon: Users },
  { to: '/follow-ups', label: 'Follow-ups', icon: CalendarClock },
  { to: '/quotations', label: 'Quotations', icon: FileText },
  { to: '/invoices', label: 'Invoices', icon: Receipt },
  { to: '/catalog', label: 'Catalog', icon: Package },
  { to: '/inventory', label: 'Inventory', icon: Boxes },
  { to: '/templates', label: 'Templates', icon: LayoutTemplate },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/expenses', label: 'Expenses', icon: Wallet },
  { to: '/settings', label: 'Settings', icon: Settings, adminOnly: true },
]

export default function Layout() {
  const { user, userRole, signOut, isLocalMode } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const visibleNav = navItems.filter(
    (item) => !item.adminOnly || userRole === 'admin',
  )

  return (
    <div className={styles.shell}>
      {isLocalMode && (
        <div className={styles.localBanner} role="status">
          Running in local mode — data is stored in this browser (IndexedDB), not the cloud
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
          {visibleNav.map(({ to, label, icon: Icon, end }) => (
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

          <h1 className={styles.title}>RED REACH Central</h1>

          <div className={styles.topbarRight}>
            <span className={styles.userEmail}>{user?.email}</span>
            <button type="button" className={styles.signOutBtn} onClick={() => void signOut()} aria-label="Sign out">
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
