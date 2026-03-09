-- cards: 価格API用の TCGPlayer ID（Price API 叩き用）
-- フロー: JP card → JP set → price_source_set_id → EN set → EN cards (card_number でマッチ) → EN card の tcgPlayerId

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS price_source_tcg_player_id TEXT;

-- 既存の tcg_player_id_english から移行
UPDATE cards SET price_source_tcg_player_id = tcg_player_id_english WHERE tcg_player_id_english IS NOT NULL AND price_source_tcg_player_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_cards_price_source_tcg_player_id ON cards(price_source_tcg_player_id) WHERE price_source_tcg_player_id IS NOT NULL;

COMMENT ON COLUMN cards.price_source_tcg_player_id IS '価格API取得用の TCGPlayer ID。JP card → JP set → price_source_set_id → EN set → EN card (card_number マッチ)';
