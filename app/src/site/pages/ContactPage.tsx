import ContactForm from '../components/ContactForm'
import Seo from '../components/Seo'
import { siteAsset } from '../assets'
import { webPageJsonLd } from '../data/organization'
import { SITE } from '../data/verticals'

export default function ContactPage() {
  return (
    <>
      <Seo
        title="Contact Red Reach | Talk to the right desk"
        description="Contact Red Reach Middle East in Dubai. Choose marketing, medical travel, remote teams, travel, uniforms, sourcing, upskilling, or a general enquiry."
        path="/contact"
        jsonLd={webPageJsonLd('Contact Red Reach', '/contact', 'Talk to Red Reach Middle East FZE in Dubai.')}
      />
      <section className="site-page-hero">
        <div className="site-hero-media">
          <img src={siteAsset('hero-team.jpg')} alt="Red Reach office, Dubai" />
        </div>
        <div className="site-hero-copy">
          <div className="site-kicker">Contact</div>
          <h1 className="site-display">
            Have a requirement?
            <br />
            <em>Let&apos;s talk.</em>
          </h1>
          <p className="site-lede">
            Choose the desk. If you are not sure, send a general enquiry. It lands in Central so the right
            people can pick it up.
          </p>
        </div>
      </section>
      <section className="site-section">
        <div className="site-cta">
          <div>
            <div className="site-card">
              <div className="site-card-photo">
                <img src={siteAsset('dubai.jpg')} alt="Dubai" />
              </div>
              <div className="site-card-body">
                <h3>Address</h3>
                {SITE.addressLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
                <p>{SITE.hours}</p>
              </div>
            </div>
            <div className="site-card" style={{ marginTop: 14 }}>
              <div className="site-card-body">
                <h3>Call</h3>
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
              </div>
            </div>
          </div>
          <ContactForm submitLabel="Send the brief" />
        </div>
      </section>
    </>
  )
}
