-- 価格テーブルに日本円（JPY）用カラムを追加
-- バッチ保存時に USD のまま保存しつつ、為替で円換算した JPY も保存する

-- card_prices
ALTER TABLE card_prices
  ADD COLUMN IF NOT EXISTS market_price_jpy NUMERIC,
  ADD COLUMN IF NOT EXISTS low_price_jpy NUMERIC;

-- card_price_history
ALTER TABLE card_price_history
  ADD COLUMN IF NOT EXISTS market_price_jpy NUMERIC;

-- card_ebay_prices
ALTER TABLE card_ebay_prices
  ADD COLUMN IF NOT EXISTS average_price_jpy NUMERIC,
  ADD COLUMN IF NOT EXISTS median_price_jpy NUMERIC,
  ADD COLUMN IF NOT EXISTS min_price_jpy NUMERIC,
  ADD COLUMN IF NOT EXISTS max_price_jpy NUMERIC,
  ADD COLUMN IF NOT EXISTS market_price_7_day_jpy NUMERIC,
  ADD COLUMN IF NOT EXISTS market_median_7_day_jpy NUMERIC,
  ADD COLUMN IF NOT EXISTS total_value_jpy NUMERIC;

-- card_ebay_price_history
ALTER TABLE card_ebay_price_history
  ADD COLUMN IF NOT EXISTS average_price_jpy NUMERIC,
  ADD COLUMN IF NOT EXISTS seven_day_average_jpy NUMERIC,
  ADD COLUMN IF NOT EXISTS total_value_jpy NUMERIC;

-- sealed_products
ALTER TABLE sealed_products
  ADD COLUMN IF NOT EXISTS unopened_price_jpy NUMERIC;

-- sealed_product_price_history
ALTER TABLE sealed_product_price_history
  ADD COLUMN IF NOT EXISTS unopened_price_jpy NUMERIC;
