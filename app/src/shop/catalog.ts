export type CategoryId = 'christian' | 'one-liners' | 'minimalist' | 'secular'

export type ProductBadge = 'new' | 'sale' | 'bestseller'

export type PrintSpec =
  | { kind: 'stack'; lines: string[] }
  | { kind: 'script'; text: string; sub?: string }
  | { kind: 'verse'; text: string; ref: string }
  | { kind: 'mark'; mark: 'cross' | 'dot' | 'line' | 'circle' | 'pin' | 'sun' | 'wave'; caption?: string }
  | { kind: 'lockup'; over: string; under: string }
  | { kind: 'blank' }

export type Colorway = {
  id: string
  name: string
  hex: string
}

export type ShopProduct = {
  id: string
  slug: string
  sku: string
  name: string
  category: CategoryId
  tagline: string
  description: string
  priceFils: number
  compareAtFils?: number
  colorIds: string[]
  defaultColor: string
  rating: number
  reviewCount: number
  badges: ProductBadge[]
  print: PrintSpec
}

export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const
export type SizeId = (typeof SIZES)[number]

export const COLORS: Record<string, Colorway> = {
  black: { id: 'black', name: 'Black', hex: '#161616' },
  white: { id: 'white', name: 'Bone', hex: '#f3eee4' },
  sand: { id: 'sand', name: 'Sand', hex: '#cbb79a' },
  navy: { id: 'navy', name: 'Navy', hex: '#1c2a4a' },
  olive: { id: 'olive', name: 'Olive', hex: '#4a5340' },
  charcoal: { id: 'charcoal', name: 'Charcoal', hex: '#3a3a3c' },
  burgundy: { id: 'burgundy', name: 'Burgundy', hex: '#6b2b32' },
  cream: { id: 'cream', name: 'Cream', hex: '#e8dcc8' },
}

export const CATEGORIES: { id: CategoryId; label: string; lede: string; nav: string }[] = [
  {
    id: 'christian',
    label: 'Christian',
    nav: 'Christian',
    lede: 'Quiet faith on a clean tee. Verses, lockups, and marks that wear through the week.',
  },
  {
    id: 'one-liners',
    label: 'One-liners',
    nav: 'One-liners',
    lede: 'One sentence. Worn loud or barely there — the line you keep coming back to.',
  },
  {
    id: 'minimalist',
    label: 'Minimalist',
    nav: 'Minimalist',
    lede: 'Marks, not slogans. Negative space, a single line, a dot that holds the room.',
  },
  {
    id: 'secular',
    label: 'Secular',
    nav: 'Secular',
    lede: 'Dubai nights, desert frequency, Friday brunch. City clothes with no caption required.',
  },
]

const CORE = ['black', 'white', 'sand']
const DARK = ['black', 'navy', 'charcoal']
const WARM = ['burgundy', 'cream', 'sand', 'black']
const EARTH = ['olive', 'sand', 'black', 'cream']

function p(
  partial: Omit<ShopProduct, 'badges'> & { badges?: ProductBadge[] },
): ShopProduct {
  return { badges: [], ...partial }
}

