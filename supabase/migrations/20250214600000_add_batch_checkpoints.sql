-- バッチの続きから再開するためのチェックポイント
-- 途中終了した場合、最後に成功したセットIDを記録し、再実行時にその次から処理する

CREATE TABLE IF NOT EXISTS batch_checkpoints (
  batch_type TEXT PRIMARY KEY,
  last_set_tcg_player_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE batch_checkpoints IS 'cards / sealed バッチの再開用。last_set_tcg_player_id まで処理済み。再実行時はその次から開始。';

ALTER TABLE batch_checkpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on batch_checkpoints" ON batch_checkpoints FOR ALL USING (true) WITH CHECK (true);
