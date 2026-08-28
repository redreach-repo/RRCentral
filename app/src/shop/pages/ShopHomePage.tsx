import { Link } from 'react-router-dom'
import { CATEGORIES, PRODUCTS, featuredProducts, productBySlug, saleProducts } from '../catalog'
import { formatAed } from '../format'
import ProductCard from '../components/ProductCard'
import TeeMockup from '../components/TeeMockup'

const HERO = productBySlug('faith-over-fear')!
const SIDE = productBySlug('dubai-nights')!

export default function ShopHomePage() {
  const featured = featuredProducts(8)
  const sale = saleProducts(4)

  return (
    <>
      <section className="tt-hero">
        <div className="tt-hero-main">
          <TeeMockup product={HERO} colorId="black" />
          <div className="tt-hero-kicker">This week’s drop</div>
          <h1>Wear the line you keep.</h1>
          <Link to="/shop/c/all" className="tt-btn tt-btn-light">
            Shop all tees
          </Link>
        </div>
        <Link to="/shop/c/secular" className="tt-hero-side">
          <TeeMockup product={SIDE} colorId="black" />
          <div className="tt-hero-kicker">Secular</div>
          <h2>Dubai Nights</h2>
          <span className="tt-btn tt-btn-light">Shop the city</span>
        </Link>
      </section>

      <section className="tt-section">
        <div className="tt-tiles">
          {CATEGORIES.map((category) => {
            const sample = PRODUCTS.find((p) => p.category === category.id)!
            return (
              <Link key={category.id} to={`/shop/c/${category.id}`} className="tt-tile">
                <span>{category.nav}</span>
                <strong>{category.label}</strong>
                <TeeMockup product={sample} />
              </Link>
            )
          })}
        </div>
      </section>

      <section className="tt-section">
        <div className="tt-section-head">
          <div>
            <p className="tt-muted">Limited inks</p>
            <h2>On sale</h2>
          </div>
          <Link to="/shop/sale">View all sale</Link>
        </div>
        <div className="tt-grid">
          {sale.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section className="tt-section">
        <div className="tt-banner">
          <div>
            <div className="tt-hero-kicker">From RR Threads</div>
            <h2>Same floor. Retail cut.</h2>
            <p className="tt-muted" style={{ color: '#cfc6ba', maxWidth: 420 }}>
              Midweight cotton, set prints, QC on every piece — then sold like Namshi: search, filter, bag,
              Stripe.
            </p>
          </div>
          <Link to="/threads" className="tt-btn tt-btn-light">
            Uniforms for teams
          </Link>
        </div>
      </section>

      <section className="tt-section">
        <div className="tt-section-head">
          <div>
            <p className="tt-muted">{formatAed(featured[0]?.priceFils || 0)} and up</p>
            <h2>Best of the tribe</h2>
          </div>
          <Link to="/shop/c/all">Shop all</Link>
        </div>
        <div className="tt-grid">
          {featured.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section className="tt-section">
        <div className="tt-trust">
          <article>
            <h3>UAE delivery</h3>
            <p className="tt-muted">2–5 working days. Free over AED 150.</p>
          </article>
          <article>
            <h3>Stripe checkout</h3>
            <p className="tt-muted">Cards and wallets, hosted by Stripe. We never see your card number.</p>
          </article>
          <article>
            <h3>Easy returns</h3>
            <p className="tt-muted">14 days on unworn tees with tags on.</p>
          </article>
          <article>
            <h3>RR Threads QC</h3>
            <p className="tt-muted">Printed and checked on the same floor as our uniforms.</p>
          </article>
        </div>
      </section>
    </>
  )
}
