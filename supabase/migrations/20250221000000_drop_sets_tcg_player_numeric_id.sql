-- sets テーブルから tcg_player_numeric_id を削除

DROP INDEX IF EXISTS idx_sets_tcg_player_numeric_id;
ALTER TABLE sets DROP COLUMN IF EXISTS tcg_player_numeric_id;
