-- cards テーブルから price_source_tcg_player_id と tcg_player_id_english を削除

DROP INDEX IF EXISTS idx_cards_price_source_tcg_player_id;
DROP INDEX IF EXISTS idx_cards_tcg_player_id_english;

ALTER TABLE cards DROP COLUMN IF EXISTS price_source_tcg_player_id;
ALTER TABLE cards DROP COLUMN IF EXISTS tcg_player_id_english;
