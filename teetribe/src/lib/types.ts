export type CollectionSlug =
  | 'uae'
  | 'faith'
  | 'culture'
  | 'essentials'
  | 'drops'
  | 'tribe-made'

export type ProductType =
  | 'oversized-tee'
  | 'graphic-tee'
  | 'plain-tee'
  | 'hoodie'
  | 'quarter-zip'
  | 'dad-cap'
  | 'tote'
  | 'socks'
  | 'bag-tag'
  | 'keychain'
  | 'sticker'
  | 'camp-collar'
  | 'shorts'
  | 'joggers'

export type Size = 'XS' | 'S' | 'M' | 'L' | 'XL' | '2XL' | '3XL' | 'ONE'

export type Collection = {
  id: string
  slug: CollectionSlug
  name: string
  description: string
  heroTone: string
}

export type ProductImage = {
  id: string
  url: string
  alt: string
  view: 'front' | 'back' | 'lifestyle'
  sort: number
}

export type ProductVariant = {
  id: string
  sku: string
  size: Size
  color: string
  colorHex: string
  stock: number
}

export type Product = {
  id: string
  name: string
  slug: string
  collection: CollectionSlug
  type: ProductType
  description: string
  priceFils: number
  compareAtFils: number | null
  images: ProductImage[]
  variants: ProductVariant[]
  fabricGsm: number | null
  fitNote: string
  tags: string[]
  isDrop: boolean
  dropClosesAt: string | null
  isActive: boolean
  bestSeller?: boolean
}

export type CartLine = {
  variantId: string
  productId: string
  qty: number
}

export type Emirate =
  | 'Dubai'
  | 'Abu Dhabi'
  | 'Sharjah'
  | 'Ajman'
  | 'Umm Al Quwain'
  | 'Ras Al Khaimah'
  | 'Fujairah'

export const EMIRATES: Emirate[] = [
  'Dubai',
  'Abu Dhabi',
  'Sharjah',
  'Ajman',
  'Umm Al Quwain',
  'Ras Al Khaimah',
  'Fujairah',
]

export const SIZES: Size[] = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL']
