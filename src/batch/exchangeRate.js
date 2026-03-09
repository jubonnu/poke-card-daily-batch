import { config } from '../config.js';
import { usdToJpy } from '../utils/currency.js';

/**
 * バッチ保存時の USD→JPY 為替レートを取得
 * 履歴は「当日の円」で残し、表示は即円。後から再計算も可能。
 * @returns {Promise<number>} USD/JPY レート（例: 200）
 */
export async function getUsdJpyRate() {
  // 将来: 外部APIで取得する場合はここで fetch
  // const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
  // const data = await res.json(); return data.rates.JPY;
  return Promise.resolve(config.batch.usdJpyRate);
}

export { usdToJpy };
