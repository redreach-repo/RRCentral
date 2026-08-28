import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import SiteWordmark from './SiteWordmark'
import { siteAsset } from '../assets'
import { SITE, VERTICALS } from '../data/verticals'
import { playbookByPath, verticalPath } from '../data/playbooks'
import '../site.css'

export default function SiteLayout() {
  const { user } = useAuth()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const centralTo = user ? '/app' : '/login'
  const companyActive = Boolean(playbookByPath(location.pathname)) || location.pathname.includes('businesses')

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  return (
    <div className="site-root">
      <div className="site-shell">
        <div className="site-topbar">
          <span>{SITE.hours}</span>
          <span>{SITE.addressLines.join(', ')}</span>
        </div>
        <header className={`site-nav ${scrolled ? 'scrolled' : ''}`}>
          <Link to="/" onClick={() => setOpen(false)}>
            <SiteWordmark />
          </Link>
          <nav className="site-nav-links" aria-label="Primary">
            <NavLink to="/" end>
              Home
            </NavLink>
            <div className="site-nav-drop">
              <NavLink
                to="/businesses"
                className={({ isActive }) => (isActive || companyActive ? 'active' : undefined)}
              >
                Our Businesses
              </NavLink>
              <div className="site-nav-drop-panel">
                {VERTICALS.map((v) => (
                  <NavLink key={v.slug} to={verticalPath(v.slug)}>
                    <img src={siteAsset(v.image)} alt="" />
                    <span className="site-nav-drop-copy">
                      {v.brand}
                      <span>{v.category}</span>
                    </span>
                  </NavLink>
                ))}
              </div>
            </div>
            <NavLink to="/shop">Tee Tribe</NavLink>
            <NavLink to="/about">About</NavLink>
            <NavLink to="/insights">Insights</NavLink>
            <NavLink to="/contact">Contact</NavLink>
            <Link to="/contact" className="site-nav-cta">
              Talk to us
            </Link>
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
          <Link to="/" onClick={() => setOpen(false)}>
            Home
          </Link>
          <Link to="/businesses" onClick={() => setOpen(false)}>
            Our Businesses
          </Link>
          {VERTICALS.map((v) => (
            <Link key={v.slug} to={verticalPath(v.slug)} onClick={() => setOpen(false)}>
              {v.brand}
            </Link>
          ))}
          <Link to="/shop" onClick={() => setOpen(false)}>
            Tee Tribe
          </Link>
          <Link to="/about" onClick={() => setOpen(false)}>
            About
          </Link>
          <Link to="/insights" onClick={() => setOpen(false)}>
            Insights
          </Link>
          <Link to="/contact" onClick={() => setOpen(false)}>
            Contact
          </Link>
          <Link to={centralTo} className="site-central-link" onClick={() => setOpen(false)}>
            Central
          </Link>
        </div>
        <div className="site-page" key={location.pathname}>
          <Outlet />
        </div>
        <footer className="site-footer">
          <div className="site-footer-inner">
            <div className="site-footer-grid">
              <div>
                <SiteWordmark />
                <p style={{ marginTop: 14 }}>
                  {SITE.legal}. Founded {SITE.founded} in Dubai. {SITE.tagline}
                </p>
              </div>
              <div>
                <h4>Our Businesses</h4>
                {VERTICALS.map((v) => (
                  <div key={v.slug}>
                    <Link to={verticalPath(v.slug)}>{v.brand}</Link>
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
                <p style={{ margin: '8px 0 0' }}>{SITE.hours}</p>
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
                  <Link to="/shop">Tee Tribe shop</Link>
                </p>
                <p>
                  <Link to="/insights">Insights</Link>
                </p>
                <p>
                  <Link to={centralTo} className="site-central-link">
                    Central
                  </Link>
                </p>
              </div>
            </div>
            <div className="site-footer-bottom">
              <span>
                © {new Date().getFullYear()} {SITE.legal}
              </span>
              <span>{SITE.location}</span>
            </div>
          </div>
        </footer>
      </div>
      <a className="site-call-tab" href={SITE.phoneHref}>
        Call us now
      </a>
      <a className="site-whatsapp" href={SITE.whatsapp} target="_blank" rel="noreferrer" aria-label="WhatsApp">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M20.5 3.5A11 11 0 0 0 2.1 16.7L1 23l6.4-1.1A11 11 0 0 0 20.5 3.5zm-8.5 17a9 9 0 0 1-4.6-1.2l-.3-.2-3.8.7.7-3.7-.2-.3A9 9 0 1 1 12 20.5zm5.2-6.7c-.3-.1-1.6-.8-1.9-.9s-.4-.1-.6.1-.7.9-.8 1-.3.2-.6.1a7.4 7.4 0 0 1-2.2-1.4 8.2 8.2 0 0 1-1.5-1.9c-.2-.3 0-.4.1-.6l.4-.5.1-.3c0-.1 0-.3-.1-.4s-.6-1.5-.8-2-.4-.5-.6-.5h-.5c-.2 0-.4.1-.6.3s-.8.8-.8 1.9.8 2.2.9 2.3c.1.2 1.6 2.5 3.9 3.5 1.4.6 1.9.7 2.6.6.4 0 1.6-.6 1.8-1.3.2-.6.2-1.2.1-1.3 0-.1-.2-.2-.5-.3z" />
        </svg>
      </a>
    </div>
  )
}
