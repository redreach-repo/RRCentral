-- =============================================================================
-- TEE TRIBE on RED REACH CENTRAL
-- Paste into the SAME Supabase project as Central → SQL Editor → Run
--
-- All shop tables use tt_ prefix so they never clash with Central's
-- existing public.products (catalogue) or other CRM tables.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Admin helper: prefer Central rr_is_admin(); fallback to app_users role
CREATE OR REPLACE FUNCTION public.tt_is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF to_regprocedure('public.rr_is_admin()') IS NOT NULL THEN
    RETURN public.rr_is_admin();
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.app_users au
    WHERE lower(au.email) = lower(coalesce(
      (SELECT u.email FROM auth.users u WHERE u.id = auth.uid()),
      auth.jwt() ->> 'email',
      ''
    ))
      AND au.active
      AND au.role = 'admin'
  );
EXCEPTION WHEN undefined_table THEN
  RETURN coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
END;
$$;

-- Clean re-run: drop tables (CASCADE removes policies). Do NOT DROP POLICY
-- first — that fails when the table does not exist yet.
DROP FUNCTION IF EXISTS public.tt_decrement_stock(text, int);

DROP TABLE IF EXISTS public.tt_discount_codes CASCADE;
DROP TABLE IF EXISTS public.tt_quote_requests CASCADE;
DROP TABLE IF EXISTS public.tt_drop_waitlist CASCADE;
DROP TABLE IF EXISTS public.tt_members CASCADE;
DROP TABLE IF EXISTS public.tt_order_items CASCADE;
DROP TABLE IF EXISTS public.tt_orders CASCADE;
DROP TABLE IF EXISTS public.tt_customers CASCADE;
DROP TABLE IF EXISTS public.tt_product_images CASCADE;
DROP TABLE IF EXISTS public.tt_product_variants CASCADE;
DROP TABLE IF EXISTS public.tt_products CASCADE;
DROP TABLE IF EXISTS public.tt_collections CASCADE;

