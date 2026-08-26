import { Link } from 'react-router-dom'
import ContactForm from '../components/ContactForm'
import PhotoMarquee from '../components/PhotoMarquee'
import QuoteStage from '../components/QuoteStage'
import Reveal from '../components/Reveal'
import { DESTINATION_FILM, THREAD_LOOKBOOK, siteAsset } from '../assets'
import { verticalPath, type VerticalPlaybook } from '../data/playbooks'
import { VERTICALS, type Vertical } from '../data/verticals'
import { THREADS_CATALOGUE, briefAccent, briefTitle, ctaLabel, whatsappHref } from './verticalCopy'

type LayoutProps = {
  vertical: Vertical
  playbook: VerticalPlaybook
  onOpenShot: (index: number) => void
}

export function AgencyLayout({ vertical, playbook, onOpenShot }: LayoutProps) {
  return (
    <>
      <VerticalHero vertical={vertical} playbook={playbook} />
      <PromiseBand playbook={playbook} />
      <section className="site-section">
        <div className="site-section-head">
          <div>
            <div className="site-kicker">Capabilities</div>
            <h2 className="site-h2">{playbook.collectionTitle}</h2>
          </div>
          <p className="site-muted" style={{ maxWidth: 380 }}>
            {playbook.collectionLede}
          </p>
        </div>
        <div className="site-capability-list">
          {playbook.collection.map((item, i) => (
            <Reveal key={item.title} delay={i * 50}>
              <article className="site-capability">
                <span>{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </section>
      <StatsRow playbook={playbook} />
      <Highlights vertical={vertical} />
      <Steps playbook={playbook} />
      <Gallery vertical={vertical} onOpenShot={onOpenShot} />
      <Brief vertical={vertical} playbook={playbook} />
      <Related slug={vertical.slug} />
    </>
  )
}

export function MedicalLayout({ vertical, playbook, onOpenShot }: LayoutProps) {
  return (
    <>
      <VerticalHero vertical={vertical} playbook={playbook} />
      <section className="site-promise-band site-trust-band">
        <div className="site-section" style={{ paddingTop: 0, paddingBottom: 0 }}>
          <div className="site-trust">
            {playbook.promise.map((item) => (
              <article key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="site-section">
        <div className="site-section-head">
          <div>
            <div className="site-kicker">Pathways</div>
            <h2 className="site-h2">{playbook.collectionTitle}</h2>
          </div>
          <p className="site-muted" style={{ maxWidth: 400 }}>
            {playbook.collectionLede}
          </p>
        </div>
        <div className="site-pathways">
          {playbook.collection.map((item) => (
            <article key={item.title} className="site-pathway">
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <a href="#brief">Talk to a coordinator</a>
            </article>
          ))}
        </div>
      </section>
      <StatsRow playbook={playbook} />
      <Steps playbook={playbook} />
      <Gallery vertical={vertical} onOpenShot={onOpenShot} />
      <Brief vertical={vertical} playbook={playbook} />
      <Related slug={vertical.slug} />
    </>
  )
}

export function VaLayout({ vertical, playbook, onOpenShot }: LayoutProps) {
  return (
    <>
      <VerticalHero vertical={vertical} playbook={playbook} />
      <PromiseBand playbook={playbook} />
      <section className="site-section">
        <div className="site-section-head">
          <div>
            <div className="site-kicker">Hire a seat</div>
            <h2 className="site-h2">{playbook.collectionTitle}</h2>
          </div>
          <p className="site-muted" style={{ maxWidth: 380 }}>
            {playbook.collectionLede}
          </p>
        </div>
        <div className="site-roles">
          {playbook.collection.map((item) => (
            <article key={item.title} className="site-role">
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <a href="#brief">Request this role</a>
            </article>
          ))}
        </div>
      </section>
      <StatsRow playbook={playbook} />
      <section className="site-section" style={{ paddingTop: 0 }}>
        <div className="site-kicker">Clients on the bench</div>
        <h2 className="site-h2" style={{ marginBottom: 28 }}>
          Dedicated people. <em>Your hours.</em>
        </h2>
        <QuoteStage />
      </section>
      <Steps playbook={playbook} />
      <Gallery vertical={vertical} onOpenShot={onOpenShot} />
      <Brief vertical={vertical} playbook={playbook} />
      <Related slug={vertical.slug} />
    </>
  )
}

export function TravelLayout({ vertical, playbook, onOpenShot }: LayoutProps) {
  const mosaic = playbook.collection.filter((item) => item.image)
  return (
    <>
      <VerticalHero vertical={vertical} playbook={playbook} tall />
      <section className="site-section">
        <div className="site-section-head">
          <div>
            <div className="site-kicker">Collections</div>
            <h2 className="site-h2">{playbook.collectionTitle}</h2>
          </div>
          <p className="site-muted" style={{ maxWidth: 400 }}>
            {playbook.collectionLede}
          </p>
        </div>
        <div className="site-mosaic">
          {mosaic.map((item, i) => (
            <figure key={item.title}>
              <button type="button" onClick={() => onOpenShot(i)} aria-label={`Open ${item.title}`}>
                <img src={siteAsset(item.image!)} alt={item.title} />
              </button>
              <figcaption>
                {item.title}
                <span>{item.body}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
      <PhotoMarquee files={DESTINATION_FILM} />
      <PromiseBand playbook={playbook} />
      <StatsRow playbook={playbook} />
      <Steps playbook={playbook} />
      <Brief vertical={vertical} playbook={playbook} />
      <Related slug={vertical.slug} />
    </>
  )
}

export function ApparelLayout({ vertical, playbook, onOpenShot }: LayoutProps) {
  return (
    <>
      <VerticalHero vertical={vertical} playbook={playbook} />
      <section className="site-section">
        <div className="site-section-head">
          <div>
            <div className="site-kicker">Lookbook</div>
            <h2 className="site-h2">Uniforms that <em>carry the brand</em></h2>
          </div>
          <a className="site-btn site-btn-ghost" href={THREADS_CATALOGUE} target="_blank" rel="noreferrer">
            Download catalogue
          </a>
        </div>
        <div className="site-lookbook">
          {THREAD_LOOKBOOK.map((file, i) => (
            <button key={file} type="button" onClick={() => onOpenShot(i)} aria-label="Open uniform photograph">
              <img src={siteAsset(file)} alt="RR Threads uniform" />
            </button>
          ))}
        </div>
      </section>
      <PromiseBand playbook={playbook} />
      <section className="site-section">
        <div className="site-section-head">
          <div>
            <div className="site-kicker">Programmes</div>
            <h2 className="site-h2">{playbook.collectionTitle}</h2>
          </div>
          <p className="site-muted" style={{ maxWidth: 380 }}>
            {playbook.collectionLede}
          </p>
        </div>
        <div className="site-catalog photo">
          {playbook.collection.map((item) => (
            <article key={item.title} className="site-catalog-card">
              {item.image && (
                <div className="site-catalog-photo">
                  <img src={siteAsset(item.image)} alt={item.title} />
                </div>
              )}
              <div className="site-catalog-copy">
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <StatsRow playbook={playbook} />
      <Steps playbook={playbook} />
      <Brief vertical={vertical} playbook={playbook} />
      <Related slug={vertical.slug} />
    </>
  )
}

export function TradeLayout({ vertical, playbook, onOpenShot }: LayoutProps) {
  return (
    <>
      <VerticalHero vertical={vertical} playbook={playbook} />
      <section className="site-ink-band">
        <div className="site-section" style={{ paddingTop: 0, paddingBottom: 0 }}>
          <div className="site-ink-grid">
            {playbook.promise.map((item) => (
              <article key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="site-section">
        <div className="site-section-head">
          <div>
            <div className="site-kicker">Sourcing desk</div>
            <h2 className="site-h2">{playbook.collectionTitle}</h2>
          </div>
          <p className="site-muted" style={{ maxWidth: 380 }}>
            {playbook.collectionLede}
          </p>
        </div>
        <div className="site-catalog">
          {playbook.collection.map((item) => (
            <article key={item.title} className="site-catalog-card site-spec-card">
              <div className="site-catalog-copy">
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <StatsRow playbook={playbook} />
      <Steps playbook={playbook} />
      <Gallery vertical={vertical} onOpenShot={onOpenShot} />
      <Brief vertical={vertical} playbook={playbook} />
      <Related slug={vertical.slug} />
    </>
  )
}

export function LearnLayout({ vertical, playbook, onOpenShot }: LayoutProps) {
  return (
    <>
      <VerticalHero vertical={vertical} playbook={playbook} />
      <PromiseBand playbook={playbook} />
      <section className="site-section">
        <div className="site-section-head">
          <div>
            <div className="site-kicker">Curriculum</div>
            <h2 className="site-h2">{playbook.collectionTitle}</h2>
          </div>
          <p className="site-muted" style={{ maxWidth: 380 }}>
            {playbook.collectionLede}
          </p>
        </div>
        <div className="site-courses">
          {playbook.collection.map((item) => (
            <article key={item.title} className="site-course">
              <span className="site-course-badge">80% to pass</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <a href="#brief">Ask about this course</a>
            </article>
          ))}
        </div>
      </section>
      <StatsRow playbook={playbook} />
      <Steps playbook={playbook} />
      <Gallery vertical={vertical} onOpenShot={onOpenShot} />
      <Brief vertical={vertical} playbook={playbook} />
      <Related slug={vertical.slug} />
    </>
  )
}

function VerticalHero({
  vertical,
  playbook,
  tall = false,
}: {
  vertical: Vertical
  playbook: VerticalPlaybook
  tall?: boolean
}) {
  return (
    <section className={`site-page-hero ${tall ? 'site-page-hero--tall' : ''}`}>
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
          <a className="site-btn site-btn-primary" href="#brief">
            {ctaLabel(playbook.layout)}
          </a>
          <a className="site-btn site-btn-gold" href={whatsappHref(vertical)} target="_blank" rel="noreferrer">
            WhatsApp
          </a>
        </div>
      </div>
    </section>
  )
}

function PromiseBand({ playbook }: { playbook: VerticalPlaybook }) {
  return (
    <section className="site-promise-band">
      <div className="site-section" style={{ paddingTop: 0, paddingBottom: 0 }}>
        <div className="site-promise">
          {playbook.promise.map((item) => (
            <article key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function StatsRow({ playbook }: { playbook: VerticalPlaybook }) {
  return (
    <section className="site-section" style={{ paddingTop: 0 }}>
      <div className="site-stats site-stats-row">
        {playbook.stats.map((stat) => (
          <div key={stat.label} className="site-stat">
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function Highlights({ vertical }: { vertical: Vertical }) {
  return (
    <section className="site-section" style={{ paddingTop: 0 }}>
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
  )
}

function Steps({ playbook }: { playbook: VerticalPlaybook }) {
  return (
    <section className="site-section" style={{ paddingTop: 0 }}>
      <div className="site-kicker">How we work</div>
      <h2 className="site-h2" style={{ marginBottom: 28 }}>
        Process with <em>owners</em>
      </h2>
      <ol className="site-steps">
        {playbook.steps.map((step) => (
          <li key={step.step}>
            <strong>{step.step}</strong>
            <h3>{step.title}</h3>
            <p className="site-muted">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Gallery({ vertical, onOpenShot }: { vertical: Vertical; onOpenShot: (index: number) => void }) {
  if (!vertical.gallery?.length) return null
  return (
    <section className="site-section" style={{ paddingTop: 0 }}>
      <div className="site-kicker">In the field</div>
      <h2 className="site-h2" style={{ marginBottom: 28 }}>
        Pictures from <em>{vertical.brand}</em>
      </h2>
      <div className="site-gallery">
        {vertical.gallery.map((file, i) => (
          <figure key={file}>
            <button type="button" onClick={() => onOpenShot(i)} aria-label="Open photograph">
              <img src={siteAsset(file)} alt="" />
            </button>
          </figure>
        ))}
      </div>
    </section>
  )
}

function Brief({ vertical, playbook }: { vertical: Vertical; playbook: VerticalPlaybook }) {
  return (
    <section className="site-section" style={{ paddingTop: 0 }} id="brief">
      <div className="site-cta">
        <div>
          <div className="site-kicker">{vertical.brand}</div>
          <h2 className="site-h2">
            {briefTitle(playbook.layout)}
            <br />
            <em>{briefAccent(playbook.layout)}</em>
          </h2>
          <p className="site-lede">
            Share the brief for {vertical.brand}. It is filed in Central so the right team can follow up.
          </p>
        </div>
        <ContactForm compact defaultVertical={vertical.slug} />
      </div>
    </section>
  )
}

function Related({ slug }: { slug: string }) {
  const related = VERTICALS.filter((item) => item.slug !== slug)
  return (
    <section className="site-section" style={{ paddingTop: 0 }}>
      <div className="site-kicker">The rest of the group</div>
      <h2 className="site-h2" style={{ marginBottom: 28 }}>
        Other Red Reach <em>companies</em>
      </h2>
      <div className="site-related">
        {related.map((item) => (
          <Link key={item.slug} to={verticalPath(item.slug)} className="site-related-card">
            <img src={siteAsset(item.image)} alt="" />
            <span>{item.brand}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
