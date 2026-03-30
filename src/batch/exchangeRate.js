import { config } from '../config.js';
import { usdToJpy } from '../utils/currency.js';

/**
 * 保存に使う実効 USD→JPY レート（基準 × 係数）
 * @returns {number}
 */
export function getEffectiveUsdJpyRate() {
  return (
    config.batch.usdJpyRate * config.batch.usdJpySaveMultiplier
  );
}

/**
 * バッチ保存時の USD→JPY 為替レートを取得（実効レート）
 * 履歴は「当日の円」で残し、表示は即円。後から再計算も可能。
 * @returns {Promise<number>} 例: 基準150 × 1 = 150
 */
export async function getUsdJpyRate() {
  // 将来: 外部APIで取得する場合はここで fetch し、基準レートを更新
  return Promise.resolve(getEffectiveUsdJpyRate());
}

export { usdToJpy };
