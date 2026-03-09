-- Pokemon Price Tracker バッチ用スキーマ（統合版）
-- 日本語セット・カード・価格・シールド商品の取得・保存に必要な全テーブル
-- 新規プロジェクトはこのマイグレーションのみでセットアップ可能

-- ============================================================
-- 1. sets（日本語セット）
-- ============================================================
CREATE TABLE IF NOT EXISTS sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tcg_player_id TEXT NOT NULL,
  api_set_id TEXT,
  language TEXT DEFAULT 'japanese',
  name TEXT NOT NULL,
  series TEXT,
  set_code TEXT,
  normalized_series_key TEXT,
  tcg_player_numeric_id INTEGER,
  release_date DATE,
  card_count INTEGER DEFAULT 0,
  image_cdn_url TEXT,
  image_cdn_url_200 TEXT,
  image_cdn_url_400 TEXT,
  image_cdn_url_800 TEXT,
  price_guide_url TEXT,
  has_price_guide BOOLEAN DEFAULT true,
  no_price_guide_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tcg_player_id, language),
  UNIQUE(api_set_id, language)
);

CREATE INDEX IF NOT EXISTS idx_sets_series ON sets(series);
CREATE INDEX IF NOT EXISTS idx_sets_release_date ON sets(release_date);
CREATE INDEX IF NOT EXISTS idx_sets_language ON sets(language);
CREATE INDEX IF NOT EXISTS idx_sets_set_code_lang ON sets(set_code, language) WHERE set_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sets_tcg_player_numeric_id ON sets(tcg_player_numeric_id);
CREATE INDEX IF NOT EXISTS idx_sets_series_key_lang ON sets(normalized_series_key, language) WHERE normalized_series_key IS NOT NULL;

-- ============================================================
-- 2. cards（日本語カード）
-- ============================================================
CREATE TABLE IF NOT EXISTS cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tcg_player_id TEXT NOT NULL,
  set_id UUID REFERENCES sets(id),
  set_tcg_player_id TEXT,
  set_code TEXT,
  set_name TEXT,
  name TEXT NOT NULL,
  card_number TEXT,
  total_set_number TEXT,
  rarity TEXT,
  card_type TEXT,
  pokemon_type TEXT,
  artist TEXT,
  hp INTEGER,
  stage TEXT,
  flavor_text TEXT,
  image_cdn_url TEXT,
  image_cdn_url_200 TEXT,
  image_cdn_url_400 TEXT,
  image_cdn_url_800 TEXT,
  tcg_player_url TEXT,
  data_completeness NUMERIC,
  last_scraped_at TIMESTAMPTZ,
  language TEXT DEFAULT 'japanese',
  api_card_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(api_card_id, language)
);

CREATE INDEX IF NOT EXISTS idx_cards_set_tcg_player_id ON cards(set_tcg_player_id);
CREATE INDEX IF NOT EXISTS idx_cards_set_id ON cards(set_id);
CREATE INDEX IF NOT EXISTS idx_cards_tcg_player_id ON cards(tcg_player_id);
CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name);
CREATE INDEX IF NOT EXISTS idx_cards_rarity ON cards(rarity);
CREATE INDEX IF NOT EXISTS idx_cards_card_type ON cards(card_type);
CREATE INDEX IF NOT EXISTS idx_cards_created_at ON cards(created_at);
CREATE INDEX IF NOT EXISTS idx_cards_language ON cards(language);
CREATE INDEX IF NOT EXISTS idx_cards_set_code ON cards(set_code);

-- ============================================================
-- 3. card_prices（日次価格スナップショット）
-- ============================================================
CREATE TABLE IF NOT EXISTS card_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_tcg_player_id TEXT NOT NULL,
  tcg_player_id TEXT NOT NULL,
  market_price NUMERIC,
  low_price NUMERIC,
  market_price_jpy NUMERIC,
  low_price_jpy NUMERIC,
  listings INTEGER,
  sellers INTEGER,
  primary_condition TEXT,
  primary_printing TEXT,
  price_date DATE NOT NULL,
  last_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(card_tcg_player_id, price_date)
);

CREATE INDEX IF NOT EXISTS idx_card_prices_card_tcg_player_id ON card_prices(card_tcg_player_id);
CREATE INDEX IF NOT EXISTS idx_card_prices_price_date ON card_prices(price_date);
CREATE INDEX IF NOT EXISTS idx_card_prices_tcg_player_id_date ON card_prices(tcg_player_id, price_date);

-- ============================================================
-- 4. card_price_history（価格履歴）
-- ============================================================
CREATE TABLE IF NOT EXISTS card_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_tcg_player_id TEXT NOT NULL,
  tcg_player_id TEXT NOT NULL,
  price_date DATE NOT NULL,
  market_price NUMERIC,
  market_price_jpy NUMERIC,
  volume INTEGER,
  condition_name TEXT DEFAULT '',
  printing_variant TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(card_tcg_player_id, price_date, condition_name, printing_variant)
);

CREATE INDEX IF NOT EXISTS idx_card_price_history_card ON card_price_history(card_tcg_player_id);
CREATE INDEX IF NOT EXISTS idx_card_price_history_date ON card_price_history(price_date);
CREATE INDEX IF NOT EXISTS idx_card_price_history_tcg_date ON card_price_history(tcg_player_id, price_date);

