import { Link, useSearchParams } from 'react-router-dom'
import Seo from '../../site/components/Seo'
import { useShop } from '../ShopContext'
import { useEffect } from 'react'

export default function OrderSuccessPage() {
  const [params] = useSearchParams()
  const demo = params.get('demo') === '1'
  const sessionId = params.get('session_id')
  const { clearCart } = useShop()

  useEffect(() => {
    clearCart()
  }, [clearCart])

  return (
    <div className="tt-order">
      <Seo title="Order confirmed | Tee Tribe" description="Thank you for your Tee Tribe order." path="/shop/order/success" />
      <p className="tt-muted" style={{ letterSpacing: '0.16em', textTransform: 'uppercase', fontSize: 11 }}>
        {demo ? 'Demo order' : 'Paid with Stripe'}
      </p>
      <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 42, margin: '8px 0 12px' }}>You’re in the tribe.</h1>
      <p className="tt-muted" style={{ maxWidth: 520 }}>
        {demo
          ? 'Stripe keys are not configured on this host, so this was a demo checkout. Add STRIPE_SECRET_KEY locally (or VITE_CHECKOUT_API_URL to a Checkout function) to take live test payments.'
          : 'Stripe has the payment. We will pack the tee from the RR Threads floor in Dubai.'}
      </p>
      {sessionId ? (
        <p className="tt-muted" style={{ marginTop: 8, fontSize: 12 }}>
          Reference {sessionId}
        </p>
      ) : null}
      {demo ? (
        <p className="tt-note">
          Demo mode — no card was charged. Use Stripe test keys on `npm run dev` to open hosted Checkout.
        </p>
      ) : null}
      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <Link to="/shop" className="tt-btn tt-btn-dark">
          Back to the shop
        </Link>
        <Link to="/threads" className="tt-btn tt-btn-ghost">
          RR Threads uniforms
        </Link>
      </div>
    </div>
  )
}
