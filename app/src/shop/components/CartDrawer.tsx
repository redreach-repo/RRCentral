import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { useState } from 'react'
import { COLORS } from '../catalog'
import { cartTotals, lineKey } from '../cart'
import { formatAed } from '../format'
import { startCheckout } from '../startCheckout'
import { useShop } from '../ShopContext'
import TeeMockup from './TeeMockup'

export default function CartDrawer() {
  const { lines, drawerOpen, closeCart, setQty, remove } = useShop()
  const totals = cartTotals(lines)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  if (!drawerOpen) return null

  async function pay() {
    setError('')
    setPending(true)
    try {
      await startCheckout(lines)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout')
      setPending(false)
    }
  }

  return (
    <>
      <button type="button" className="tt-drawer-back" aria-label="Close bag" onClick={closeCart} />
      <aside className="tt-drawer" role="dialog" aria-label="Shopping bag">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Your bag ({totals.count})</h2>
          <button type="button" className="tt-icon-btn" onClick={closeCart} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="tt-drawer-lines">
          {totals.valid.length === 0 ? (
            <p className="tt-muted">Your bag is empty. Add a tee from the grid.</p>
          ) : (
            totals.valid.map((line) => (
              <div key={lineKey(line)} className="tt-cart-line">
                <TeeMockup product={line.product} colorId={line.colorId} />
                <div>
                  <strong>{line.product.name}</strong>
                  <p className="tt-muted">
                    {COLORS[line.colorId]?.name || line.colorId} · {line.size}
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
                  <button type="button" className="tt-muted" onClick={() => remove(lineKey(line))}>
                    Remove
                  </button>
                </div>
                <strong>{formatAed(line.lineFils)}</strong>
              </div>
            ))
          )}
        </div>
        <footer>
          <div className="tt-summary-row">
            <span>Subtotal</span>
            <span>{formatAed(totals.subtotalFils)}</span>
          </div>
          <div className="tt-summary-row">
            <span>Delivery</span>
            <span>{totals.shippingFils ? formatAed(totals.shippingFils) : 'Free'}</span>
          </div>
          {error ? <p className="tt-note">{error}</p> : null}
          <button type="button" className="tt-btn tt-btn-dark tt-btn-wide" disabled={!totals.count || pending} onClick={() => void pay()}>
            {pending ? 'Redirecting to Stripe…' : 'Checkout with Stripe'}
          </button>
          <Link to="/shop/cart" className="tt-btn tt-btn-ghost tt-btn-wide" onClick={closeCart} style={{ marginTop: 8 }}>
            View bag
          </Link>
        </footer>
      </aside>
    </>
  )
}
