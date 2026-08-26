import { Link } from 'react-router-dom'
import { PRINCIPLES, SITE, VERTICALS } from '../data/verticals'

export default function AboutPage() {
  return (
    <>
      <section className="site-page-hero">
        <div className="site-kicker">About us</div>
        <h1 className="site-display">
          Rooted in
          <br />
          <em>vision</em>
        </h1>
        <p className="site-lede">
          Founded in {SITE.founded} and headquartered in Dubai, Red Reach is a consortium of specialised
          companies delivering HR, marketing, travel, virtual assistance, uniforms, trading, and upskilling —
          driven by one commitment: {SITE.tagline}.
        </p>
      </section>

      <section className="site-section">
        <div className="site-highlights">
          <article className="site-card">
            <h3>Our mission</h3>
            <p>
              Deliver client-focused solutions that unlock opportunity. We build partnerships on trust,
              transparency, and measurable impact — from high-performing teams to supply chains and journeys.
            </p>
          </article>
          <article className="site-card">
            <h3>Our commitment</h3>
            <p>
              We are a strategic partner, not a ticket desk. Challenges become programmes with owners, quality
              bars, and a path to scale across districts.
            </p>
          </article>
        </div>
      </section>

      <section className="site-section" style={{ paddingTop: 0 }}>
        <div className="site-kicker">The standard</div>
        <h2 className="site-h2" style={{ marginBottom: 28 }}>
          Why partner <em>with us</em>
        </h2>
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
        <div className="site-kicker">Offerings</div>
        <h2 className="site-h2" style={{ marginBottom: 28 }}>
          Seven verticals. <em>One group.</em>
        </h2>
        <div className="site-protocol">
          {VERTICALS.map((v) => (
            <Link key={v.slug} to={`/verticals/${v.slug}`} className="site-card">
              <div className="site-chip">{v.category}</div>
              <h3>{v.brand}</h3>
              <p>{v.summary}</p>
            </Link>
          ))}
        </div>
      </section>
    </>
  )
}
