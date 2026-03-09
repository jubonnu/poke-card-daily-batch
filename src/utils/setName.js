/**
 * set_nameを分割してset_codeとset_nameに分ける
 * 例: "M2a: High Class Pack: MEGA Dream ex" → { set_code: "M2a", set_name: "High Class Pack: MEGA Dream ex" }
 * 
 * @param {string | null | undefined} setName - 元のset_name
 * @returns {{ set_code: string | null, set_name: string | null }} 分割後のset_codeとset_name
 */
export function parseSetName(setName) {
  if (!setName || typeof setName !== 'string') {
    return { set_code: null, set_name: setName ?? null };
  }

  // 「: 」で分割（最初の1回のみ）
  const colonIndex = setName.indexOf(': ');
  
  if (colonIndex === -1) {
    // 「: 」が見つからない場合は、set_codeなしとして扱う
    return { set_code: null, set_name: setName };
  }

  const setCode = setName.substring(0, colonIndex).trim();
  const remainingName = setName.substring(colonIndex + 2).trim(); // 「: 」の2文字をスキップ

  return {
    set_code: setCode || null,
    set_name: remainingName || null,
  };
}
