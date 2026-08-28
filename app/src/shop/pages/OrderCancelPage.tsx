import { Link } from 'react-router-dom'
import Seo from '../../site/components/Seo'

export default function OrderCancelPage() {
  return (
    <div className="tt-order">
      <Seo title="Checkout cancelled | Tee Tribe" description="Stripe checkout was cancelled." path="/shop/order/cancel" />
      <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 42, marginBottom: 12 }}>Payment paused.</h1>
      <p className="tt-muted" style={{ maxWidth: 480 }}>
        Stripe sent you back without charging. Your bag is still here whenever you want to try again.
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <Link to="/shop/cart" className="tt-btn tt-btn-dark">
          Return to bag
        </Link>
        <Link to="/shop" className="tt-btn tt-btn-ghost">
          Keep shopping
        </Link>
      </div>
    </div>
  )
}
