-- sets: tcg_player_id 単独ユニークをやめ、(tcg_player_id, language) の複合ユニークに変更
ALTER TABLE public.sets
DROP CONSTRAINT IF EXISTS sets_tcg_player_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS sets_tcg_player_id_language_key
ON public.sets (tcg_player_id, language);
