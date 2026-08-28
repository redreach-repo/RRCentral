import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import Seo from '../../site/components/Seo'
import { COLORS, SIZES, productBySlug, relatedProducts } from '../catalog'
import { formatAed, filsUntilFreeShipping } from '../format'
import { startCheckout } from '../startCheckout'
import { useShop } from '../ShopContext'
import ProductCard, { Stars } from '../components/ProductCard'
import TeeMockup from '../components/TeeMockup'

export default function ProductPage() {
  const { slug } = useParams()
  const product = slug ? productBySlug(slug) : undefined
  const { addToBag, toggleWish, hasWish } = useShop()
  const [colorId, setColorId] = useState(product?.defaultColor || 'black')
  const [size, setSize] = useState('M')
  const [qty, setQty] = useState(1)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!product) return
    setColorId(product.defaultColor)
    setSize('M')
    setQty(1)
    setError('')
  }, [product])

  const related = useMemo(() => (product ? relatedProducts(product) : []), [product])

  if (!product) return <Navigate to="/shop/c/all" replace />

  const selected = product
  const color = COLORS[colorId] || COLORS[selected.defaultColor]
  const remaining = filsUntilFreeShipping(selected.priceFils * qty)

  async function buyNow() {
    setError('')
    setPending(true)
    try {
      await startCheckout([{ productId: selected.id, colorId, size, qty }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed')
      setPending(false)
    }
  }

  return (
    <div className="tt-pdp">
      <Seo
        title={`${product.name} | Tee Tribe`}
        description={product.description}
        path={`/shop/p/${product.slug}`}
      />
      <div className="tt-pdp-media">
        <TeeMockup product={product} colorId={colorId} />
      </div>
      <div className="tt-pdp-copy">
        <div className="tt-crumb">
          <Link to="/shop">Tee Tribe</Link>
          {' / '}
          <Link to={`/shop/c/${product.category}`}>{product.category}</Link>
        </div>
        <p className="tt-muted" style={{ letterSpacing: '0.16em', textTransform: 'uppercase', fontSize: 11 }}>
          {product.sku}
        </p>
        <h1>{product.name}</h1>
        <Stars rating={product.rating} count={product.reviewCount} />
        <div className="tt-price" style={{ fontSize: 22, margin: '12px 0 8px' }}>
          <span>{formatAed(product.priceFils)}</span>
          {product.compareAtFils ? <s>{formatAed(product.compareAtFils)}</s> : null}
        </div>
        <p className="tt-muted">{product.description}</p>

        <p style={{ marginTop: 18, fontWeight: 700 }}>Colour: {color?.name}</p>
        <div className="tt-swatches">
          {product.colorIds.map((id) => (
            <button
              key={id}
              type="button"
              className={`tt-swatch ${id === colorId ? 'on' : ''}`}
              style={{ background: COLORS[id]?.hex }}
              aria-label={COLORS[id]?.name}
              onClick={() => setColorId(id)}
            />
          ))}
        </div>

        <p style={{ fontWeight: 700 }}>Size: {size}</p>
        <div className="tt-sizes">
          {SIZES.map((option) => (
            <button
              key={option}
              type="button"
              className={`tt-size ${option === size ? 'on' : ''}`}
              onClick={() => setSize(option)}
            >
              {option}
            </button>
          ))}
        </div>

        <p style={{ fontWeight: 700 }}>Quantity</p>
        <div className="tt-qty">
          <button type="button" onClick={() => setQty((n) => Math.max(1, n - 1))}>
            −
          </button>
          <span>{qty}</span>
          <button type="button" onClick={() => setQty((n) => Math.min(12, n + 1))}>
            +
          </button>
        </div>

        {error ? <p className="tt-note">{error}</p> : null}
        <div className="tt-pdp-actions">
          <button
            type="button"
            className="tt-btn tt-btn-dark"
            onClick={() => addToBag({ productId: product.id, colorId, size, qty })}
          >
            Add to bag
          </button>
          <button type="button" className="tt-btn tt-btn-ghost" disabled={pending} onClick={() => void buyNow()}>
            {pending ? 'Redirecting…' : 'Buy now with Stripe'}
          </button>
        </div>
        <button type="button" className="tt-btn tt-btn-ghost" onClick={() => toggleWish(product.id)}>
          {hasWish(product.id) ? 'Saved to wishlist' : 'Add to wishlist'}
        </button>

        <div className="tt-ship" style={{ marginTop: 18 }}>
          Get it in 2–5 working days across the UAE.
          {remaining > 0
            ? ` Add ${formatAed(remaining)} for free delivery.`
            : ' Free delivery on this bag.'}
        </div>
        <div className="tt-ship">Pay with Stripe. Card details stay on Stripe — never on this site.</div>

        <section style={{ marginTop: 28 }}>
          <h2 className="tt-section-head" style={{ display: 'block', fontFamily: 'Syne, sans-serif' }}>
            You may also like
          </h2>
          <div className="tt-grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 12 }}>
            {related.slice(0, 2).map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
