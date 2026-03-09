-- cardsテーブルとsealed_productsテーブルにset_codeカラムを追加
-- set_nameが「M2a: High Class Pack: MEGA Dream ex」のような形式の場合、
-- 「M2a」の部分をset_codeに、「High Class Pack: MEGA Dream ex」をset_nameに保存

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS set_code TEXT;

ALTER TABLE sealed_products
  ADD COLUMN IF NOT EXISTS set_code TEXT;

CREATE INDEX IF NOT EXISTS idx_cards_set_code ON cards(set_code);
CREATE INDEX IF NOT EXISTS idx_sealed_products_set_code ON sealed_products(set_code);

COMMENT ON COLUMN cards.set_code IS 'セットコード（例: M2a）。set_nameから抽出';
COMMENT ON COLUMN sealed_products.set_code IS 'セットコード（例: M2a）。set_nameから抽出';
