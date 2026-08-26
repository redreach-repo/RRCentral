import { Link } from 'react-router-dom'
import Seo from '../components/Seo'
import { siteAsset } from '../assets'
import { webPageJsonLd } from '../data/organization'
import { VERTICALS } from '../data/verticals'
import { verticalPath } from '../data/playbooks'

export default function VerticalsIndexPage() {
  return (
    <>
      <Seo
        title="Our Businesses | Red Reach"
        description="Seven Red Reach desks: RR Marketing, RR Care, RR Connect, RR Wanders, RR Threads, RR Trading and RR Upskilling."
        path="/businesses"
        jsonLd={webPageJsonLd('Our Businesses', '/businesses', 'The seven Red Reach divisions.')}
      />
      <section className="site-page-hero">
        <div className="site-hero-media">
          <img src={siteAsset('vertical-threads.jpg')} alt="Red Reach businesses" />
        </div>
        <div className="site-hero-copy">
          <div className="site-kicker">Our Businesses</div>
          <h1 className="site-display">
            Seven specialist desks.
            <br />
            <em>One reach.</em>
          </h1>
          <p className="site-lede">
            Marketing, medical travel, remote teams, journeys, uniforms, sourcing and learning. Each page is
            a specialist business. All seven belong to Red Reach.
          </p>
        </div>
      </section>
      <section className="site-section">
        <div className="site-worlds">
          {VERTICALS.map((v) => (
            <Link key={v.slug} to={verticalPath(v.slug)} className="site-world">
              <img src={siteAsset(v.image)} alt="" />
              <div className="site-world-copy">
                <span>{v.brand}</span>
                <h3>{v.tagline}</h3>
                <em>{v.cta}</em>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  )
}
