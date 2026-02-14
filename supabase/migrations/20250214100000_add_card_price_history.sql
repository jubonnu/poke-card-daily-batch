-- 価格履歴テーブル（API includeHistory で取得した過去の価格データ）
CREATE TABLE IF NOT EXISTS card_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_tcg_player_id TEXT NOT NULL,
  tcg_player_id TEXT NOT NULL,
  price_date DATE NOT NULL,
  market_price NUMERIC,
  volume INTEGER,
  condition_name TEXT DEFAULT '',
  printing_variant TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(card_tcg_player_id, price_date, condition_name, printing_variant)
);

CREATE INDEX IF NOT EXISTS idx_card_price_history_card ON card_price_history(card_tcg_player_id);
CREATE INDEX IF NOT EXISTS idx_card_price_history_date ON card_price_history(price_date);
CREATE INDEX IF NOT EXISTS idx_card_price_history_tcg_date ON card_price_history(tcg_player_id, price_date);

ALTER TABLE card_price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on card_price_history" ON card_price_history FOR ALL USING (true) WITH CHECK (true);
