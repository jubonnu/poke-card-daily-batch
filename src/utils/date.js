/**
 * 日付ユーティリティ（日本時間 JST ベース）
 */

/**
 * 本日の日付を YYYY-MM-DD 形式で取得（日本時間 JST）
 * GitHub Actions 等で UTC 環境でも 0:00 JST 実行時に正しい日付になる
 * @returns {string}
 */
export function getTodayDateString() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}
