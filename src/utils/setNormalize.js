/**
 * セット名・シリーズ名の正規化（日本語セット ↔ 英語セット マッチング用）
 */

/**
 * セット名から set_code を抽出（空の場合はフォールバックで必ず値を返す）
 * 例: "SV1a: Triplet Beat" → "sv1a", "151" → "151"
 * @param {string | null | undefined} name - セット名
 * @returns {string} 正規化した set_code（フォールバック: name のサニタイズ版 or "unknown"）
 */
export function extractSetCode(name) {
  if (!name || typeof name !== "string") return "unknown";
  const trimmed = name.trim();
  if (!trimmed) return "unknown";

  // パターン1: 英字+数字+オプション(a/b/c) 例: SV1a, sv2, 151
  const match1 = trimmed.match(/^([A-Za-z]*\d+[a-c]?)\s*[:\s]/);
  if (match1) return match1[1].toLowerCase();

  // パターン2: 先頭の英数字ブロック 例: "SV1a: ..."
  const match2 = trimmed.match(/^([A-Za-z]*\d+[a-c]?)/);
  if (match2) return match2[1].toLowerCase();

  // パターン3: 数字のみ（3桁程度）例: "151"
  const match3 = trimmed.match(/^(\d{2,4})\b/);
  if (match3) return match3[1];

  // フォールバック: 英数字を抽出してサニタイズ（マッチング用）
  const fallback = trimmed
    .replace(/[^a-zA-Z0-9\s\-]/g, "")
    .replace(/\s+/g, "_")
    .toLowerCase()
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 32);
  return fallback || "unknown";
}

/**
 * シリーズ名を正規化キーに変換（空の場合はフォールバックで必ず値を返す）
 * 例: "Scarlet & Violet" → "scarlet_violet"
 * @param {string | null | undefined} series - シリーズ名
 * @param {string | null | undefined} fallbackFromName - series が空時のフォールバック（セット名から抽出）
 * @returns {string} 正規化キー（フォールバック: fallbackFromName から抽出 or "unknown"）
 */
export function normalizeSeriesKey(series, fallbackFromName = null) {
  if (series && typeof series === "string") {
    const trimmed = series.trim();
    if (trimmed) {
      const normalized = trimmed
        .toLowerCase()
        .replace(/[&\-\/\\]/g, "_")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
      if (normalized) return normalized;
    }
  }
  if (fallbackFromName && typeof fallbackFromName === "string") {
    const fromName = fallbackFromName
      .trim()
      .toLowerCase()
      .replace(/[&\-\/\\:]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 64);
    if (fromName) return fromName;
  }
  return "unknown";
}
