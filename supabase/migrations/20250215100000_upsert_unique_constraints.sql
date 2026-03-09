-- 日本語3段階バッチの冪等性: upsert 基準を api_set_id / api_card_id に統一
-- 修正① sets: UNIQUE(api_set_id, language) を upsert 基準に
-- 修正② cards: UNIQUE(api_card_id, language) を upsert 基準に

-- sets: 部分ユニークをやめ、全体で UNIQUE(api_set_id, language) を追加
DROP INDEX IF EXISTS idx_sets_api_set_id_language;
ALTER TABLE sets
  ADD CONSTRAINT sets_api_set_id_language_key UNIQUE (api_set_id, language);

-- cards: api_card_id を主軸にした一意制約（多言語対応のため language を含む）
ALTER TABLE cards
  ADD CONSTRAINT cards_api_card_id_language_key UNIQUE (api_card_id, language);

COMMENT ON CONSTRAINT sets_api_set_id_language_key ON sets IS 'upsert 基準。api_set_id が API 上の唯一の真実';
COMMENT ON CONSTRAINT cards_api_card_id_language_key ON cards IS 'upsert 基準。価格/履歴/PSA API は api_card_id のみ受け付ける';
