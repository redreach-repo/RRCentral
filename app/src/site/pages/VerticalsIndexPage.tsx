import { Link } from 'react-router-dom'
import { VERTICALS } from '../data/verticals'

export default function VerticalsIndexPage() {
  return (
    <>
      <section className="site-page-hero">
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
      </section>
      <section className="site-section">
        <div className="site-protocol">
          {VERTICALS.map((v) => (
            <Link key={v.slug} to={`/verticals/${v.slug}`} className="site-card">
              <div className="site-chip">{v.category}</div>
              <h3>{v.brand}</h3>
              <p>{v.summary}</p>
            </Link>
          ))}
        </div>
      </section>
    </>
  )
}
