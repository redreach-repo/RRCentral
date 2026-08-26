import ContactForm from '../components/ContactForm'
import { SITE } from '../data/verticals'

export default function ContactPage() {
  return (
    <>
      <section className="site-page-hero">
        <div className="site-kicker">Get in touch</div>
        <h1 className="site-display">
          Get your business
          <br />
          <em>right up there</em>
        </h1>
        <p className="site-lede">
          Come by, write, or send a brief. Enquiries land in RR Central so the right vertical can pick them up.
        </p>
      </section>
      <section className="site-section">
        <div className="site-cta">
          <div>
            <div className="site-card" style={{ minHeight: 0 }}>
              <h3>Address</h3>
              {SITE.addressLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            <div className="site-card" style={{ minHeight: 0, marginTop: 14 }}>
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
          <ContactForm />
        </div>
      </section>
    </>
  )
}
