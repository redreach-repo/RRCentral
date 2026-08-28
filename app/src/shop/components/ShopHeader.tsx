import { useState, type FormEvent } from 'react'
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router-dom'
import { Heart, Search, ShoppingBag } from 'lucide-react'
import { CATEGORIES } from '../catalog'
import { useShop } from '../ShopContext'

export default function ShopHeader() {
  const { count, wishlist, openCart } = useShop()
  const [params] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') || '')
  const navigate = useNavigate()

  function onSearch(event: FormEvent) {
    event.preventDefault()
    const q = query.trim()
    navigate(q ? `/shop/search?q=${encodeURIComponent(q)}` : '/shop/c/all')
  }

  const searchForm = (
    <form className="tt-search" onSubmit={onSearch} role="search">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search tees, verses, one-liners…"
        aria-label="Search Tee Tribe"
      />
      <button type="submit" aria-label="Search">
        <Search size={16} />
      </button>
    </form>
  )

  return (
    <header className="tt-header">
      <div className="tt-header-row">
        <Link to="/shop" className="tt-logo">
          <strong>TEE TRIBE</strong>
          <span>Wear your words</span>
        </Link>
        {searchForm}
        <div className="tt-header-actions">
          <Link to="/shop/wishlist" className="tt-icon-link" aria-label="Wishlist">
            <Heart size={18} />
            {wishlist.length > 0 ? <span className="tt-badge">{wishlist.length}</span> : null}
          </Link>
          <button type="button" className="tt-icon-btn" onClick={openCart} aria-label="Open bag">
            <ShoppingBag size={18} />
            {count > 0 ? <span className="tt-badge">{count}</span> : null}
          </button>
        </div>
      </div>
      <div className="tt-mobile-search">{searchForm}</div>
      <nav className="tt-cats" aria-label="Collections">
        <NavLink to="/shop" end>
          New in
        </NavLink>
        {CATEGORIES.map((category) => (
          <NavLink key={category.id} to={`/shop/c/${category.id}`}>
            {category.nav}
          </NavLink>
        ))}
        <NavLink to="/shop/sale">Sale</NavLink>
        <NavLink to="/shop/c/all">All tees</NavLink>
      </nav>
    </header>
  )
}
