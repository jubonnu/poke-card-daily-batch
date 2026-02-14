import { supabase } from '../db/supabase.js';

const TABLE = 'batch_checkpoints';

/**
 * 最後に成功したセットIDを取得
 * @param {string} batchType - 'cards' | 'sealed'
 * @returns {Promise<string | null>}
 */
export async function getCheckpoint(batchType) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('last_set_tcg_player_id')
    .eq('batch_type', batchType)
    .maybeSingle();

  if (error) {
    console.warn(`[checkpoint] 取得失敗 (${batchType}):`, error.message);
    return null;
  }
  return data?.last_set_tcg_player_id ?? null;
}

/**
 * チェックポイントを保存（このセットまで処理済み）
 * @param {string} batchType - 'cards' | 'sealed'
 * @param {string} lastSetTcgPlayerId
 */
export async function saveCheckpoint(batchType, lastSetTcgPlayerId) {
  const { error } = await supabase.from(TABLE).upsert(
    {
      batch_type: batchType,
      last_set_tcg_player_id: lastSetTcgPlayerId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'batch_type' }
  );

  if (error) {
    console.warn(`[checkpoint] 保存失敗 (${batchType}):`, error.message);
  }
}

/**
 * チェックポイントをクリア（次回は先頭から実行）
 * @param {string} batchType - 'cards' | 'sealed'
 */
export async function clearCheckpoint(batchType) {
  const { error } = await supabase.from(TABLE).delete().eq('batch_type', batchType);

  if (error) {
    console.warn(`[checkpoint] クリア失敗 (${batchType}):`, error.message);
  }
}
