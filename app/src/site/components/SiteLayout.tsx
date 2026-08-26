import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import HeroCanvas from './HeroCanvas'
import CursorGlow from './CursorGlow'
import SiteWordmark from './SiteWordmark'
import { SITE, VERTICALS } from '../data/verticals'
import '../site.css'

export default function SiteLayout() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const centralTo = user ? '/app' : '/login'

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="site-root">
      <div className="site-noise" />
      <div className="site-grid" />
      <HeroCanvas />
      <CursorGlow />
      <div className="site-shell">
        <header className={`site-nav ${scrolled ? 'scrolled' : ''}`}>
          <Link to="/" onClick={() => setOpen(false)}>
            <SiteWordmark />
          </Link>
          <nav className="site-nav-links" aria-label="Primary">
            <NavLink to="/verticals">Verticals</NavLink>
            <NavLink to="/about">About</NavLink>
            <NavLink to="/contact">Contact</NavLink>
            <Link to={centralTo} className="site-central-link">
              Central
            </Link>
          </nav>
          <button
            type="button"
            className="site-menu-btn"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </header>
        <div className={`site-mobile-panel ${open ? 'open' : ''}`}>
          {VERTICALS.map((v) => (
            <Link key={v.slug} to={`/verticals/${v.slug}`} onClick={() => setOpen(false)}>
              {v.brand}
            </Link>
          ))}
          <Link to="/about" onClick={() => setOpen(false)}>
            About
          </Link>
          <Link to="/contact" onClick={() => setOpen(false)}>
            Contact
          </Link>
          <Link to={centralTo} className="site-central-link" onClick={() => setOpen(false)}>
            Central
          </Link>
        </div>
        <Outlet />
        <footer className="site-footer">
          <div className="site-footer-grid">
            <div>
              <SiteWordmark />
              <p style={{ marginTop: 14 }}>
                {SITE.legal}. Founded {SITE.founded} in Dubai — {SITE.tagline}.
              </p>
            </div>
            <div>
              <h4>Verticals</h4>
              {VERTICALS.map((v) => (
                <div key={v.slug}>
                  <Link to={`/verticals/${v.slug}`}>{v.brand}</Link>
                </div>
              ))}
            </div>
            <div>
              <h4>Visit</h4>
              {SITE.addressLines.map((line) => (
                <p key={line} style={{ margin: 0 }}>
                  {line}
                </p>
              ))}
            </div>
            <div>
              <h4>Talk</h4>
              <p>
                <a href={SITE.phoneHref}>{SITE.phone}</a>
              </p>
              <p>
                <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
              </p>
              <p>
                <a href={SITE.whatsapp} target="_blank" rel="noreferrer">
                  WhatsApp
                </a>
              </p>
              <p>
                <Link to={centralTo} className="site-central-link">
                  Central
                </Link>
              </p>
            </div>
          </div>
          <div className="site-footer-bottom">
            <span>© {new Date().getFullYear()} {SITE.legal}</span>
            <span>
              <Link to={centralTo}>Central</Link>
              {' · '}
              {SITE.location}
            </span>
          </div>
        </footer>
      </div>
    </div>
  )
}