export const PRODUCTS: ShopProduct[] = [
  p({
    id: 'tt-chr-001',
    slug: 'faith-over-fear',
    sku: 'TT-CHR-001',
    name: 'Faith Over Fear',
    category: 'christian',
    tagline: 'The line that still holds.',
    description:
      'Stacked lockup on midweight cotton. Built for Sunday and for the rest of the week. Same cut we run for RR Threads crew tees — washed, set, and printed to last.',
    priceFils: 10900,
    colorIds: CORE,
    defaultColor: 'black',
    rating: 4.8,
    reviewCount: 214,
    badges: ['bestseller'],
    print: { kind: 'stack', lines: ['FAITH', 'OVER', 'FEAR'] },
  }),
  p({
    id: 'tt-chr-002',
    slug: 'blessed-not-lucky',
    sku: 'TT-CHR-002',
    name: 'Blessed, Not Lucky',
    category: 'christian',
    tagline: 'A correction, not a caption.',
    description:
      'Small chest lockup. Cream and black first. For people who mean it and do not need it shouty.',
    priceFils: 9900,
    colorIds: ['cream', 'black', 'navy'],
    defaultColor: 'cream',
    rating: 4.7,
    reviewCount: 128,
    print: { kind: 'lockup', over: 'BLESSED', under: 'NOT LUCKY' },
  }),
  p({
    id: 'tt-chr-003',
    slug: 'john-3-16',
    sku: 'TT-CHR-003',
    name: 'John 3:16',
    category: 'christian',
    tagline: 'The verse, set quietly.',
    description:
      'Script body with the reference underneath. No clip-art cross. Just type, placed where a pocket would be.',
    priceFils: 10900,
    colorIds: DARK,
    defaultColor: 'navy',
    rating: 4.9,
    reviewCount: 301,
    badges: ['bestseller'],
    print: { kind: 'verse', text: 'For God so loved the world', ref: 'John 3:16' },
  }),
  p({
    id: 'tt-chr-004',
    slug: 'walk-by-faith',
    sku: 'TT-CHR-004',
    name: 'Walk by Faith',
    category: 'christian',
    tagline: 'Not by sight.',
    description: 'Single-line chest print. Pairs with denim, a blazer, or nothing else.',
    priceFils: 8900,
    compareAtFils: 10900,
    colorIds: CORE,
    defaultColor: 'white',
    rating: 4.6,
    reviewCount: 87,
    badges: ['sale'],
    print: { kind: 'script', text: 'walk by faith', sub: 'not by sight' },
  }),
  p({
    id: 'tt-chr-005',
    slug: 'be-still',
    sku: 'TT-CHR-005',
    name: 'Be Still',
    category: 'christian',
    tagline: 'Psalm 46, distilled.',
    description: 'Two words. Extra negative space. The shirt does the quieting.',
    priceFils: 9900,
    colorIds: ['sand', 'black', 'olive'],
    defaultColor: 'sand',
    rating: 4.8,
    reviewCount: 156,
    print: { kind: 'script', text: 'be still' },
  }),
  p({
    id: 'tt-chr-006',
    slug: 'salt-and-light',
    sku: 'TT-CHR-006',
    name: 'Salt & Light',
    category: 'christian',
    tagline: 'A job description.',
    description: 'Ampersand lockup with a small sun mark. Soft hand feel, midweight 180gsm.',
    priceFils: 10900,
    colorIds: WARM,
    defaultColor: 'burgundy',
    rating: 4.5,
    reviewCount: 64,
    badges: ['new'],
    print: { kind: 'mark', mark: 'sun', caption: 'SALT & LIGHT' },
  }),
  p({
    id: 'tt-chr-007',
    slug: 'grace-upon-grace',
    sku: 'TT-CHR-007',
    name: 'Grace Upon Grace',
    category: 'christian',
    tagline: 'John 1:16, stacked.',
    description: 'Three-line stack. For the days that need a second helping.',
    priceFils: 11900,
    colorIds: DARK,
    defaultColor: 'black',
    rating: 4.7,
    reviewCount: 92,
    print: { kind: 'stack', lines: ['GRACE', 'UPON', 'GRACE'] },
  }),

  p({
    id: 'tt-one-001',
    slug: 'less-talk-more-coffee',
    sku: 'TT-ONE-001',
    name: 'Less Talk, More Coffee',
    category: 'one-liners',
    tagline: 'A morning policy.',
    description: 'One-liner in tight tracking. The office-to-brunch shirt.',
    priceFils: 8900,
    colorIds: CORE,
    defaultColor: 'black',
    rating: 4.6,
    reviewCount: 240,
    badges: ['bestseller'],
    print: { kind: 'stack', lines: ['LESS TALK', 'MORE COFFEE'] },
  }),
  p({
    id: 'tt-one-002',
    slug: 'main-character-energy',
    sku: 'TT-ONE-002',
    name: 'Main Character Energy',
    category: 'one-liners',
    tagline: 'Wear the plot.',
    description: 'Italic script across the chest. Not ironic unless you want it to be.',
    priceFils: 9900,
    colorIds: ['black', 'burgundy', 'cream'],
    defaultColor: 'black',
    rating: 4.4,
    reviewCount: 171,
    print: { kind: 'script', text: 'main character energy' },
  }),
  p({
    id: 'tt-one-003',
    slug: 'soft-life-loading',
    sku: 'TT-ONE-003',
    name: 'Soft Life Loading',
    category: 'one-liners',
    tagline: 'Still buffering, on purpose.',
    description: 'Lockup with an ellipsis. Light stone wash on bone; crisp on black.',
    priceFils: 8900,
    compareAtFils: 11900,
    colorIds: ['cream', 'sand', 'black'],
    defaultColor: 'cream',
    rating: 4.5,
    reviewCount: 133,
    badges: ['sale'],
    print: { kind: 'lockup', over: 'SOFT LIFE', under: 'LOADING…' },
  }),
  p({
    id: 'tt-one-004',
    slug: 'do-it-scared',
    sku: 'TT-ONE-004',
    name: 'Do It Scared',
    category: 'one-liners',
    tagline: 'Courage is a verb.',
    description: 'Small left-chest line. Works under a jacket. Works without one.',
    priceFils: 8900,
    colorIds: CORE,
    defaultColor: 'white',
    rating: 4.7,
    reviewCount: 98,
    print: { kind: 'script', text: 'do it scared' },
  }),
  p({
    id: 'tt-one-005',
    slug: 'monday-can-wait',
    sku: 'TT-ONE-005',
    name: 'Monday Can Wait',
    category: 'one-liners',
    tagline: 'A public service announcement.',
    description: 'Weekend uniform. Heavy ink, light mood.',
    priceFils: 9900,
    colorIds: ['navy', 'black', 'olive'],
    defaultColor: 'navy',
    rating: 4.3,
    reviewCount: 76,
    badges: ['new'],
    print: { kind: 'stack', lines: ['MONDAY', 'CAN WAIT'] },
  }),
  p({
    id: 'tt-one-006',
    slug: 'out-of-office',
    sku: 'TT-ONE-006',
    name: 'Out of Office Forever',
    category: 'one-liners',
    tagline: 'Auto-reply, but make it cotton.',
    description: 'The resignation letter you can wash at 30°.',
    priceFils: 10900,
    colorIds: EARTH,
    defaultColor: 'olive',
    rating: 4.6,
    reviewCount: 119,
    print: { kind: 'lockup', over: 'OUT OF OFFICE', under: 'FOREVER' },
  }),
  p({
    id: 'tt-one-007',
    slug: 'trust-the-process',
    sku: 'TT-ONE-007',
    name: 'Trust the Process',
    category: 'one-liners',
    tagline: 'Still true, even now.',
    description: 'Classic one-liner, reset in our type. No clip-art arrows.',
    priceFils: 8900,
    colorIds: DARK,
    defaultColor: 'charcoal',
    rating: 4.4,
    reviewCount: 205,
    print: { kind: 'script', text: 'trust the process' },
  }),

  p({
    id: 'tt-min-001',
    slug: 'the-dot',
    sku: 'TT-MIN-001',
    name: 'The Dot',
    category: 'minimalist',
    tagline: 'One mark. Enough.',
    description: 'A single dot, chest-placed. The shirt people ask about.',
    priceFils: 8900,
    colorIds: CORE,
    defaultColor: 'black',
    rating: 4.8,
    reviewCount: 188,
    badges: ['bestseller'],
    print: { kind: 'mark', mark: 'dot' },
  }),
  p({
    id: 'tt-min-002',
    slug: 'line-study',
    sku: 'TT-MIN-002',
    name: 'Line Study',
    category: 'minimalist',
    tagline: 'A horizon you can wear.',
    description: 'One horizontal rule. Architecture for a torso.',
    priceFils: 8900,
    colorIds: ['white', 'sand', 'navy'],
    defaultColor: 'white',
    rating: 4.5,
    reviewCount: 73,
    print: { kind: 'mark', mark: 'line' },
  }),
  p({
    id: 'tt-min-003',
    slug: 'circle-of-one',
    sku: 'TT-MIN-003',
    name: 'Circle of One',
    category: 'minimalist',
    tagline: 'Closed form, open week.',
    description: 'Hairline circle, no fill. Looks expensive because it is restrained.',
    priceFils: 9900,
    colorIds: DARK,
    defaultColor: 'black',
    rating: 4.6,
    reviewCount: 61,
    print: { kind: 'mark', mark: 'circle' },
  }),
  p({
    id: 'tt-min-004',
    slug: 'negative-space',
    sku: 'TT-MIN-004',
    name: 'Negative Space',
    category: 'minimalist',
    tagline: 'The print is the gap.',
    description: 'Tiny caption only. Most of the shirt is the point.',
    priceFils: 7900,
    compareAtFils: 9900,
    colorIds: ['cream', 'white', 'sand'],
    defaultColor: 'cream',
    rating: 4.2,
    reviewCount: 44,
    badges: ['sale'],
    print: { kind: 'mark', mark: 'dot', caption: 'NEG SPACE' },
  }),
  p({
    id: 'tt-min-005',
    slug: 'untitled-07',
    sku: 'TT-MIN-005',
    name: 'Untitled No. 7',
    category: 'minimalist',
    tagline: 'Gallery wall, Tuesday.',
    description: 'Catalog numbering as the whole design. For people who already own the loud shirts.',
    priceFils: 10900,
    colorIds: ['black', 'white', 'olive'],
    defaultColor: 'black',
    rating: 4.7,
    reviewCount: 39,
    badges: ['new'],
    print: { kind: 'lockup', over: 'UNTITLED', under: 'NO. 07' },
  }),
  p({
    id: 'tt-min-006',
    slug: 'bare',
    sku: 'TT-MIN-006',
    name: 'Bare',
    category: 'minimalist',
    tagline: 'No print. On purpose.',
    description:
      'Our blank. Same cotton, same cut, no ink. The tribe mark sits inside the neck only.',
    priceFils: 7900,
    colorIds: ['black', 'white', 'sand', 'navy', 'olive', 'cream'],
    defaultColor: 'white',
    rating: 4.9,
    reviewCount: 412,
    badges: ['bestseller'],
    print: { kind: 'blank' },
  }),

  p({
    id: 'tt-sec-001',
    slug: 'dubai-nights',
    sku: 'TT-SEC-001',
    name: 'Dubai Nights',
    category: 'secular',
    tagline: 'The city after the heat breaks.',
    description: 'Stacked city lockup. For the drive, the Corniche, the late table.',
    priceFils: 10900,
    colorIds: DARK,
    defaultColor: 'black',
    rating: 4.7,
    reviewCount: 256,
    badges: ['bestseller'],
    print: { kind: 'stack', lines: ['DUBAI', 'NIGHTS'] },
  }),
  p({
    id: 'tt-sec-002',
    slug: '25-north',
    sku: 'TT-SEC-002',
    name: '25.2048° N',
    category: 'secular',
    tagline: 'A pin, not a postcard.',
    description: 'Coordinates for Dubai, with a small pin mark. Quiet flex for people who live here.',
    priceFils: 9900,
    colorIds: ['navy', 'sand', 'black'],
    defaultColor: 'navy',
    rating: 4.6,
    reviewCount: 141,
    print: { kind: 'mark', mark: 'pin', caption: '25.2048° N' },
  }),
  p({
    id: 'tt-sec-003',
    slug: 'desert-frequency',
    sku: 'TT-SEC-003',
    name: 'Desert Frequency',
    category: 'secular',
    tagline: 'Tune to the dunes.',
    description: 'Wave mark and a two-word caption. Sand and olive first.',
    priceFils: 9900,
    colorIds: EARTH,
    defaultColor: 'sand',
    rating: 4.5,
    reviewCount: 88,
    print: { kind: 'mark', mark: 'wave', caption: 'DESERT FREQUENCY' },
  }),
  p({
    id: 'tt-sec-004',
    slug: 'friday-brunch-club',
    sku: 'TT-SEC-004',
    name: 'Friday Brunch Club',
    category: 'secular',
    tagline: 'A UAE public holiday, privately held.',
    description: 'The unofficial uniform. Pairs with sunglasses you will not take off indoors.',
    priceFils: 10900,
    compareAtFils: 12900,
    colorIds: WARM,
    defaultColor: 'cream',
    rating: 4.4,
    reviewCount: 167,
    badges: ['sale'],
    print: { kind: 'lockup', over: 'FRIDAY', under: 'BRUNCH CLUB' },
  }),
  p({
    id: 'tt-sec-005',
    slug: 'no-caption-needed',
    sku: 'TT-SEC-005',
    name: 'No Caption Needed',
    category: 'secular',
    tagline: 'The bio, but shorter.',
    description: 'Meta on purpose. Wear it to the thing you will not post.',
    priceFils: 8900,
    colorIds: CORE,
    defaultColor: 'black',
    rating: 4.3,
    reviewCount: 95,
    print: { kind: 'script', text: 'no caption needed' },
  }),
  p({
    id: 'tt-sec-006',
    slug: 'city-limits',
    sku: 'TT-SEC-006',
    name: 'City Limits',
    category: 'secular',
    tagline: 'Past the last exit.',
    description: 'A line and a caption. For the drive out of town and the drive back in.',
    priceFils: 9900,
    colorIds: ['charcoal', 'black', 'olive'],
    defaultColor: 'charcoal',
    rating: 4.5,
    reviewCount: 58,
    badges: ['new'],
    print: { kind: 'mark', mark: 'line', caption: 'CITY LIMITS' },
  }),
  p({
    id: 'tt-sec-007',
    slug: 'gulf-stream',
    sku: 'TT-SEC-007',
    name: 'Gulf Stream',
    category: 'secular',
    tagline: 'Current, not costume.',
    description: 'Wave mark on navy. Named for the water, not the jumper.',
    priceFils: 11900,
    colorIds: ['navy', 'black', 'white'],
    defaultColor: 'navy',
    rating: 4.6,
    reviewCount: 47,
    print: { kind: 'mark', mark: 'wave', caption: 'GULF STREAM' },
  }),
  p({
    id: 'tt-sec-008',
    slug: 'after-hours',
    sku: 'TT-SEC-008',
    name: 'After Hours',
    category: 'secular',
    tagline: 'When the district changes key.',
    description: 'Stacked night lockup. Dark inks on darker cotton.',
    priceFils: 10900,
    colorIds: DARK,
    defaultColor: 'black',
    rating: 4.8,
    reviewCount: 112,
    print: { kind: 'stack', lines: ['AFTER', 'HOURS'] },
  }),
]

