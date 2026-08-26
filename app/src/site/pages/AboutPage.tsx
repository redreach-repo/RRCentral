import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import Reveal from '../components/Reveal'
import { siteAsset } from '../assets'
import { PRINCIPLES, SITE, VERTICALS } from '../data/verticals'

export default function AboutPage() {
  return (
    <>
      <section className="site-page-hero">
        <div className="site-hero-media">
          <img src={siteAsset('expertise-laptop.jpg')} alt="Red Reach team" />
        </div>
        <div className="site-hero-copy">
          <div className="site-kicker">About us</div>
          <h1 className="site-display">
            Rooted in
            <br />
            <em>vision</em>
          </h1>
          <p className="site-lede">
            Founded in {SITE.founded} in Dubai, Red Reach is a consortium of specialised companies — driven by
            one commitment: {SITE.tagline}.
          </p>
        </div>
      </section>

      <section className="site-section">
        <div className="site-split-photo">
          <div className="site-photo site-frame">
            <img src={siteAsset('wander-houseboat.jpg')} alt="Journeys from Dubai to the world" />
          </div>
          <div>
            <div className="site-highlights">
              <article className="site-card">
                <div className="site-card-body">
                  <h3>Our mission</h3>
                  <p>
                    Deliver client-focused solutions that unlock opportunity. We build partnerships on trust,
                    transparency, and measurable impact.
                  </p>
                </div>
              </article>
              <article className="site-card">
                <div className="site-card-body">
                  <h3>Our commitment</h3>
                  <p>
                    We are a strategic partner, not a ticket desk. Challenges become programmes with owners,
                    quality bars, and a path to scale.
                  </p>
                </div>
              </article>
            </div>
            <div className="site-photo" style={{ marginTop: 16, minHeight: 220 }}>
              <img src={siteAsset('dubai.jpg')} alt="From Dubai to the Himalayas" />
            </div>
          </div>
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
          {VERTICALS.map((v, i) => (
            <Reveal key={v.slug} delay={i * 70}>
              <Link to={`/verticals/${v.slug}`} className="site-offering">
                <img src={siteAsset(v.image)} alt={v.brand} />
                <div className="site-offering-copy">
                  <span className="site-chip">{v.category}</span>
                  <h3>{v.brand}</h3>
                  <p>{v.summary}</p>
                  <span>
                    Know more <ArrowUpRight size={14} />
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>
    </>
  )
}
