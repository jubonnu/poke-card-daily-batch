-- Pokemon Price Tracker バッチ用テーブル定義
-- Supabase で実行するマイグレーション

-- 1. セット（ポケモンTCGセット）テーブル
CREATE TABLE IF NOT EXISTS sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tcg_player_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  series TEXT,
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. カード（ポケモンカード）テーブル
CREATE TABLE IF NOT EXISTS cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tcg_player_id TEXT NOT NULL UNIQUE,
  set_tcg_player_id TEXT,
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. カード価格履歴テーブル（日次スナップショット）
CREATE TABLE IF NOT EXISTS card_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_tcg_player_id TEXT NOT NULL,
  tcg_player_id TEXT NOT NULL,  -- cards テーブルへの参照用
  market_price NUMERIC,
  low_price NUMERIC,
  listings INTEGER,
  sellers INTEGER,
  primary_condition TEXT,
  primary_printing TEXT,
  price_date DATE NOT NULL,
  last_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(card_tcg_player_id, price_date)
);

-- 4. バッチ実行ログ（冪等性・監視用）
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

-- インデックス
CREATE INDEX IF NOT EXISTS idx_cards_set_tcg_player_id ON cards(set_tcg_player_id);
CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name);
CREATE INDEX IF NOT EXISTS idx_cards_rarity ON cards(rarity);
CREATE INDEX IF NOT EXISTS idx_cards_card_type ON cards(card_type);
CREATE INDEX IF NOT EXISTS idx_cards_created_at ON cards(created_at);

CREATE INDEX IF NOT EXISTS idx_card_prices_card_tcg_player_id ON card_prices(card_tcg_player_id);
CREATE INDEX IF NOT EXISTS idx_card_prices_price_date ON card_prices(price_date);
CREATE INDEX IF NOT EXISTS idx_card_prices_tcg_player_id_date ON card_prices(tcg_player_id, price_date);

CREATE INDEX IF NOT EXISTS idx_sets_series ON sets(series);
CREATE INDEX IF NOT EXISTS idx_sets_release_date ON sets(release_date);

CREATE INDEX IF NOT EXISTS idx_batch_runs_batch_type ON batch_runs(batch_type);
CREATE INDEX IF NOT EXISTS idx_batch_runs_started_at ON batch_runs(started_at);
CREATE INDEX IF NOT EXISTS idx_batch_runs_status ON batch_runs(status);

-- RLS (Row Level Security) - バッチ処理用サービスロールでは無効化可能
-- 必要に応じて有効化
ALTER TABLE sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_runs ENABLE ROW LEVEL SECURITY;

-- サービスロール用ポリシー（全アクセス許可 - バッチ処理用）
CREATE POLICY "Service role full access on sets" ON sets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on cards" ON cards FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on card_prices" ON card_prices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on batch_runs" ON batch_runs FOR ALL USING (true) WITH CHECK (true);
