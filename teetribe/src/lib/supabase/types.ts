export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      admins: { Row: { email: string; created_at: string }; Insert: { email: string }; Update: Partial<{ email: string }> }
      collections: {
        Row: { id: string; slug: string; name: string; description: string; hero_tone: string; is_active: boolean; sort_order: number; created_at: string }
        Insert: Partial<Database['public']['Tables']['collections']['Row']> & { id: string; slug: string; name: string }
        Update: Partial<Database['public']['Tables']['collections']['Row']>
      }
      products: {
        Row: {
          id: string; slug: string; name: string; collection_slug: string; type: string; description: string
          price_fils: number; compare_at_fils: number | null; fabric_gsm: number | null; fit_note: string
          tags: string[]; is_drop: boolean; drop_closes_at: string | null; is_active: boolean; best_seller: boolean; created_at: string
        }
        Insert: Partial<Database['public']['Tables']['products']['Row']> & { id: string; slug: string; name: string; collection_slug: string; type: string; price_fils: number }
        Update: Partial<Database['public']['Tables']['products']['Row']>
      }
      product_variants: {
        Row: { id: string; product_id: string; sku: string; size: string; color: string; color_hex: string; stock: number; created_at: string }
        Insert: Partial<Database['public']['Tables']['product_variants']['Row']> & { id: string; product_id: string; sku: string; size: string; color: string; color_hex: string }
        Update: Partial<Database['public']['Tables']['product_variants']['Row']>
      }
      product_images: {
        Row: { id: string; product_id: string; url: string; alt: string; view: string; sort_order: number }
        Insert: Partial<Database['public']['Tables']['product_images']['Row']> & { id: string; product_id: string; url: string; view: string }
        Update: Partial<Database['public']['Tables']['product_images']['Row']>
      }
      customers: {
        Row: { id: string; email: string; name: string | null; phone: string | null; created_at: string }
        Insert: { email: string; name?: string | null; phone?: string | null }
        Update: Partial<Database['public']['Tables']['customers']['Row']>
      }
      orders: {
        Row: {
          id: string; customer_id: string | null; email: string; name: string; phone: string; emirate: string; address: string
          subtotal_fils: number; delivery_fils: number; total_fils: number; status: string
          stripe_session_id: string | null; stripe_event_id: string | null; paid_at: string | null; created_at: string
        }
        Insert: Partial<Database['public']['Tables']['orders']['Row']> & { id: string; email: string; name: string; phone: string; emirate: string; address: string; subtotal_fils: number; delivery_fils: number; total_fils: number }
        Update: Partial<Database['public']['Tables']['orders']['Row']>
      }
      order_items: {
        Row: { id: string; order_id: string; product_id: string; variant_id: string; product_name: string; variant_label: string; qty: number; price_fils: number }
        Insert: { order_id: string; product_id: string; variant_id: string; product_name: string; variant_label: string; qty: number; price_fils: number }
        Update: Partial<Database['public']['Tables']['order_items']['Row']>
      }
      members: {
        Row: { id: string; email: string; name: string | null; discount_code: string; stripe_coupon_id: string | null; used_discount: boolean; created_at: string }
        Insert: { email: string; name?: string | null; discount_code: string; stripe_coupon_id?: string | null }
        Update: Partial<Database['public']['Tables']['members']['Row']>
      }
      drop_waitlist: {
        Row: { id: string; email: string; product_id: string | null; product_slug: string | null; created_at: string }
        Insert: { email: string; product_id?: string | null; product_slug?: string | null }
        Update: Partial<Database['public']['Tables']['drop_waitlist']['Row']>
      }
      quote_requests: {
        Row: { id: string; name: string; email: string; phone: string | null; company: string | null; quantity: number | null; product_interest: string | null; notes: string | null; status: string; created_at: string }
        Insert: { id: string; name: string; email: string; phone?: string | null; company?: string | null; quantity?: number | null; product_interest?: string | null; notes?: string | null; status?: string }
        Update: Partial<Database['public']['Tables']['quote_requests']['Row']>
      }
      discount_codes: {
        Row: { id: string; code: string; description: string | null; percent_off: number | null; amount_off_fils: number | null; stripe_coupon_id: string | null; member_id: string | null; is_active: boolean; expires_at: string | null; created_at: string }
        Insert: { code: string; description?: string | null; percent_off?: number | null; amount_off_fils?: number | null; stripe_coupon_id?: string | null; member_id?: string | null; is_active?: boolean }
        Update: Partial<Database['public']['Tables']['discount_codes']['Row']>
      }
    }
    Functions: {
      tt_decrement_stock: { Args: { p_variant_id: string; p_qty: number }; Returns: boolean }
      tt_is_admin: { Args: Record<string, never>; Returns: boolean }
    }
  }
}
