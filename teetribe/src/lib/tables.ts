/** Tee Tribe tables live in Red Reach Central Supabase with tt_ prefix
 *  so they never clash with Central CRM `products` / other tables. */
export const TT = {
  collections: 'tt_collections',
  products: 'tt_products',
  variants: 'tt_product_variants',
  images: 'tt_product_images',
  customers: 'tt_customers',
  orders: 'tt_orders',
  orderItems: 'tt_order_items',
  members: 'tt_members',
  waitlist: 'tt_drop_waitlist',
  quotes: 'tt_quote_requests',
  discountCodes: 'tt_discount_codes',
} as const
