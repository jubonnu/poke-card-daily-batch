-- sets テーブルから英語関連カラムを削除（日本語セットのみ取得するため不要）
-- price_source_set_id, tcg_player_id_english, price_source_match_type, tcg_player_id_japanese

-- 制約とインデックスを先に削除
ALTER TABLE sets DROP CONSTRAINT IF EXISTS chk_price_source_only_japanese;
DROP INDEX IF EXISTS idx_sets_price_source;
DROP INDEX IF EXISTS idx_sets_tcg_player_id_japanese;
DROP INDEX IF EXISTS idx_sets_tcg_player_id_english;

-- カラムを削除
ALTER TABLE sets DROP COLUMN IF EXISTS price_source_set_id;
ALTER TABLE sets DROP COLUMN IF EXISTS price_source_match_type;
ALTER TABLE sets DROP COLUMN IF EXISTS tcg_player_id_english;
ALTER TABLE sets DROP COLUMN IF EXISTS tcg_player_id_japanese;
