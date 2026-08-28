import { Link } from 'react-router-dom'
import { Heart } from 'lucide-react'
import type { MouseEvent } from 'react'
import { COLORS, type ShopProduct } from '../catalog'
import { formatAed } from '../format'
import { useShop } from '../ShopContext'
import TeeMockup from './TeeMockup'

export function Stars({ rating, count }: { rating: number; count?: number }) {
  return (
    <div className="tt-stars">
      <b>{rating.toFixed(1)}</b>
      <span aria-hidden>{'★★★★★'.slice(0, Math.round(rating))}</span>
      {count != null ? <span>({count})</span> : null}
    </div>
  )
}

export default function ProductCard({ product }: { product: ShopProduct }) {
  const { hasWish, toggleWish } = useShop()
  const wished = hasWish(product.id)
  const badge = product.badges.includes('sale')
    ? 'sale'
    : product.badges.includes('new')
      ? 'new'
      : product.badges.includes('bestseller')
        ? 'bestseller'
        : null

  function onWish(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    toggleWish(product.id)
  }

  return (
    <article className="tt-card">
      <div className="tt-card-media">
        {badge ? <span className={`tt-pill ${badge === 'sale' ? 'sale' : ''}`}>{badge}</span> : null}
        <button type="button" className={`tt-wish ${wished ? 'on' : ''}`} onClick={onWish} aria-label="Wishlist">
          <Heart size={16} fill={wished ? 'currentColor' : 'none'} />
        </button>
        <Link to={`/shop/p/${product.slug}`} aria-label={product.name}>
          <TeeMockup product={product} />
          <TeeMockup product={product} side="back" className="tt-mock-back" />
        </Link>
      </div>
      <Link to={`/shop/p/${product.slug}`}>
        <h3>{product.name}</h3>
        <p className="tt-muted" style={{ fontSize: 13 }}>
          {product.tagline}
        </p>
        <Stars rating={product.rating} count={product.reviewCount} />
        <div className="tt-price">
          <span>{formatAed(product.priceFils)}</span>
          {product.compareAtFils ? <s>{formatAed(product.compareAtFils)}</s> : null}
        </div>
        <div className="tt-dots" aria-label="Colours">
          {product.colorIds.map((id) => (
            <i key={id} style={{ background: COLORS[id]?.hex }} title={COLORS[id]?.name} />
          ))}
        </div>
      </Link>
    </article>
  )
}