export const PRODUCT_BY_ID = new Map(PRODUCTS.map((product) => [product.id, product]))
export const PRODUCT_BY_SLUG = new Map(PRODUCTS.map((product) => [product.slug, product]))

export function productById(id: string): ShopProduct | undefined {
  return PRODUCT_BY_ID.get(id)
}

export function productBySlug(slug: string): ShopProduct | undefined {
  return PRODUCT_BY_SLUG.get(slug)
}

export function categoryById(id: string | undefined): (typeof CATEGORIES)[number] | undefined {
  return CATEGORIES.find((category) => category.id === id)
}

export function colorsFor(product: ShopProduct): Colorway[] {
  return product.colorIds.map((id) => COLORS[id]).filter(Boolean)
}

export function isLightHex(hex: string): boolean {
  const n = hex.replace('#', '')
  if (n.length < 6) return false
  const r = parseInt(n.slice(0, 2), 16)
  const g = parseInt(n.slice(2, 4), 16)
  const b = parseInt(n.slice(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 155
}

export type SortId = 'featured' | 'price-asc' | 'price-desc' | 'rating' | 'newest'

export type ProductFilters = {
  category?: CategoryId
  query?: string
  colors?: string[]
  maxFils?: number
  minFils?: number
  sale?: boolean
  sort?: SortId
}

export function filterProducts(filters: ProductFilters = {}): ShopProduct[] {
  const q = (filters.query || '').trim().toLowerCase()
  let list = PRODUCTS.filter((product) => {
    if (filters.category && product.category !== filters.category) return false
    if (filters.sale && !product.compareAtFils && !product.badges.includes('sale')) return false
    if (filters.colors?.length && !filters.colors.some((c) => product.colorIds.includes(c))) return false
    if (filters.minFils != null && product.priceFils < filters.minFils) return false
    if (filters.maxFils != null && product.priceFils > filters.maxFils) return false
    if (q) {
      const hay = `${product.name} ${product.tagline} ${product.description} ${product.category} ${product.sku}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  const sort = filters.sort || 'featured'
  list = [...list].sort((a, b) => {
    if (sort === 'price-asc') return a.priceFils - b.priceFils
    if (sort === 'price-desc') return b.priceFils - a.priceFils
    if (sort === 'rating') return b.rating - a.rating || b.reviewCount - a.reviewCount
    if (sort === 'newest') {
      const an = a.badges.includes('new') ? 1 : 0
      const bn = b.badges.includes('new') ? 1 : 0
      return bn - an || b.reviewCount - a.reviewCount
    }
    const score = (p: ShopProduct) =>
      (p.badges.includes('bestseller') ? 4 : 0) + (p.badges.includes('new') ? 2 : 0) + p.rating
    return score(b) - score(a)
  })

  return list
}

export function relatedProducts(product: ShopProduct, limit = 4): ShopProduct[] {
  const same = PRODUCTS.filter((p) => p.category === product.category && p.id !== product.id)
  const rest = PRODUCTS.filter((p) => p.category !== product.category && p.id !== product.id)
  return [...same, ...rest].slice(0, limit)
}

export function featuredProducts(limit = 8): ShopProduct[] {
  return filterProducts({ sort: 'featured' }).slice(0, limit)
}

export function saleProducts(limit = 6): ShopProduct[] {
  return PRODUCTS.filter((p) => p.compareAtFils).slice(0, limit)
}

export function newProducts(limit = 6): ShopProduct[] {
  return PRODUCTS.filter((p) => p.badges.includes('new')).concat(PRODUCTS).slice(0, limit)
}

export function nextDropEnd(now = new Date()): Date {
  const d = new Date(now)
  const day = d.getUTCDay()
  const add = (7 - day) % 7 || 7
  d.setUTCDate(d.getUTCDate() + add)
  d.setUTCHours(17, 0, 0, 0)
  return d
}
