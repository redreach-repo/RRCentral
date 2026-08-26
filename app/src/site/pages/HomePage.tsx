import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import ContactForm from '../components/ContactForm'
import Marquee from '../components/Marquee'
import { CLIENT_LOGOS, DESTINATION_PHOTOS, siteAsset } from '../assets'
import {
  FEATURED_VERTICALS,
  SITE,
  TESTIMONIALS,
  VERTICALS,
} from '../data/verticals'

export default function HomePage() {
  return (
    <>
      <section className="site-hero">
        <div className="site-hero-media">
          <img src={siteAsset('hero-team.jpg')} alt="Red Reach team" />
        </div>
        <div className="site-hero-copy">
          <div className="site-kicker">What&apos;s missing in your business?</div>
          <h1 className="site-display site-reveal">
            Find that
            <br />
            <em>Missing piece</em>
          </h1>
          <p className="site-lede">
            The missing piece to unlock business growth — seven specialist verticals, one Dubai consortium.
          </p>
          <div className="site-actions">
            <a className="site-btn site-btn-primary" href="#verticals">
              Find out more
            </a>
            <Link className="site-btn site-btn-gold" to="/contact">
              Talk to us
            </Link>
          </div>
        </div>
      </section>

      <section className="site-section">
        <div className="site-protocol">
          {[
            {
              kicker: 'Empowering growth',
              title: 'Our services',
              body: 'Discover tailored solutions designed to elevate your brand and accelerate growth.',
              to: '/verticals',
              cta: 'Red Reach services',
              img: 'office-1.jpg',
            },
            {
              kicker: 'Strategic precision',
              title: 'Our approach',
              body: 'We blend strategy, creativity, and data to craft solutions that drive measurable success.',
              to: '/about',
              cta: 'More about Red Reach',
              img: 'expertise-meeting.jpg',
            },
            {
              kicker: 'Seamless link',
              title: 'Our contact',
              body: 'Connect with us for collaborations, enquiries, or support — we are here to help you grow.',
              to: '/contact',
              cta: 'Get in touch',
              img: 'expertise-laptop.jpg',
            },
          ].map((card) => (
            <Link key={card.title} to={card.to} className="site-card">
              <div className="site-card-photo">
                <img src={siteAsset(card.img)} alt="" />
              </div>
              <div className="site-card-body">
                <div className="site-kicker" style={{ marginBottom: 8 }}>
                  {card.kicker}
                </div>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
                <span className="site-muted" style={{ display: 'inline-flex', gap: 6, marginTop: 16, fontSize: 12 }}>
                  {card.cta} <ArrowUpRight size={14} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="site-section" id="verticals" style={{ paddingTop: 12 }}>
        <div className="site-section-head">
          <div>
            <div className="site-kicker">Where can we help you</div>
            <h2 className="site-h2">
              Our <em>offerings</em>
            </h2>
          </div>
          <p className="site-muted" style={{ maxWidth: 360 }}>
            Specialised services in marketing, care, virtual assistance, travel, uniforms, trading, and
            upskilling.
          </p>
        </div>
        <div className="site-protocol">
          {VERTICALS.map((v) => (
            <Link key={v.slug} to={`/verticals/${v.slug}`} className="site-card">
              <div className="site-card-photo">
                <img src={siteAsset(v.image)} alt={v.brand} />
              </div>
              <div className="site-card-body">
                <div className="site-card-icon">
                  <img src={siteAsset(v.icon)} alt="" />
                </div>
                <h3>{v.brand}</h3>
                <p>{v.summary}</p>
                <span className="site-muted" style={{ display: 'inline-flex', gap: 6, marginTop: 16, fontSize: 12 }}>
                  Know more <ArrowUpRight size={14} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="site-section" style={{ paddingTop: 0 }}>
        {FEATURED_VERTICALS.map((v, i) => (
          <article key={v.slug} className={`site-feature ${i % 2 ? 'reverse' : ''}`}>
            <div className="site-feature-photo">
              <img src={siteAsset(v.image)} alt={v.brand} />
            </div>
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
          </article>
        ))}
      </section>

      <section className="site-section" style={{ paddingTop: 12 }}>
        <div className="site-section-head">
          <div>
            <div className="site-kicker">RR Wanders</div>
            <h2 className="site-h2">
              Journeys worth <em>the photograph</em>
            </h2>
          </div>
          <Link className="site-btn site-btn-ghost" to="/verticals/wanders">
            Explore travel
          </Link>
        </div>
        <div className="site-mosaic">
          {DESTINATION_PHOTOS.map((shot) => (
            <figure key={shot.file}>
              <img src={siteAsset(shot.file)} alt={shot.caption} />
              <figcaption>{shot.caption}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="site-section" style={{ paddingTop: 12 }}>
        <div className="site-split-photo">
          <div className="site-photo">
            <img src={siteAsset('expertise-meeting.jpg')} alt="Growing with our clients" />
          </div>
          <div>
            <div className="site-kicker">Growing with our clients</div>
            <h2 className="site-h2">
              Expertise <em>since {SITE.founded}</em>
            </h2>
            <p className="site-lede">
              Founded in Dubai, Red Reach is a consortium of specialised companies. We help organisations and
              people thrive across HR, marketing, travel, virtual assistance, uniforms, and trading.
            </p>
            <div className="site-principles">
              {[
                { n: '01', title: 'Consistency', body: 'Delivering reliable solutions across industries.' },
                { n: '02', title: 'Improvement', body: 'Driving growth through innovation and expertise.' },
                { n: '03', title: 'Branching', body: 'Expanding reach into new markets and sectors.' },
              ].map((p) => (
                <article key={p.n} className="site-principle">
                  <strong>{p.n}</strong>
                  <h3>{p.title}</h3>
                  <p className="site-muted">{p.body}</p>
                </article>
              ))}
            </div>
            <div className="site-stats">
              <div className="site-stat">
                <strong>{new Date().getFullYear() - SITE.founded}+</strong>
                <span>Years from Dubai</span>
              </div>
              <div className="site-stat">
                <strong>7</strong>
                <span>Specialist verticals</span>
              </div>
              <div className="site-stat">
                <strong>1</strong>
                <span>Consortium, every district</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Marquee />

      <div className="site-logo-strip" aria-label="Trusted by">
        {CLIENT_LOGOS.map((file) => (
          <img key={file} src={siteAsset(file)} alt="" />
        ))}
      </div>

      <div className="site-quotes-wrap">
        <section className="site-section">
          <div className="site-kicker">Where can we help you</div>
          <h2 className="site-h2" style={{ marginBottom: 28 }}>
            Trusted by some <em>biggest names</em>
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
      </div>

      <section className="site-section" id="contact">
        <div className="site-cta">
          <div>
            <div className="site-kicker">Request a call back</div>
            <h2 className="site-h2">
              Get your business
              <br />
              <em>right up there</em>
            </h2>
            <p className="site-lede">
              Customised services, {new Date().getFullYear() - SITE.founded}+ years of delivery, and a team that
              stays on the account.
            </p>
            <div className="site-photo" style={{ minHeight: 220, marginTop: 8 }}>
              <img src={siteAsset('office-2.jpg')} alt="Red Reach team at work" />
            </div>
            <p className="site-muted" style={{ marginTop: 16 }}>
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
