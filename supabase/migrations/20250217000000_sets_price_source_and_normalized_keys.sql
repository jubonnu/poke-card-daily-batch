-- sets: 日本語セット ↔ 英語セット紐づけ用（価格・履歴・PSA取得のため）
-- price_source_set_id: 価格取得元となる英語セットへの参照（日本語セットのみ）
-- price_source_match_type: マッチング方法（tcg_player_id, tcg_player_numeric_id, set_code+series, release_date±7+series）
-- set_code, normalized_series_key: マッチング用の正規化キー

ALTER TABLE sets
  ADD COLUMN IF NOT EXISTS price_source_set_id UUID REFERENCES sets(id),
  ADD COLUMN IF NOT EXISTS price_source_match_type TEXT,
  ADD COLUMN IF NOT EXISTS set_code TEXT,
  ADD COLUMN IF NOT EXISTS normalized_series_key TEXT;

ALTER TABLE sets
  ADD CONSTRAINT chk_price_source_only_japanese
  CHECK (
    price_source_set_id IS NULL
    OR language = 'japanese'
  )
  NOT VALID;

UPDATE sets
SET price_source_set_id = NULL,
    price_source_match_type = NULL
WHERE language = 'english'
  AND price_source_set_id IS NOT NULL;

ALTER TABLE sets
  VALIDATE CONSTRAINT chk_price_source_only_japanese;

CREATE INDEX IF NOT EXISTS idx_sets_price_source ON sets(price_source_set_id);
CREATE INDEX IF NOT EXISTS idx_sets_set_code_lang ON sets(set_code, language) WHERE set_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sets_series_key_lang ON sets(normalized_series_key, language) WHERE normalized_series_key IS NOT NULL;

COMMENT ON COLUMN sets.price_source_set_id IS '価格取得元となる英語セット（日本語セットのみ設定）';
COMMENT ON COLUMN sets.price_source_match_type IS 'マッチング方法: tcg_player_id, tcg_player_numeric_id, set_code+series, release_date±7+series';
COMMENT ON COLUMN sets.set_code IS '名前から抽出したセットコード（例: sv1a, 151）。マッチング用';
COMMENT ON COLUMN sets.normalized_series_key IS 'シリーズの正規化キー（例: scarlet_violet）。マッチング用';
