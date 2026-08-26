import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import ContactForm from '../components/ContactForm'
import Reveal from '../components/Reveal'
import Seo from '../components/Seo'
import { siteAsset } from '../assets'
import { organizationJsonLd } from '../data/organization'
import { APPROACH, FEATURED_VERTICALS, SITE, VERTICALS, WHY_RED_REACH } from '../data/verticals'
import { verticalPath } from '../data/playbooks'

export default function HomePage() {
  return (
    <>
      <Seo
        title="Red Reach | One company. Seven ways forward."
        description="Red Reach Middle East FZE is a Dubai group for marketing, medical travel, remote teams, travel, uniforms, sourcing and upskilling. One parent. Seven specialist desks."
        path="/"
        jsonLd={organizationJsonLd()}
      />

      <section className="site-hero">
        <div className="site-hero-media">
          <img src={siteAsset('hero-team.jpg')} alt="Red Reach team in Dubai" />
        </div>
        <div className="site-hero-copy">
          <div className="site-kicker">{SITE.legal}</div>
          <h1 className="site-display">
            Helping businesses
            <br />
            <em>move further.</em>
          </h1>
          <p className="site-lede">
            Red Reach brings together marketing, healthcare travel, remote teams, journeys, apparel,
            sourcing and learning. One Dubai company. Seven specialist desks. Built for SMEs and for
            organisations that need a serious partner.
          </p>
          <div className="site-actions">
            <a className="site-btn site-btn-primary" href="#businesses">
              Explore Red Reach
            </a>
            <Link className="site-btn site-btn-gold" to="/contact">
              Talk to us
            </Link>
          </div>
        </div>
      </section>

      <section className="site-section" id="businesses">
        <div className="site-section-head">
          <div>
            <div className="site-kicker">What we do</div>
            <h2 className="site-h2">
              Seven desks. <em>One parent.</em>
            </h2>
          </div>
          <p className="site-muted" style={{ maxWidth: 380 }}>
            Each division is a specialist business. All seven share the same Red Reach standard: understand
            the brief, then execute.
          </p>
        </div>
        <div className="site-worlds">
          {VERTICALS.map((v, i) => (
            <Reveal key={v.slug} delay={i * 40}>
              <Link to={verticalPath(v.slug)} className="site-world">
                <img src={siteAsset(v.image)} alt="" />
                <div className="site-world-copy">
                  <span>{v.brand}</span>
                  <h3>{v.tagline}</h3>
                  <em>
                    {v.cta} <ArrowUpRight size={14} />
                  </em>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="site-ecosystem-wrap">
        <div className="site-section" style={{ paddingBottom: 0 }}>
          <div className="site-kicker">The group</div>
          <h2 className="site-h2">
            One company. <em>Seven possibilities.</em>
          </h2>
        </div>
        <nav className="site-ecosystem" aria-label="Red Reach ecosystem">
          {VERTICALS.map((v) => (
            <Link key={v.slug} to={verticalPath(v.slug)}>
              <strong>{v.verb}</strong>
              <span>{v.brand}</span>
            </Link>
          ))}
        </nav>
      </section>

      <section className="site-section">
        <div className="site-section-head">
          <div>
            <div className="site-kicker">Why Red Reach</div>
            <h2 className="site-h2">
              A UAE company that <em>gets things done.</em>
            </h2>
          </div>
        </div>
        <div className="site-why">
          {WHY_RED_REACH.map((item) => (
            <article key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="site-section" style={{ paddingTop: 0 }}>
        <div className="site-section-head">
          <div>
            <div className="site-kicker">Featured desks</div>
            <h2 className="site-h2">
              Three doors in. <em>The rest next door.</em>
            </h2>
          </div>
          <Link className="site-btn site-btn-ghost" to="/businesses">
            All seven
          </Link>
        </div>
        <div className="site-editorial">
          {FEATURED_VERTICALS.map((v) => (
            <Link key={v.slug} to={verticalPath(v.slug)} className="site-editorial-card">
              <img src={siteAsset(v.image)} alt="" />
              <div>
                <span className="site-chip">{v.brand}</span>
                <h3>{v.tagline}</h3>
                <p>{v.summary}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="site-section" style={{ paddingTop: 0 }}>
        <div className="site-kicker">The Red Reach approach</div>
        <h2 className="site-h2" style={{ marginBottom: 28 }}>
          Understand. Strategize. Connect. Execute. <em>Grow.</em>
        </h2>
        <ol className="site-approach">
          {APPROACH.map((item) => (
            <li key={item.step}>
              <strong>{item.step}</strong>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="site-section" id="talk">
        <div className="site-cta">
          <div>
            <div className="site-kicker">Contact</div>
            <h2 className="site-h2">
              Have a requirement?
              <br />
              <em>Let&apos;s talk.</em>
            </h2>
            <p className="site-lede">
              Choose the desk. If you are not sure, send a general enquiry. It lands in Central so the
              right people can pick it up.
            </p>
          </div>
          <ContactForm submitLabel="Send the brief" />
        </div>
      </section>
    </>
  )
}
