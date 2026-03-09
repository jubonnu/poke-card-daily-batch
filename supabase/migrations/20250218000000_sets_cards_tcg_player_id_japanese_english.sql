-- sets: 日本語版IDと英語版IDを別カラムで保持
-- 価格・履歴・PSA取得は英語版IDを使用する

ALTER TABLE sets
  ADD COLUMN IF NOT EXISTS tcg_player_id_japanese TEXT,
  ADD COLUMN IF NOT EXISTS tcg_player_id_english TEXT;

-- 既存データの移行: language に応じて詰める
UPDATE sets SET tcg_player_id_japanese = tcg_player_id WHERE language = 'japanese' AND tcg_player_id_japanese IS NULL;
UPDATE sets SET tcg_player_id_english = tcg_player_id WHERE language = 'english' AND tcg_player_id_english IS NULL;

-- マッチ済み日本語セット: price_source 経由で英語IDを後から matchSets が設定
-- マッチ済み英語セット: 逆方向は matchSets が設定

CREATE INDEX IF NOT EXISTS idx_sets_tcg_player_id_japanese ON sets(tcg_player_id_japanese) WHERE tcg_player_id_japanese IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sets_tcg_player_id_english ON sets(tcg_player_id_english) WHERE tcg_player_id_english IS NOT NULL;

COMMENT ON COLUMN sets.tcg_player_id_japanese IS '日本語版のTCGPlayer ID（表示用）';
COMMENT ON COLUMN sets.tcg_player_id_english IS '英語版のTCGPlayer ID（価格・履歴・PSA取得用）';

-- cards: 英語版IDを追加。価格APIは英語版で取得
ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS tcg_player_id_english TEXT;

CREATE INDEX IF NOT EXISTS idx_cards_tcg_player_id_english ON cards(tcg_player_id_english) WHERE tcg_player_id_english IS NOT NULL;

COMMENT ON COLUMN cards.tcg_player_id_english IS '英語版カードのTCGPlayer ID（価格・履歴・PSA取得用。cardsは日本語表示用）';
