import { useState } from 'react'
import { Link } from 'react-router-dom'
import Seo from '../../site/components/Seo'
import { COLORS } from '../catalog'
import { cartTotals, lineKey } from '../cart'
import { formatAed, filsUntilFreeShipping } from '../format'
import { startCheckout } from '../startCheckout'
import { useShop } from '../ShopContext'
import TeeMockup from '../components/TeeMockup'

export default function CartPage() {
  const { lines, setQty, remove } = useShop()
  const totals = cartTotals(lines)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const remaining = filsUntilFreeShipping(totals.subtotalFils)

  async function pay() {
    setError('')
    setPending(true)
    try {
      await startCheckout(lines)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed')
      setPending(false)
    }
  }

  return (
    <div className="tt-cart-page">
      <Seo title="Your bag | Tee Tribe" description="Review your Tee Tribe bag and pay with Stripe." path="/shop/cart" />
      <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 36, marginBottom: 18 }}>Your bag</h1>
      {totals.valid.length === 0 ? (
        <div className="tt-empty">
          <h1>Nothing in here yet.</h1>
          <Link to="/shop/c/all" className="tt-btn tt-btn-dark" style={{ marginTop: 16 }}>
            Continue shopping
          </Link>
        </div>
      ) : (
        <div className="tt-cart-grid">
          <div>
            {totals.valid.map((line) => (
              <div key={lineKey(line)} className="tt-cart-line">
                <Link to={`/shop/p/${line.product.slug}`}>
                  <TeeMockup product={line.product} colorId={line.colorId} />
                </Link>
                <div>
                  <Link to={`/shop/p/${line.product.slug}`}>
                    <strong>{line.product.name}</strong>
                  </Link>
                  <p className="tt-muted">
                    {COLORS[line.colorId]?.name || line.colorId} · Size {line.size}
                  </p>
                  <div className="tt-qty">
                    <button type="button" onClick={() => setQty(lineKey(line), line.qty - 1)}>
                      −
                    </button>
                    <span>{line.qty}</span>
                    <button type="button" onClick={() => setQty(lineKey(line), line.qty + 1)}>
                      +
                    </button>
                  </div>
                  <button type="button" onClick={() => remove(lineKey(line))}>
                    Remove
                  </button>
                </div>
                <strong>{formatAed(line.lineFils)}</strong>
              </div>
            ))}
          </div>
          <aside className="tt-summary">
            <h2 style={{ fontFamily: 'Syne, sans-serif', marginBottom: 8 }}>Order summary</h2>
            <div className="tt-summary-row">
              <span>Subtotal</span>
              <span>{formatAed(totals.subtotalFils)}</span>
            </div>
            <div className="tt-summary-row">
              <span>Delivery</span>
              <span>{totals.shippingFils ? formatAed(totals.shippingFils) : 'Free'}</span>
            </div>
            {remaining > 0 ? (
              <p className="tt-muted">Add {formatAed(remaining)} for free UAE delivery.</p>
            ) : (
              <p className="tt-muted">Free UAE delivery unlocked.</p>
            )}
            <div className="tt-summary-row total">
              <span>Total</span>
              <span>{formatAed(totals.totalFils)}</span>
            </div>
            {error ? <p className="tt-note">{error}</p> : null}
            <button type="button" className="tt-btn tt-btn-dark tt-btn-wide" disabled={pending} onClick={() => void pay()}>
              {pending ? 'Redirecting to Stripe…' : 'Pay with Stripe'}
            </button>
            <p className="tt-muted" style={{ marginTop: 10 }}>
              Stripe collects payment, address and phone. Card data never hits Tee Tribe.
            </p>
          </aside>
        </div>
      )}
    </div>
  )
}
