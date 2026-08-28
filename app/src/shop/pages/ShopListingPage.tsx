import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import Seo from '../../site/components/Seo'
import {
  CATEGORIES,
  COLORS,
  categoryById,
  filterProducts,
  type CategoryId,
  type SortId,
} from '../catalog'
import { parseSearchQuery } from '../format'
import ProductCard from '../components/ProductCard'

const COLOR_OPTIONS = Object.values(COLORS)
const PRICE_BANDS = [
  { id: 'any', label: 'Any price', min: undefined, max: undefined },
  { id: 'under90', label: 'Under AED 90', min: undefined, max: 8900 },
  { id: '90-110', label: 'AED 90 – 110', min: 9000, max: 11000 },
  { id: 'over110', label: 'AED 110+', min: 11100, max: undefined },
] as const

export default function ShopListingPage({ saleOnly = false }: { saleOnly?: boolean }) {
  const { category: categoryParam } = useParams()
  const [params, setParams] = useSearchParams()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const query = parseSearchQuery(params.get('q'))
  const category = categoryParam && categoryParam !== 'all' ? categoryById(categoryParam)?.id : undefined
  const sort = (params.get('sort') as SortId) || 'featured'
  const selectedColors = (params.get('color') || '').split(',').filter(Boolean)
  const priceId = params.get('price') || 'any'
  const price = PRICE_BANDS.find((band) => band.id === priceId) || PRICE_BANDS[0]
  const meta = categoryById(categoryParam || '')

  const products = useMemo(
    () =>
      filterProducts({
        category: category as CategoryId | undefined,
        query,
        colors: selectedColors,
        minFils: price.min,
        maxFils: price.max,
        sale: saleOnly,
        sort,
      }),
    [category, query, selectedColors, price.min, price.max, saleOnly, sort],
  )

  function update(next: Record<string, string | null>) {
    const copy = new URLSearchParams(params)
    for (const [key, value] of Object.entries(next)) {
      if (!value) copy.delete(key)
      else copy.set(key, value)
    }
    setParams(copy)
  }

  function toggleColor(id: string) {
    const set = new Set(selectedColors)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    update({ color: [...set].join(',') || null })
  }

  const title = saleOnly
    ? 'Sale'
    : query
      ? `Results for “${query}”`
      : meta?.label || 'All tees'
  const lede = saleOnly
    ? 'Markdowns on one-liners, faith tees and blanks.'
    : meta?.lede || 'Every Tee Tribe collection in one grid. Filter like Namshi, search like Amazon.'

  return (
    <div className="tt-listing">
      <Seo title={`${title} | Tee Tribe`} description={lede} path={saleOnly ? '/shop/sale' : category ? `/shop/c/${category}` : '/shop/c/all'} />
      <aside className={`tt-filters ${filtersOpen ? 'open' : ''}`}>
        <h2>Filter</h2>
        <div className="tt-filter-group">
          <h3>Collection</h3>
          <label className="tt-check">
            <input type="radio" name="cat" checked={!category && !saleOnly} onChange={() => undefined} readOnly />
            <Link to="/shop/c/all">All tees</Link>
          </label>
          {CATEGORIES.map((item) => (
            <label key={item.id} className="tt-check">
              <input type="radio" name="cat" checked={category === item.id} onChange={() => undefined} readOnly />
              <Link to={`/shop/c/${item.id}`}>{item.label}</Link>
            </label>
          ))}
        </div>
        <div className="tt-filter-group">
          <h3>Colour</h3>
          {COLOR_OPTIONS.map((color) => (
            <label key={color.id} className="tt-check">
              <input type="checkbox" checked={selectedColors.includes(color.id)} onChange={() => toggleColor(color.id)} />
              {color.name}
            </label>
          ))}
        </div>
        <div className="tt-filter-group">
          <h3>Price</h3>
          {PRICE_BANDS.map((band) => (
            <label key={band.id} className="tt-check">
              <input
                type="radio"
                name="price"
                checked={priceId === band.id}
                onChange={() => update({ price: band.id === 'any' ? null : band.id })}
              />
              {band.label}
            </label>
          ))}
        </div>
      </aside>
      <div>
        <div className="tt-crumb">
          <Link to="/shop">Tee Tribe</Link>
          {category ? ` / ${meta?.label}` : saleOnly ? ' / Sale' : query ? ' / Search' : ' / All tees'}
        </div>
        <div className="tt-listing-head">
          <div>
            <h1>{title}</h1>
            <p className="tt-muted">
              {products.length} {products.length === 1 ? 'style' : 'styles'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="tt-btn tt-btn-ghost tt-filter-toggle" onClick={() => setFiltersOpen((v) => !v)}>
              Filters
            </button>
            <select
              className="tt-select"
              value={sort}
              onChange={(e) => update({ sort: e.target.value === 'featured' ? null : e.target.value })}
              aria-label="Sort"
            >
              <option value="featured">Featured</option>
              <option value="newest">New in</option>
              <option value="rating">Top rated</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
            </select>
          </div>
        </div>
        {products.length === 0 ? (
          <div className="tt-empty">
            <h1>No tees match.</h1>
            <p className="tt-muted">Clear a filter or try another word.</p>
            <Link to="/shop/c/all" className="tt-btn tt-btn-dark" style={{ marginTop: 16 }}>
              Reset
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
    </div>
  )
}
