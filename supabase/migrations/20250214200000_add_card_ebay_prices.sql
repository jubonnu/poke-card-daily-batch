-- PSA/eBay グレード価格（現在値）
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
  last_market_update TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(card_tcg_player_id, grade_key)
);

-- PSA/eBay グレード価格履歴
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(card_tcg_player_id, grade_key, price_date)
);

CREATE INDEX IF NOT EXISTS idx_card_ebay_prices_card ON card_ebay_prices(card_tcg_player_id);
CREATE INDEX IF NOT EXISTS idx_card_ebay_prices_grader ON card_ebay_prices(grader);
CREATE INDEX IF NOT EXISTS idx_card_ebay_price_history_card ON card_ebay_price_history(card_tcg_player_id);
CREATE INDEX IF NOT EXISTS idx_card_ebay_price_history_grade_date ON card_ebay_price_history(grade_key, price_date);

ALTER TABLE card_ebay_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_ebay_price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on card_ebay_prices" ON card_ebay_prices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on card_ebay_price_history" ON card_ebay_price_history FOR ALL USING (true) WITH CHECK (true);