-- ============================================================
-- 5. card_ebay_prices（PSA/eBay グレード現在価格）
-- ============================================================
CREATE TABLE IF NOT EXISTS card_ebay_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_tcg_player_id TEXT NOT NULL,
  tcg_player_id TEXT NOT NULL,
  grade_key TEXT NOT NULL,
  grader TEXT NOT NULL,
  grade_value TEXT NOT NULL,
  average_price NUMERIC,
  median_price NUMERIC,
  min_price NUMERIC,
  max_price NUMERIC,
  market_price_7_day NUMERIC,
  market_median_7_day NUMERIC,
  count INTEGER,
  daily_volume_7_day NUMERIC,
  market_trend TEXT,
  total_value NUMERIC,
  average_price_jpy NUMERIC,
  median_price_jpy NUMERIC,
  min_price_jpy NUMERIC,
  max_price_jpy NUMERIC,
  market_price_7_day_jpy NUMERIC,
  market_median_7_day_jpy NUMERIC,
  total_value_jpy NUMERIC,
  last_market_update TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(card_tcg_player_id, grade_key)
);

CREATE INDEX IF NOT EXISTS idx_card_ebay_prices_card ON card_ebay_prices(card_tcg_player_id);
CREATE INDEX IF NOT EXISTS idx_card_ebay_prices_grader ON card_ebay_prices(grader);

-- ============================================================
-- 6. card_ebay_price_history（PSA/eBay グレード価格履歴）
-- ============================================================
CREATE TABLE IF NOT EXISTS card_ebay_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_tcg_player_id TEXT NOT NULL,
  tcg_player_id TEXT NOT NULL,
  grade_key TEXT NOT NULL,
  grader TEXT NOT NULL,
  grade_value TEXT NOT NULL,
  price_date DATE NOT NULL,
  average_price NUMERIC,
  count INTEGER,
  seven_day_average NUMERIC,
  total_value NUMERIC,
  average_price_jpy NUMERIC,
  seven_day_average_jpy NUMERIC,
  total_value_jpy NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(card_tcg_player_id, grade_key, price_date)
);

CREATE INDEX IF NOT EXISTS idx_card_ebay_price_history_card ON card_ebay_price_history(card_tcg_player_id);
CREATE INDEX IF NOT EXISTS idx_card_ebay_price_history_grade_date ON card_ebay_price_history(grade_key, price_date);

-- ============================================================
-- 7. sealed_products（シールド商品）
-- ============================================================
CREATE TABLE IF NOT EXISTS sealed_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tcg_player_id TEXT NOT NULL UNIQUE,
  set_tcg_player_id TEXT,
  set_code TEXT,
  set_name TEXT,
  name TEXT NOT NULL,
  unopened_price NUMERIC,
  unopened_price_jpy NUMERIC,
  image_cdn_url TEXT,
  image_cdn_url_200 TEXT,
  image_cdn_url_400 TEXT,
  image_cdn_url_800 TEXT,
  tcg_player_url TEXT,
  last_scraped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sealed_products_set ON sealed_products(set_tcg_player_id);
CREATE INDEX IF NOT EXISTS idx_sealed_products_set_code ON sealed_products(set_code);

-- ============================================================
-- 8. sealed_product_price_history（シールド商品価格履歴）
-- ============================================================
CREATE TABLE IF NOT EXISTS sealed_product_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_tcg_player_id TEXT NOT NULL,
  tcg_player_id TEXT NOT NULL,
  price_date DATE NOT NULL,
  unopened_price NUMERIC,
  unopened_price_jpy NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_tcg_player_id, price_date)
);

CREATE INDEX IF NOT EXISTS idx_sealed_product_price_history_product ON sealed_product_price_history(product_tcg_player_id);
CREATE INDEX IF NOT EXISTS idx_sealed_product_price_history_date ON sealed_product_price_history(price_date);

-- ============================================================
-- 9. batch_runs（バッチ実行ログ）
-- ============================================================
CREATE TABLE IF NOT EXISTS batch_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  cards_fetched INTEGER DEFAULT 0,
  sets_fetched INTEGER DEFAULT 0,
  prices_updated INTEGER DEFAULT 0,
  credits_used INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_batch_runs_batch_type ON batch_runs(batch_type);
CREATE INDEX IF NOT EXISTS idx_batch_runs_started_at ON batch_runs(started_at);
CREATE INDEX IF NOT EXISTS idx_batch_runs_status ON batch_runs(status);

-- ============================================================
-- 10. batch_checkpoints（再開用チェックポイント）
-- ============================================================
CREATE TABLE IF NOT EXISTS batch_checkpoints (
  batch_type TEXT PRIMARY KEY,
  last_set_tcg_player_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE batch_checkpoints IS 'cards / sealed / prices バッチの再開用。last_set_tcg_player_id まで処理済み。';

-- ============================================================
-- RLS（Row Level Security）
-- ============================================================
ALTER TABLE sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_ebay_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_ebay_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE sealed_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sealed_product_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on sets" ON sets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on cards" ON cards FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on card_prices" ON card_prices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on card_price_history" ON card_price_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on card_ebay_prices" ON card_ebay_prices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on card_ebay_price_history" ON card_ebay_price_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on sealed_products" ON sealed_products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on sealed_product_price_history" ON sealed_product_price_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on batch_runs" ON batch_runs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on batch_checkpoints" ON batch_checkpoints FOR ALL USING (true) WITH CHECK (true);
