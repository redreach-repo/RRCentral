import { Link, Navigate, useParams } from 'react-router-dom'
import ContactForm from '../components/ContactForm'
import Seo from '../components/Seo'
import { siteAsset } from '../assets'
import { webPageJsonLd } from '../data/organization'
import { WANDER_REGIONS, wanderRegionBySlug } from '../data/destinations'

export default function WandersRegionPage() {
  const { region } = useParams()
  const land = wanderRegionBySlug(region)
  if (!land) return <Navigate to="/wanders" replace />

  const uniquePlaces = land.places.filter(
    (place, index, all) => all.findIndex((item) => item.image === place.image) === index,
  )
  const namedOnly = land.places.filter((place) => !uniquePlaces.includes(place))

  return (
    <div className="wander-root">
      <Seo
        title={`${land.name} | RR Wanders`}
        description={land.story}
        path={`/wanders/${land.slug}`}
        image={land.hero}
        jsonLd={webPageJsonLd(land.name, `/wanders/${land.slug}`, land.story)}
      />

      <section className="wander-hero wander-hero--region">
        <img src={siteAsset(land.hero)} alt="" className="is-on" />
        <div className="wander-hero-copy">
          <p className="wander-eyebrow">
            <Link to="/wanders">RR Wanders</Link> · {land.land}
          </p>
          <p className="wander-fact">{land.kicker}</p>
          <h1>{land.name}</h1>
          <a className="wander-discover" href="#places">
            Discover more
          </a>
        </div>
      </section>

      <section className="wander-story">
        <p>{land.headline}</p>
        <h2>{land.story}</h2>
      </section>

      <section className="wander-destinations" id="places">
        <header>
          <p>Places</p>
          <h2>inside {land.name}</h2>
        </header>
        <div className="wander-carousel">
          {uniquePlaces.map((place) => (
            <article key={place.name} className="wander-card">
              <img src={siteAsset(place.image)} alt="" />
              <div>
                <h3>{place.name}</h3>
                <p>{place.facts[0]}</p>
                <p>{place.facts[1]}</p>
              </div>
            </article>
          ))}
        </div>
        {namedOnly.length > 0 && (
          <p className="wander-also">
            Also planned from Dubai: {namedOnly.map((place) => place.name).join(', ')}.
          </p>
        )}
      </section>

      <nav className="wander-other">
        {WANDER_REGIONS.filter((item) => item.slug !== land.slug).map((item) => (
          <Link key={item.slug} to={`/wanders/${item.slug}`}>
            <img src={siteAsset(item.hero)} alt="" />
            <span>
              {item.name}
              <em>Discover more</em>
            </span>
          </Link>
        ))}
      </nav>

      <section className="wander-plan" id="plan">
        <div>
          <p>Plan {land.name}</p>
          <h2>Tell us how you want to move.</h2>
        </div>
        <ContactForm
          compact
          defaultVertical="wanders"
          defaultMessage={`I want to talk about ${land.name}.`}
          submitLabel="Plan your journey"
        />
      </section>
    </div>
  )
}
