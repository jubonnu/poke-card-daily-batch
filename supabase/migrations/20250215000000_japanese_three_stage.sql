-- 3段階バッチ用: 日本語セット・カード・価格の紐づけとAPI ID保持
-- ① セット: APIのidをapi_set_idに保存（GET /cards?setId=api_set_id で使用）
-- ② カード: set_id (sets.id), language, api_card_id（価格APIで使用）

-- sets: APIのセットIDと言語
ALTER TABLE sets
  ADD COLUMN IF NOT EXISTS api_set_id TEXT,
  ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'japanese';

CREATE UNIQUE INDEX IF NOT EXISTS idx_sets_api_set_id_language ON sets(api_set_id, language) WHERE api_set_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sets_language ON sets(language);

-- cards: セット参照とAPIカードID（価格・履歴・PSA取得で使用）
ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS set_id UUID REFERENCES sets(id),
  ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'japanese',
  ADD COLUMN IF NOT EXISTS api_card_id TEXT;

CREATE INDEX IF NOT EXISTS idx_cards_set_id ON cards(set_id);
CREATE INDEX IF NOT EXISTS idx_cards_language ON cards(language);
CREATE INDEX IF NOT EXISTS idx_cards_api_card_id ON cards(api_card_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_set_language_api_id ON cards(set_id, language, api_card_id) WHERE set_id IS NOT NULL AND api_card_id IS NOT NULL;

COMMENT ON COLUMN sets.api_set_id IS 'APIのセットID（MongoDB ObjectId）。GET /cards?setId= に使用';
COMMENT ON COLUMN sets.language IS '言語（例: japanese）';
COMMENT ON COLUMN cards.set_id IS 'sets.id（UUID）。セットとの紐づけ';
COMMENT ON COLUMN cards.api_card_id IS 'APIのカードID。GET /cards/{cardId}/prices 等に使用';
