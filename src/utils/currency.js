/**
 * USD → JPY 換算（バッチ保存時に使用）
 * @param {number | null | undefined} usd - USD 価格
 * @param {number} rate - USD/JPY レート（例: 150）
 * @returns {number | null} 円換算後の整数、null の場合は null
 */
export function usdToJpy(usd, rate) {
  if (usd == null || Number.isNaN(usd) || rate == null || Number.isNaN(rate) || rate <= 0) {
    return null;
  }
  return Math.round(Number(usd) * Number(rate));
}
