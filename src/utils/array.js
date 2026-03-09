/**
 * 配列ユーティリティ
 */

/**
 * 値を配列に正規化（API レスポンスの data が単体 or 配列の場合に対応）
 * @param {*} value - 配列または単一要素
 * @returns {Array}
 */
export function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}
