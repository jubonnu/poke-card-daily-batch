-- シールド商品（パック・ボックス・ETB等）
CREATE TABLE IF NOT EXISTS sealed_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tcg_player_id TEXT NOT NULL UNIQUE,
  set_tcg_player_id TEXT,
  set_name TEXT,
  name TEXT NOT NULL,
  unopened_price NUMERIC,
  image_cdn_url TEXT,
  image_cdn_url_200 TEXT,
  image_cdn_url_400 TEXT,
  image_cdn_url_800 TEXT,
  tcg_player_url TEXT,
  last_scraped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- シールド商品価格履歴
CREATE TABLE IF NOT EXISTS sealed_product_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_tcg_player_id TEXT NOT NULL,
  tcg_player_id TEXT NOT NULL,
  price_date DATE NOT NULL,
  unopened_price NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_tcg_player_id, price_date)
);

CREATE INDEX IF NOT EXISTS idx_sealed_products_set ON sealed_products(set_tcg_player_id);
CREATE INDEX IF NOT EXISTS idx_sealed_product_price_history_product ON sealed_product_price_history(product_tcg_player_id);
CREATE INDEX IF NOT EXISTS idx_sealed_product_price_history_date ON sealed_product_price_history(price_date);

ALTER TABLE sealed_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sealed_product_price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on sealed_products" ON sealed_products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on sealed_product_price_history" ON sealed_product_price_history FOR ALL USING (true) WITH CHECK (true);
