import * as seed from '@/data/seed'
import { createAdminClient } from '@/lib/supabase/admin'
import { useMockData } from '@/lib/mock'
import type { Collection, CollectionSlug, Product, ProductImage, ProductVariant } from '@/lib/types'

type DbProduct = {
  id: string
  slug: string
  name: string
  collection_slug: string
  type: string
  description: string
  price_fils: number
  compare_at_fils: number | null
  fabric_gsm: number | null
  fit_note: string
  tags: string[]
  is_drop: boolean
  drop_closes_at: string | null
  is_active: boolean
  best_seller: boolean
  product_variants: Array<{
    id: string
    sku: string
    size: string
    color: string
    color_hex: string
    stock: number
  }>
  product_images: Array<{
    id: string
    url: string
    alt: string
    view: string
    sort_order: number
  }>
}

type DbCollection = {
  id: string
  slug: string
  name: string
  description: string
  hero_tone: string
}

function mapProduct(row: DbProduct): Product {
  const variants: ProductVariant[] = (row.product_variants || []).map((v) => ({
    id: v.id,
    sku: v.sku,
    size: v.size as ProductVariant['size'],
    color: v.color,
    colorHex: v.color_hex,
    stock: v.stock,
  }))

  const images: ProductImage[] = (row.product_images || [])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((img) => ({
      id: img.id,
      url: img.url,
      alt: img.alt,
      view: img.view as ProductImage['view'],
      sort: img.sort_order,
    }))

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    collection: row.collection_slug as CollectionSlug,
    type: row.type as Product['type'],
    description: row.description,
    priceFils: row.price_fils,
    compareAtFils: row.compare_at_fils,
    images,
    variants,
    fabricGsm: row.fabric_gsm,
    fitNote: row.fit_note,
    tags: row.tags || [],
    isDrop: row.is_drop,
    dropClosesAt: row.drop_closes_at,
    isActive: row.is_active,
    bestSeller: row.best_seller,
  }
}

function mapCollection(row: DbCollection): Collection {
  return {
    id: row.id,
    slug: row.slug as CollectionSlug,
    name: row.name,
    description: row.description,
    heroTone: row.hero_tone,
  }
}

async function fetchProductsFromDb(): Promise<Product[]> {
  const admin = createAdminClient()
  if (!admin) return seed.products

  const { data, error } = await admin
    .from('products')
    .select(`
      *,
      product_variants (*),
      product_images (*)
    `)
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  if (error || !data?.length) return seed.products
  return (data as DbProduct[]).map(mapProduct)
}

async function fetchCollectionsFromDb(): Promise<Collection[]> {
  const admin = createAdminClient()
  if (!admin) return seed.collections

  const { data, error } = await admin
    .from('collections')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error || !data?.length) return seed.collections
  return (data as DbCollection[]).map(mapCollection)
}

export async function getCollections(): Promise<Collection[]> {
  if (useMockData()) return seed.collections
  return fetchCollectionsFromDb()
}

export async function getAllProducts(): Promise<Product[]> {
  if (useMockData()) return seed.getAllProducts()
  const products = await fetchProductsFromDb()
  return products.filter((p) => p.isActive)
}

export async function getProduct(slugOrId: string): Promise<Product | undefined> {
  if (useMockData()) return seed.getProduct(slugOrId)
  const products = await fetchProductsFromDb()
  return products.find((p) => p.slug === slugOrId || p.id === slugOrId)
}

export async function getCollection(slug: CollectionSlug): Promise<Collection | undefined> {
  if (useMockData()) return seed.getCollection(slug)
  const collections = await fetchCollectionsFromDb()
  return collections.find((c) => c.slug === slug)
}

export async function getBestSellers(limit = 8): Promise<Product[]> {
  if (useMockData()) return seed.getBestSellers(limit)
  const products = await getAllProducts()
  return products.filter((p) => p.bestSeller).slice(0, limit)
}

export async function getActiveDrop(): Promise<Product | undefined> {
  if (useMockData()) return seed.getActiveDrop()
  const products = await getAllProducts()
  const now = Date.now()
  return products.find(
    (p) => p.isDrop && p.isActive && p.dropClosesAt && new Date(p.dropClosesAt).getTime() > now,
  )
}

export async function getProductsByCollection(slug: CollectionSlug): Promise<Product[]> {
  if (useMockData()) return seed.getProductsByCollection(slug)
  const products = await getAllProducts()
  return products.filter((p) => p.collection === slug)
}

export async function relatedProducts(product: Product, limit = 4): Promise<Product[]> {
  if (useMockData()) return seed.relatedProducts(product, limit)
  const products = await getAllProducts()
  return products
    .filter((p) => p.id !== product.id && (p.collection === product.collection || p.type === product.type))
    .slice(0, limit)
}

export function totalStock(product: Product): number {
  return product.variants.reduce((sum, v) => sum + v.stock, 0)
}

/** Sync lookup for client components — uses seed data only. */
export function getProductSync(slugOrId: string): Product | undefined {
  return seed.getProduct(slugOrId)
}

export function getAllProductsSync(): Product[] {
  return seed.getAllProducts()
}
