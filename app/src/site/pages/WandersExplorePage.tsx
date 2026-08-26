import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ContactForm from '../components/ContactForm'
import Seo from '../components/Seo'
import { siteAsset } from '../assets'
import { webPageJsonLd } from '../data/organization'
import { WANDER_BUCKET, WANDER_EXPERIENCES, WANDER_HERO, WANDER_REGIONS } from '../data/destinations'
import { SITE } from '../data/verticals'

export default function WandersExplorePage() {
  const [slide, setSlide] = useState(0)
  const current = WANDER_HERO[slide]

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = window.setInterval(() => setSlide((n) => (n + 1) % WANDER_HERO.length), 6500)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="wander-root">
      <Seo
        title="RR Wanders | Destinations for every bucket list"
        description="Discover Palawan, Munnar, Kathmandu and the high Himalaya with RR Wanders. Destination first. Then a journey planned from Dubai."
        path="/wanders"
        image={current.image}
        jsonLd={webPageJsonLd(
          'RR Wanders',
          '/wanders',
          'Destination discovery for the Philippines, Kerala and the Himalaya.',
        )}
      />

      <section className="wander-hero">
        {WANDER_HERO.map((item, i) => (
          <img
            key={item.name}
            src={siteAsset(item.image)}
            alt=""
            className={i === slide ? 'is-on' : undefined}
          />
        ))}
        <div className="wander-hero-copy">
          <p className="wander-eyebrow">RR Wanders · {current.region}</p>
          <p className="wander-fact">{current.fact}</p>
          <h1>{current.name}</h1>
          <Link className="wander-discover" to={`/wanders/${current.region}`}>
            Discover more
          </Link>
        </div>
        <div className="wander-hero-dots" role="tablist" aria-label="Featured places">
          {WANDER_HERO.map((item, i) => (
            <button
              key={item.name}
              type="button"
              role="tab"
              aria-selected={i === slide}
              className={i === slide ? 'is-on' : undefined}
              onClick={() => setSlide(i)}
            >
              {item.name}
            </button>
          ))}
        </div>
      </section>

      <nav className="wander-local" aria-label="On this page">
        <a href="#destinations">Destinations</a>
        <a href="#experiences">Experiences</a>
        <a href="#lands">Lands</a>
        <a href="#plan">Plan</a>
      </nav>

      <section className="wander-destinations" id="destinations">
        <header>
          <p>Destinations</p>
          <h2>for every bucket list</h2>
        </header>
        <div className="wander-carousel">
          {WANDER_BUCKET.map((place) => (
            <Link key={`${place.region}-${place.name}`} to={`/wanders/${place.region}`} className="wander-card">
              <img src={siteAsset(place.image)} alt="" />
              <div>
                <h3>{place.name}</h3>
                <p>{place.facts[0]}</p>
                <p>{place.facts[1]}</p>
                <span>Discover more</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="wander-experiences" id="experiences">
        <header>
          <p>Experiences</p>
          <h2>How you want to move</h2>
        </header>
        <div className="wander-experience-row">
          {WANDER_EXPERIENCES.map((item) => (
            <Link key={item.label} to={`/wanders/${item.to}`}>
              <img src={siteAsset(item.image)} alt="" />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="wander-lands" id="lands">
        {WANDER_REGIONS.map((region) => (
          <Link key={region.slug} to={`/wanders/${region.slug}`} className="wander-land">
            <img src={siteAsset(region.hero)} alt="" />
            <div>
              <p>{region.land}</p>
              <h2>{region.name}</h2>
              <span>Discover {region.name}</span>
            </div>
          </Link>
        ))}
      </section>

      <section className="wander-plan" id="plan">
        <div>
          <p>Plan</p>
          <h2>Tell us how you want to move.</h2>
          <p>
            RR Wanders is the travel desk of {SITE.name}. We plan from Dubai. Someone still owns the trip after
            you land.
          </p>
        </div>
        <ContactForm compact defaultVertical="wanders" submitLabel="Plan your journey" />
      </section>
    </div>
  )
}
