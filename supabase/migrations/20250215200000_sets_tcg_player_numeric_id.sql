-- sets: API の tcgPlayerNumericId を保存
ALTER TABLE sets
  ADD COLUMN IF NOT EXISTS tcg_player_numeric_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_sets_tcg_player_numeric_id ON sets(tcg_player_numeric_id);
COMMENT ON COLUMN sets.tcg_player_numeric_id IS 'API の tcgPlayerNumericId';
