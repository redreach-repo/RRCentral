-- =============================================================================
-- TEE TRIBE — full schema (paste into Supabase SQL Editor → Run)
-- =============================================================================
-- IMPORTANT: Run this on a NEW Supabase project for Tee Tribe only.
-- Do NOT run on Red Reach Central (that project already has a different
-- public.products table and will conflict).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Refuse to run on Red Reach Central / wrong database
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'products'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name = 'collection_slug'
  ) THEN
    RAISE EXCEPTION
      'Wrong database: public.products exists without collection_slug (looks like Red Reach Central). Create a NEW Supabase project named teetribe and paste this SQL there.';
  END IF;
END $$;

-- Clean re-run safe: drop Tee Tribe objects only (dependency order)
DROP POLICY IF EXISTS discount_codes_admin_all ON public.discount_codes;
DROP POLICY IF EXISTS quotes_admin_all ON public.quote_requests;
DROP POLICY IF EXISTS quotes_insert_public ON public.quote_requests;
DROP POLICY IF EXISTS waitlist_admin_read ON public.drop_waitlist;
DROP POLICY IF EXISTS waitlist_insert_public ON public.drop_waitlist;
DROP POLICY IF EXISTS members_admin_all ON public.members;
DROP POLICY IF EXISTS members_insert_public ON public.members;
DROP POLICY IF EXISTS order_items_admin_write ON public.order_items;
DROP POLICY IF EXISTS order_items_owner_read ON public.order_items;
DROP POLICY IF EXISTS orders_admin_write ON public.orders;
DROP POLICY IF EXISTS orders_owner_read ON public.orders;
DROP POLICY IF EXISTS customers_admin_all ON public.customers;
DROP POLICY IF EXISTS images_admin_write ON public.product_images;
DROP POLICY IF EXISTS images_public_read ON public.product_images;
DROP POLICY IF EXISTS variants_admin_write ON public.product_variants;
DROP POLICY IF EXISTS variants_public_read ON public.product_variants;
DROP POLICY IF EXISTS products_admin_write ON public.products;
DROP POLICY IF EXISTS products_public_read ON public.products;
DROP POLICY IF EXISTS collections_admin_write ON public.collections;
DROP POLICY IF EXISTS collections_public_read ON public.collections;
DROP POLICY IF EXISTS admins_admin_all ON public.admins;

DROP FUNCTION IF EXISTS public.tt_decrement_stock(text, int);
DROP FUNCTION IF EXISTS public.tt_is_admin();

DROP TABLE IF EXISTS public.discount_codes CASCADE;
DROP TABLE IF EXISTS public.quote_requests CASCADE;
DROP TABLE IF EXISTS public.drop_waitlist CASCADE;
DROP TABLE IF EXISTS public.members CASCADE;
DROP TABLE IF EXISTS public.order_items CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;
DROP TABLE IF EXISTS public.product_images CASCADE;
DROP TABLE IF EXISTS public.product_variants CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.collections CASCADE;
DROP TABLE IF EXISTS public.admins CASCADE;

-- Admin fallback table (email allowlist)
CREATE TABLE public.admins (
  email text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Helper: admin check via JWT app_metadata.role or admins table
CREATE OR REPLACE FUNCTION public.tt_is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.admins a
      WHERE lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );
END;
$$;

