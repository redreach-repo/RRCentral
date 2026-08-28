import { Link } from 'react-router-dom'
import Seo from '../../site/components/Seo'
import { productById } from '../catalog'
import { useShop } from '../ShopContext'
import ProductCard from '../components/ProductCard'

export default function WishlistPage() {
  const { wishlist } = useShop()
  const products = wishlist.map(productById).filter((product): product is NonNullable<typeof product> => Boolean(product))

  return (
    <div className="tt-section">
      <Seo title="Wishlist | Tee Tribe" description="Saved Tee Tribe shirts." path="/shop/wishlist" />
      <div className="tt-section-head">
        <h2>Wishlist</h2>
        <p className="tt-muted">{products.length} saved</p>
      </div>
      {products.length === 0 ? (
        <div className="tt-empty">
          <h1>No saves yet.</h1>
          <p className="tt-muted">Tap the heart on a tee to keep it here.</p>
          <Link to="/shop/c/all" className="tt-btn tt-btn-dark" style={{ marginTop: 16 }}>
            Browse tees
          </Link>
        </div>
      ) : (
        <div className="tt-grid">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  )
}
