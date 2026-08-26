import { Link } from 'react-router-dom'
import Reveal from '../components/Reveal'
import Seo from '../components/Seo'
import { siteAsset } from '../assets'
import { SITE, VERTICALS, WHY_RED_REACH } from '../data/verticals'
import { webPageJsonLd } from '../data/organization'
import { verticalPath } from '../data/playbooks'

export default function AboutPage() {
  return (
    <>
      <Seo
        title="About Red Reach | Dubai since 2018"
        description="Red Reach Middle East FZE is a Dubai group founded in 2018. Seven specialist desks for marketing, care, remote teams, travel, uniforms, sourcing and learning."
        path="/about"
        image="expertise-laptop.jpg"
        jsonLd={webPageJsonLd('About Red Reach', '/about', 'Red Reach Middle East FZE, founded in Dubai in 2018.')}
      />
      <section className="site-page-hero">
        <div className="site-hero-media">
          <img src={siteAsset('expertise-laptop.jpg')} alt="Red Reach team at work" />
        </div>
        <div className="site-hero-copy">
          <div className="site-kicker">About</div>
          <h1 className="site-display">
            A Dubai company
            <br />
            <em>with range.</em>
          </h1>
          <p className="site-lede">
            Founded in {SITE.founded}. Headquartered in Dubai. Red Reach Middle East FZE runs seven specialist
            desks so a business can market, operate, connect, travel, source, trade and upskill without
            collecting seven unrelated vendors.
          </p>
        </div>
      </section>

      <section className="site-section">
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
        <div className="site-kicker">The desks</div>
        <h2 className="site-h2" style={{ marginBottom: 28 }}>
          Seven ways <em>forward.</em>
        </h2>
        <div className="site-worlds">
          {VERTICALS.map((v, i) => (
            <Reveal key={v.slug} delay={i * 40}>
              <Link to={verticalPath(v.slug)} className="site-world">
                <img src={siteAsset(v.image)} alt="" />
                <div className="site-world-copy">
                  <span>{v.brand}</span>
                  <h3>{v.tagline}</h3>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>
    </>
  )
}
