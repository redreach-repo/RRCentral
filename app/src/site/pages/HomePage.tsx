import { Link } from 'react-router-dom'
import {
  Megaphone,
  HeartPulse,
  Headset,
  Compass,
  Shirt,
  Globe2,
  GraduationCap,
  ArrowUpRight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import ContactForm from '../components/ContactForm'
import Marquee from '../components/Marquee'
import StatusTicker from '../components/StatusTicker'
import {
  FEATURED_VERTICALS,
  PRINCIPLES,
  SITE,
  TESTIMONIALS,
  VERTICALS,
  type VerticalSlug,
} from '../data/verticals'

const ICONS: Record<VerticalSlug, LucideIcon> = {
  marketing: Megaphone,
  care: HeartPulse,
  connect: Headset,
  wanders: Compass,
  threads: Shirt,
  trading: Globe2,
  upskilling: GraduationCap,
}

export default function HomePage() {
  return (
    <>
      <section className="site-hero">
        <div className="site-kicker">Dubai consortium · since {SITE.founded}</div>
        <h1 className="site-display site-reveal">
          Reach Every
          <br />
          <em>District</em>
        </h1>
        <p className="site-lede">
          Seven specialised verticals. One operating system for growth — marketing, care, remote teams,
          travel, uniforms, trading, and upskilling, run from Dubai.
        </p>
        <div className="site-actions">
          <a className="site-btn site-btn-primary" href="#verticals">
            Explore verticals
          </a>
          <Link className="site-btn site-btn-ghost" to="/contact">
            Talk to us
          </Link>
        </div>
      </section>

      <section className="site-section" id="verticals">
        <div className="site-section-head">
          <div>
            <div className="site-kicker">Our execution protocol</div>
            <h2 className="site-h2">
              The missing piece,
              <br />
              <em>found.</em>
            </h2>
          </div>
          <p className="site-muted" style={{ maxWidth: 360 }}>
            Every vertical keeps its craft. Central keeps the pipeline, quotes, and follow-ups in one place.
          </p>
        </div>
        <div className="site-protocol">
          {VERTICALS.map((v) => {
            const Icon = ICONS[v.slug]
            return (
              <Link key={v.slug} to={`/verticals/${v.slug}`} className="site-card">
                <div className="site-card-icon">
                  <Icon size={18} />
                </div>
                <h3>{v.brand}</h3>
                <p>{v.summary}</p>
                <span className="site-muted" style={{ display: 'inline-flex', gap: 6, marginTop: 16, fontSize: 12 }}>
                  {v.category} <ArrowUpRight size={14} />
                </span>
              </Link>
            )
          })}
          <Link to="/contact" className="site-card">
            <div className="site-card-icon">
              <ArrowUpRight size={18} />
            </div>
            <h3>Need a path?</h3>
            <p>Tell us the vertical and the constraint. We will route it in Central to the right team.</p>
            <span className="site-muted" style={{ display: 'inline-flex', gap: 6, marginTop: 16, fontSize: 12 }}>
              Talk to us <ArrowUpRight size={14} />
            </span>
          </Link>
        </div>
      </section>

      <section className="site-section" style={{ paddingTop: 0 }}>
        {FEATURED_VERTICALS.map((v, i) => (
          <article key={v.slug} className={`site-feature ${i % 2 ? 'reverse' : ''}`}>
            <div className="site-feature-copy">
              <span className="site-chip">{v.category}</span>
              <h3>{v.brand}</h3>
              <p className="site-muted">{v.description}</p>
              <ul className="site-bullets">
                {v.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <div className="site-actions" style={{ marginTop: 24 }}>
                <Link className="site-btn site-btn-primary" to={`/verticals/${v.slug}`}>
                  View {v.brand}
                </Link>
              </div>
            </div>
            <div>
              <div className="site-chip">In motion</div>
              {v.highlights.slice(0, 4).map((h) => (
                <div key={h.title} className="site-principle" style={{ marginTop: 8 }}>
                  <h3 style={{ fontSize: 18 }}>{h.title}</h3>
                  <p className="site-muted">{h.body}</p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="site-section" style={{ paddingTop: 12 }}>
        <StatusTicker />
        <div className="site-pillars" style={{ marginTop: 22 }}>
          {[
            {
              eyebrow: 'Since 2018',
              title: 'A consortium, not a brochure',
              body: 'Specialised companies under one vision — Reach Every District — with teams that own the work.',
            },
            {
              eyebrow: 'Operating system',
              title: 'RR Central underneath',
              body: 'Quotes, follow-ups, inventory, and travel ops live in Central. The public site is the front door.',
            },
            {
              eyebrow: 'Dubai hub',
              title: 'Global reach, local precision',
              body: 'From Jebel Ali sourcing to Manila VA benches to India care pathways — coordinated here.',
            },
          ].map((p) => (
            <article key={p.title} className="site-card">
              <div className="site-kicker" style={{ marginBottom: 12 }}>
                {p.eyebrow}
              </div>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </article>
          ))}
        </div>
      </section>

      <Marquee />

      <section className="site-section">
        <div className="site-section-head">
          <div>
            <div className="site-kicker">The standard</div>
            <h2 className="site-h2">
              Innovation with
              <br />
              <em>reliability</em> at the core.
            </h2>
          </div>
        </div>
        <p className="site-lede">
          Founded in {SITE.founded}, Red Reach started as a Dubai team tired of fragmented vendors. Today we
          partner with companies who need a specialist for each job — and one group that can still answer the
          phone.
        </p>
        <div className="site-principles">
          {PRINCIPLES.map((p) => (
            <article key={p.n} className="site-principle">
              <strong>{p.n}</strong>
              <h3>{p.title}</h3>
              <p className="site-muted">{p.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="site-section" style={{ paddingTop: 0 }}>
        <div className="site-kicker">Trusted names</div>
        <h2 className="site-h2" style={{ marginBottom: 28 }}>
          Growing with our <em>clients</em>
        </h2>
        <div className="site-quotes">
          {TESTIMONIALS.map((t) => (
            <blockquote key={t.name} className="site-quote">
              <p>“{t.quote}”</p>
              <footer>
                {t.name}
                <br />
                {t.role}
              </footer>
            </blockquote>
          ))}
        </div>
      </section>

      <section className="site-section" id="contact">
        <div className="site-cta">
          <div>
            <div className="site-kicker">Let&apos;s work together</div>
            <h2 className="site-h2">
              Let&apos;s build something
              <br />
              <em>great</em> together
            </h2>
            <p className="site-lede">
              Tell us the vertical, the timeline, and the constraint. We&apos;ll come back with a path, not a
              pitch deck.
            </p>
            <p className="site-muted">
              {SITE.email}
              <br />
              {SITE.phone}
              <br />
              {SITE.location}
            </p>
          </div>
          <ContactForm compact />
        </div>
      </section>
    </>
  )
}
