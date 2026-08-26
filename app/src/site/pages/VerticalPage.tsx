import { Link, Navigate, useParams } from 'react-router-dom'
import ContactForm from '../components/ContactForm'
import { siteAsset } from '../assets'
import { verticalBySlug } from '../data/verticals'

export default function VerticalPage() {
  const { slug } = useParams()
  const vertical = verticalBySlug(slug)
  if (!vertical) return <Navigate to="/" replace />

  return (
    <>
      <section className="site-page-hero">
        <div className="site-hero-media">
          <img src={siteAsset(vertical.image)} alt={vertical.brand} />
        </div>
        <div className="site-hero-copy">
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
            <a className="site-btn site-btn-gold" href="https://wa.me/971507008977" target="_blank" rel="noreferrer">
              WhatsApp
            </a>
          </div>
        </div>
      </section>

      <section className="site-section">
        <div className="site-feature">
          <div className="site-feature-copy">
            <span className="site-chip">{vertical.category}</span>
            <h3>{vertical.tagline}</h3>
            <ul className="site-bullets">
              {vertical.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
          <div className="site-highlights" style={{ gridTemplateColumns: '1fr', padding: 18 }}>
            {vertical.highlights.map((h) => (
              <article key={h.title} className="site-card" style={{ minHeight: 0 }}>
                <div className="site-card-body">
                  <h3>{h.title}</h3>
                  <p>{h.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {vertical.gallery && vertical.gallery.length > 0 && (
        <section className="site-section" style={{ paddingTop: 0 }}>
          <div className="site-kicker">In the field</div>
          <h2 className="site-h2" style={{ marginBottom: 28 }}>
            Pictures from <em>{vertical.brand}</em>
          </h2>
          <div className="site-gallery">
            {vertical.gallery.map((file) => (
              <figure key={file}>
                <img src={siteAsset(file)} alt="" />
              </figure>
            ))}
          </div>
        </section>
      )}

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
              quotation path.
            </p>
          </div>
          <ContactForm compact defaultVertical={vertical.slug} />
        </div>
      </section>
    </>
  )
}
