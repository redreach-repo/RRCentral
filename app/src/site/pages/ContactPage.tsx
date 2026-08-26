import ContactForm from '../components/ContactForm'
import { siteAsset } from '../assets'
import { SITE } from '../data/verticals'

export default function ContactPage() {
  return (
    <>
      <section className="site-page-hero">
        <div className="site-hero-media">
          <img src={siteAsset('hero-team.jpg')} alt="Red Reach office" />
        </div>
        <div className="site-hero-copy">
          <div className="site-kicker">Get in touch</div>
          <h1 className="site-display">
            Get your business
            <br />
            <em>right up there</em>
          </h1>
          <p className="site-lede">
            Come by, write, or send a brief. Enquiries land in RR Central so the right vertical can pick them up.
          </p>
        </div>
      </section>
      <section className="site-section">
        <div className="site-cta">
          <div>
            <div className="site-card">
              <div className="site-card-photo">
                <img src={siteAsset('wander-city.jpg')} alt="Visit us" />
              </div>
              <div className="site-card-body">
                <h3>Address</h3>
                {SITE.addressLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
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
          <ContactForm />
        </div>
      </section>
    </>
  )
}
