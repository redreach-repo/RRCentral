import { Link } from 'react-router-dom'
import { CATEGORIES } from '../catalog'

export default function ShopFooter() {
  return (
    <footer className="tt-footer">
      <div className="tt-footer-grid">
        <div>
          <div className="tt-logo">
            <strong>TEE TRIBE</strong>
            <span>A Red Reach label</span>
          </div>
          <p className="tt-muted" style={{ color: '#cfc6ba', marginTop: 12, maxWidth: 360 }}>
            Christian tees, one-liners, minimalist marks and secular city shirts. Cut and printed with the
            same QC as RR Threads uniforms, sold the way Namshi and SHEIN taught the Gulf to shop.
          </p>
        </div>
        <div>
          <h4>Shop</h4>
          {CATEGORIES.map((category) => (
            <Link key={category.id} to={`/shop/c/${category.id}`}>
              {category.label}
            </Link>
          ))}
          <Link to="/shop/sale">Sale</Link>
        </div>
        <div>
          <h4>Help</h4>
          <Link to="/shop/cart">Your bag</Link>
          <Link to="/shop/wishlist">Wishlist</Link>
          <p style={{ margin: '6px 0', color: '#cfc6ba', fontSize: 14 }}>UAE delivery 2–5 working days</p>
          <p style={{ margin: '6px 0', color: '#cfc6ba', fontSize: 14 }}>Free over AED 150</p>
          <p style={{ margin: '6px 0', color: '#cfc6ba', fontSize: 14 }}>Pay securely with Stripe</p>
        </div>
        <div>
          <h4>Red Reach</h4>
          <Link to="/">Red Reach home</Link>
          <Link to="/threads">RR Threads uniforms</Link>
          <Link to="/contact">Contact</Link>
          <a href="mailto:info@redreach.ae">info@redreach.ae</a>
        </div>
      </div>
      <div className="tt-footer-bottom">
        <span>© {new Date().getFullYear()} Tee Tribe · Red Reach Middle East FZE</span>
        <span>Dubai, U.A.E. · Payments by Stripe</span>
      </div>
    </footer>
  )
}