-- Collections
CREATE TABLE public.collections (
  id text PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  hero_tone text NOT NULL DEFAULT '#E8A317',
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Products (prices in integer fils: AED 99 = 9900)
CREATE TABLE public.products (
  id text PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  collection_slug text NOT NULL REFERENCES public.collections(slug),
  type text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_fils int NOT NULL CHECK (price_fils >= 0),
  compare_at_fils int CHECK (compare_at_fils IS NULL OR compare_at_fils >= 0),
  fabric_gsm int,
  fit_note text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  is_drop boolean NOT NULL DEFAULT false,
  drop_closes_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  best_seller boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_collection ON public.products(collection_slug);
CREATE INDEX idx_products_active ON public.products(is_active) WHERE is_active = true;

-- Product variants
CREATE TABLE public.product_variants (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sku text UNIQUE NOT NULL,
  size text NOT NULL,
  color text NOT NULL,
  color_hex text NOT NULL,
  stock int NOT NULL DEFAULT 0 CHECK (stock >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_variants_product ON public.product_variants(product_id);

-- Product images
CREATE TABLE public.product_images (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url text NOT NULL,
  alt text NOT NULL DEFAULT '',
  view text NOT NULL CHECK (view IN ('front', 'back', 'lifestyle')),
  sort_order int NOT NULL DEFAULT 0
);

CREATE INDEX idx_images_product ON public.product_images(product_id);

-- Customers
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Orders
CREATE TABLE public.orders (
  id text PRIMARY KEY,
  customer_id uuid REFERENCES public.customers(id),
  email text NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  emirate text NOT NULL,
  address text NOT NULL,
  subtotal_fils int NOT NULL CHECK (subtotal_fils >= 0),
  delivery_fils int NOT NULL CHECK (delivery_fils >= 0),
  total_fils int NOT NULL CHECK (total_fils >= 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')),
  stripe_session_id text UNIQUE,
  stripe_event_id text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_email ON public.orders(email);
CREATE INDEX idx_orders_status ON public.orders(status);

-- Order items
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  variant_id text NOT NULL,
  product_name text NOT NULL,
  variant_label text NOT NULL,
  qty int NOT NULL CHECK (qty > 0),
  price_fils int NOT NULL CHECK (price_fils >= 0)
);

CREATE INDEX idx_order_items_order ON public.order_items(order_id);

-- Tribe members
CREATE TABLE public.members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text,
  discount_code text UNIQUE NOT NULL,
  stripe_coupon_id text,
  used_discount boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Drop waitlist
CREATE TABLE public.drop_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  product_id text,
  product_slug text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email, product_slug)
);

-- Quote requests (Tribe Made)
CREATE TABLE public.quote_requests (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  company text,
  quantity int,
  product_interest text,
  notes text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'quoted', 'won', 'lost')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Discount codes
CREATE TABLE public.discount_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  description text,
  percent_off int CHECK (percent_off IS NULL OR (percent_off > 0 AND percent_off <= 100)),
  amount_off_fils int CHECK (amount_off_fils IS NULL OR amount_off_fils > 0),
  stripe_coupon_id text,
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Atomic stock decrement (used by Stripe webhook)
CREATE OR REPLACE FUNCTION public.tt_decrement_stock(p_variant_id text, p_qty int)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated int;
BEGIN
  UPDATE public.product_variants
  SET stock = stock - p_qty
  WHERE id = p_variant_id AND stock >= p_qty;

  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated = 1;
END;
$$;

-- RLS
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drop_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY admins_admin_all ON public.admins
  FOR ALL USING (public.tt_is_admin()) WITH CHECK (public.tt_is_admin());

CREATE POLICY collections_public_read ON public.collections
  FOR SELECT USING (is_active = true);
CREATE POLICY collections_admin_write ON public.collections
  FOR ALL USING (public.tt_is_admin()) WITH CHECK (public.tt_is_admin());

CREATE POLICY products_public_read ON public.products
  FOR SELECT USING (is_active = true);
CREATE POLICY products_admin_write ON public.products
  FOR ALL USING (public.tt_is_admin()) WITH CHECK (public.tt_is_admin());

CREATE POLICY variants_public_read ON public.product_variants
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.is_active = true)
  );
CREATE POLICY variants_admin_write ON public.product_variants
  FOR ALL USING (public.tt_is_admin()) WITH CHECK (public.tt_is_admin());

CREATE POLICY images_public_read ON public.product_images
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.is_active = true)
  );
CREATE POLICY images_admin_write ON public.product_images
  FOR ALL USING (public.tt_is_admin()) WITH CHECK (public.tt_is_admin());

CREATE POLICY customers_admin_all ON public.customers
  FOR ALL USING (public.tt_is_admin()) WITH CHECK (public.tt_is_admin());

CREATE POLICY orders_owner_read ON public.orders
  FOR SELECT USING (
    public.tt_is_admin()
    OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
CREATE POLICY orders_admin_write ON public.orders
  FOR ALL USING (public.tt_is_admin()) WITH CHECK (public.tt_is_admin());

CREATE POLICY order_items_owner_read ON public.order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND (
          public.tt_is_admin()
          OR lower(o.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  );
CREATE POLICY order_items_admin_write ON public.order_items
  FOR ALL USING (public.tt_is_admin()) WITH CHECK (public.tt_is_admin());

CREATE POLICY members_insert_public ON public.members
  FOR INSERT WITH CHECK (true);
CREATE POLICY members_admin_all ON public.members
  FOR ALL USING (public.tt_is_admin()) WITH CHECK (public.tt_is_admin());

CREATE POLICY waitlist_insert_public ON public.drop_waitlist
  FOR INSERT WITH CHECK (true);
CREATE POLICY waitlist_admin_read ON public.drop_waitlist
  FOR SELECT USING (public.tt_is_admin());

CREATE POLICY quotes_insert_public ON public.quote_requests
  FOR INSERT WITH CHECK (true);
CREATE POLICY quotes_admin_all ON public.quote_requests
  FOR ALL USING (public.tt_is_admin()) WITH CHECK (public.tt_is_admin());

CREATE POLICY discount_codes_admin_all ON public.discount_codes
  FOR ALL USING (public.tt_is_admin()) WITH CHECK (public.tt_is_admin());

-- Optional: add your admin email so /admin works after Auth signup
-- INSERT INTO public.admins (email) VALUES ('info@redreach.ae')
-- ON CONFLICT (email) DO NOTHING;

-- Done. Next: put this project's URL + keys in teetribe/.env.local, then:
--   NEXT_PUBLIC_USE_MOCK=false
--   npm run seed
