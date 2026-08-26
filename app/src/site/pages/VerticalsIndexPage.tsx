import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import Reveal from '../components/Reveal'
import Tilt from '../components/Tilt'
import { siteAsset } from '../assets'
import { VERTICALS } from '../data/verticals'

export default function VerticalsIndexPage() {
  return (
    <>
      <section className="site-page-hero">
        <div className="site-hero-media">
          <img src={siteAsset('vertical-threads.jpg')} alt="Red Reach services" />
        </div>
        <div className="site-hero-copy">
          <div className="site-kicker">Our execution protocol</div>
          <h1 className="site-display">
            Seven verticals.
            <br />
            <em>One reach.</em>
          </h1>
          <p className="site-lede">
            Marketing, care, remote teams, travel, uniforms, trading, and upskilling — specialised companies
            under Red Reach Middle East FZE.
          </p>
        </div>
      </section>
      <section className="site-section">
        <div className="site-protocol">
          {VERTICALS.map((v, i) => (
            <Reveal key={v.slug} delay={i * 70}>
              <Tilt>
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
              </Tilt>
            </Reveal>
          ))}
        </div>
      </section>
    </>
  )
}
