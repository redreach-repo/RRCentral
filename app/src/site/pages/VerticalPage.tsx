import { Link, Navigate, useParams } from 'react-router-dom'
import ContactForm from '../components/ContactForm'
import { verticalBySlug } from '../data/verticals'

export default function VerticalPage() {
  const { slug } = useParams()
  const vertical = verticalBySlug(slug)
  if (!vertical) return <Navigate to="/" replace />

  return (
    <>
      <section className="site-page-hero">
        <div className="site-kicker">{vertical.eyebrow}</div>
        <h1 className="site-display">
          {vertical.heroLine}
          <br />
          <em>{vertical.heroAccent}</em>
        </h1>
        <p className="site-lede">{vertical.description}</p>
        <div className="site-actions">
          <Link className="site-btn site-btn-primary" to="/contact">
            Start a project
          </Link>
          <a className="site-btn site-btn-ghost" href="https://wa.me/971507008977" target="_blank" rel="noreferrer">
            WhatsApp
          </a>
        </div>
      </section>

      <section className="site-section">
        <div className="site-feature">
          <div>
            <span className="site-chip">{vertical.category}</span>
            <h3>{vertical.tagline}</h3>
            <ul className="site-bullets">
              {vertical.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
          <div className="site-highlights" style={{ gridTemplateColumns: '1fr' }}>
            {vertical.highlights.map((h) => (
              <article key={h.title} className="site-card" style={{ minHeight: 0 }}>
                <h3>{h.title}</h3>
                <p>{h.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {vertical.process && (
        <section className="site-section" style={{ paddingTop: 0 }}>
          <div className="site-kicker">How we work</div>
          <h2 className="site-h2" style={{ marginBottom: 28 }}>
            Process with <em>owners</em>
          </h2>
          <div className="site-principles">
            {vertical.process.map((step) => (
              <article key={step.step} className="site-principle">
                <strong>{step.step}</strong>
                <h3>{step.title}</h3>
                <p className="site-muted">{step.body}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="site-section" style={{ paddingTop: 0 }}>
        <div className="site-cta">
          <div>
            <div className="site-kicker">Next</div>
            <h2 className="site-h2">
              Ready when
              <br />
              <em>you are</em>
            </h2>
            <p className="site-lede">
              Share the brief for {vertical.brand}. It is filed in Central so the team can follow up with a
              quotation path, not a generic autoresponse.
            </p>
          </div>
          <ContactForm compact defaultVertical={vertical.slug} />
        </div>
      </section>
    </>
  )
}
