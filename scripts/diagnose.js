#!/usr/bin/env node
/**
 * 診断スクリプト: バッチ実行の前提条件を確認
 * 使い方: node scripts/diagnose.js
 */
import { supabase } from "../src/db/supabase.js";

async function main() {
  console.log("\n=== Pokemon Batch 診断 ===\n");

  // 1. 日本語セット数
  const { count: totalJpSets } = await supabase
    .from("sets")
    .select("id", { count: "exact", head: true })
    .eq("language", "japanese");
  console.log(`1. 日本語セット総数: ${totalJpSets ?? 0}`);

  // 2. 日本語カード数
  const { count: totalJpCards } = await supabase
    .from("cards")
    .select("id", { count: "exact", head: true })
    .eq("language", "japanese");
  console.log(`2. 日本語カード総数: ${totalJpCards ?? 0}`);

  // 3. tcg_player_id があるカード数（価格取得対象）
  const { count: withTcgId } = await supabase
    .from("cards")
    .select("id", { count: "exact", head: true })
    .eq("language", "japanese")
    .not("tcg_player_id", "is", null)
    .neq("tcg_player_id", "");
  console.log(`3. tcg_player_id あり（価格取得対象）: ${withTcgId ?? 0}`);

  // 4. 日本語セットのサンプル
  const { data: jpSets } = await supabase
    .from("sets")
    .select("name, tcg_player_id, tcg_player_numeric_id")
    .eq("language", "japanese")
    .order("release_date", { ascending: false })
    .limit(3);
  console.log("\n4. 日本語セットサンプル:");
  for (const s of jpSets ?? []) {
    console.log(`   - ${s.name}: tcg_player_id="${s.tcg_player_id}", tcg_player_numeric_id=${s.tcg_player_numeric_id}`);
  }

  // 5. 判定
  console.log("\n=== 判定 ===");
  if ((totalJpSets ?? 0) === 0) {
    console.log("原因: 日本語セットが0件。npm run batch:sets を実行してください。");
  } else if ((totalJpCards ?? 0) === 0) {
    console.log("原因: 日本語カードが0件。npm run batch:cards を実行してください。");
  } else if ((withTcgId ?? 0) === 0) {
    console.log("原因: tcg_player_id が設定されているカードが0件。batch:cards を再実行してください。");
  } else {
    console.log("OK: バッチ実行の前提条件を満たしています。");
    console.log("   - batch:prices で価格・履歴・PSA を取得できます。");
  }
  console.log("");
}

main().catch(console.error);
