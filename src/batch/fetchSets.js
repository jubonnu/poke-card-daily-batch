import { getSets, sleep } from '../api/pokemonPriceTracker.js';
import { supabase } from '../db/supabase.js';
import { config } from '../config.js';

/**
 * API のセットデータを DB 用に変換
 */
function mapSetToDb(set) {
  return {
    tcg_player_id: String(set.tcgPlayerId ?? set.id),
    name: set.name,
    series: set.series ?? null,
    release_date: set.releaseDate ?? null,
    card_count: set.cardCount ?? 0,
    image_cdn_url: set.imageCdnUrl ?? null,
    image_cdn_url_200: set.imageCdnUrl200 ?? null,
    image_cdn_url_400: set.imageCdnUrl400 ?? null,
    image_cdn_url_800: set.imageCdnUrl800 ?? null,
    price_guide_url: set.priceGuideUrl ?? null,
    has_price_guide: set.hasPriceGuide ?? true,
    no_price_guide_reason: set.noPriceGuideReason ?? null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * セット一覧を取得して Supabase に保存
 * maxSets=0 のときは全セット取得
 */
export async function fetchAndStoreSets(options = {}) {
  const { maxSets = config.batch.maxSetsPerRun } = options;
  let totalFetched = 0;
  let offset = 0;
  const limit = 100;

  while (true) {
    const response = await getSets({ limit, offset });
    const sets = Array.isArray(response.data) ? response.data : [response.data];

    if (!sets || sets.length === 0) break;

    const records = sets.map(mapSetToDb);

    const { error } = await supabase.from('sets').upsert(records, {
      onConflict: 'tcg_player_id',
      ignoreDuplicates: false,
    });

    if (error) {
      throw new Error(`セットの保存に失敗: ${error.message}`);
    }

    totalFetched += records.length;
    console.log(`  [sets] ${offset + 1}-${offset + records.length} 件保存 (合計: ${totalFetched})`);

    if (records.length < limit) break;
    if (maxSets > 0 && totalFetched >= maxSets) break;

    offset += limit;
    await sleep(config.batch.delayBetweenRequests);
  }

  return totalFetched;
}