CREATE TABLE public.tt_collections (
  id text PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  hero_tone text NOT NULL DEFAULT '#E8A317',
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tt_products (
  id text PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  collection_slug text NOT NULL REFERENCES public.tt_collections(slug),
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

CREATE INDEX idx_tt_products_collection ON public.tt_products(collection_slug);
CREATE INDEX idx_tt_products_active ON public.tt_products(is_active) WHERE is_active = true;

CREATE TABLE public.tt_product_variants (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES public.tt_products(id) ON DELETE CASCADE,
  sku text UNIQUE NOT NULL,
  size text NOT NULL,
  color text NOT NULL,
  color_hex text NOT NULL,
  stock int NOT NULL DEFAULT 0 CHECK (stock >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tt_variants_product ON public.tt_product_variants(product_id);

CREATE TABLE public.tt_product_images (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES public.tt_products(id) ON DELETE CASCADE,
  url text NOT NULL,
  alt text NOT NULL DEFAULT '',
  view text NOT NULL CHECK (view IN ('front', 'back', 'lifestyle')),
  sort_order int NOT NULL DEFAULT 0
);

CREATE INDEX idx_tt_images_product ON public.tt_product_images(product_id);

CREATE TABLE public.tt_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tt_orders (
  id text PRIMARY KEY,
  customer_id uuid REFERENCES public.tt_customers(id),
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

CREATE INDEX idx_tt_orders_email ON public.tt_orders(email);
CREATE INDEX idx_tt_orders_status ON public.tt_orders(status);

CREATE TABLE public.tt_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL REFERENCES public.tt_orders(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  variant_id text NOT NULL,
  product_name text NOT NULL,
  variant_label text NOT NULL,
  qty int NOT NULL CHECK (qty > 0),
  price_fils int NOT NULL CHECK (price_fils >= 0)
);

CREATE INDEX idx_tt_order_items_order ON public.tt_order_items(order_id);

CREATE TABLE public.tt_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text,
  discount_code text UNIQUE NOT NULL,
  stripe_coupon_id text,
  used_discount boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tt_drop_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  product_id text,
  product_slug text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email, product_slug)
);

CREATE TABLE public.tt_quote_requests (
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

CREATE TABLE public.tt_discount_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  description text,
  percent_off int CHECK (percent_off IS NULL OR (percent_off > 0 AND percent_off <= 100)),
  amount_off_fils int CHECK (amount_off_fils IS NULL OR amount_off_fils > 0),
  stripe_coupon_id text,
  member_id uuid REFERENCES public.tt_members(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.tt_decrement_stock(p_variant_id text, p_qty int)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated int;
BEGIN
  UPDATE public.tt_product_variants
  SET stock = stock - p_qty
  WHERE id = p_variant_id AND stock >= p_qty;
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated = 1;
END;
$$;

ALTER TABLE public.tt_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tt_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tt_product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tt_product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tt_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tt_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tt_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tt_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tt_drop_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tt_quote_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tt_discount_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY tt_collections_public_read ON public.tt_collections
  FOR SELECT USING (is_active = true);
CREATE POLICY tt_collections_admin_write ON public.tt_collections
  FOR ALL USING (public.tt_is_admin()) WITH CHECK (public.tt_is_admin());

CREATE POLICY tt_products_public_read ON public.tt_products
  FOR SELECT USING (is_active = true);
CREATE POLICY tt_products_admin_write ON public.tt_products
  FOR ALL USING (public.tt_is_admin()) WITH CHECK (public.tt_is_admin());

CREATE POLICY tt_variants_public_read ON public.tt_product_variants
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.tt_products p WHERE p.id = product_id AND p.is_active = true)
  );
CREATE POLICY tt_variants_admin_write ON public.tt_product_variants
  FOR ALL USING (public.tt_is_admin()) WITH CHECK (public.tt_is_admin());

CREATE POLICY tt_images_public_read ON public.tt_product_images
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.tt_products p WHERE p.id = product_id AND p.is_active = true)
  );
CREATE POLICY tt_images_admin_write ON public.tt_product_images
  FOR ALL USING (public.tt_is_admin()) WITH CHECK (public.tt_is_admin());

CREATE POLICY tt_customers_admin_all ON public.tt_customers
  FOR ALL USING (public.tt_is_admin()) WITH CHECK (public.tt_is_admin());

CREATE POLICY tt_orders_owner_read ON public.tt_orders
  FOR SELECT USING (
    public.tt_is_admin()
    OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
CREATE POLICY tt_orders_admin_write ON public.tt_orders
  FOR ALL USING (public.tt_is_admin()) WITH CHECK (public.tt_is_admin());

CREATE POLICY tt_order_items_owner_read ON public.tt_order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tt_orders o
      WHERE o.id = order_id
        AND (
          public.tt_is_admin()
          OR lower(o.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  );
CREATE POLICY tt_order_items_admin_write ON public.tt_order_items
  FOR ALL USING (public.tt_is_admin()) WITH CHECK (public.tt_is_admin());

CREATE POLICY tt_members_insert_public ON public.tt_members
  FOR INSERT WITH CHECK (true);
CREATE POLICY tt_members_admin_all ON public.tt_members
  FOR ALL USING (public.tt_is_admin()) WITH CHECK (public.tt_is_admin());

CREATE POLICY tt_waitlist_insert_public ON public.tt_drop_waitlist
  FOR INSERT WITH CHECK (true);
CREATE POLICY tt_waitlist_admin_read ON public.tt_drop_waitlist
  FOR SELECT USING (public.tt_is_admin());

CREATE POLICY tt_quotes_insert_public ON public.tt_quote_requests
  FOR INSERT WITH CHECK (true);
CREATE POLICY tt_quotes_admin_all ON public.tt_quote_requests
  FOR ALL USING (public.tt_is_admin()) WITH CHECK (public.tt_is_admin());

CREATE POLICY tt_discount_codes_admin_all ON public.tt_discount_codes
  FOR ALL USING (public.tt_is_admin()) WITH CHECK (public.tt_is_admin());
