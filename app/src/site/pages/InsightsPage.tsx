import { Link } from 'react-router-dom'
import Seo from '../components/Seo'
import { siteAsset } from '../assets'
import { webPageJsonLd } from '../data/organization'
import { VERTICALS } from '../data/verticals'
import { verticalPath } from '../data/playbooks'

const NOTES = [
  {
    title: 'Remote teams for UAE operators',
    body: 'When overhead is the wall, RR Connect is the desk. Brief the seat. We match, onboard and stay on the account.',
    to: 'connect',
  },
  {
    title: 'Planning care in India',
    body: 'RR Care is a facilitation desk, not a hospital. Discover, consult, choose, travel, treatment, recovery.',
    to: 'care',
  },
  {
    title: 'Uniforms as a programme',
    body: 'RR Threads starts with the workforce, not a t-shirt grid. Sample, specify, brand, QC, deliver.',
    to: 'threads',
  },
] as const

export default function InsightsPage() {
  return (
    <>
      <Seo
        title="Insights | Red Reach"
        description="Notes from Red Reach desks in Dubai. Not a content mill. When we have something useful, it will live here."
        path="/insights"
        jsonLd={webPageJsonLd('Insights', '/insights', 'Notes from the Red Reach desks.')}
      />
      <section className="site-page-hero">
        <div className="site-hero-media">
          <img src={siteAsset('office-1.jpg')} alt="Red Reach workspace" />
        </div>
        <div className="site-hero-copy">
          <div className="site-kicker">Insights</div>
          <h1 className="site-display">
            Notes from the work.
            <br />
            <em>Not a magazine.</em>
          </h1>
          <p className="site-lede">
            We will not invent articles to look busy. These are starting points into the desks. When there is
            something worth publishing, it will sit here.
          </p>
        </div>
      </section>
      <section className="site-section">
        <div className="site-insights">
          {NOTES.map((note) => {
            const desk = VERTICALS.find((v) => v.slug === note.to)
            return (
              <Link key={note.to} to={verticalPath(note.to)} className="site-insight">
                {desk && <img src={siteAsset(desk.image)} alt="" />}
                <div>
                  <span>{desk?.brand}</span>
                  <h2>{note.title}</h2>
                  <p>{note.body}</p>
                </div>
              </Link>
            )
          })}
        </div>
      </section>
    </>
  )
}
