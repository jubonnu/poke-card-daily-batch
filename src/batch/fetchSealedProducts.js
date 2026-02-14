import { getSealedProducts, sleep } from '../api/pokemonPriceTracker.js';
import { supabase } from '../db/supabase.js';
import { config } from '../config.js';
import { usdToJpy } from '../utils/currency.js';
import { getCheckpoint, saveCheckpoint, clearCheckpoint } from './checkpoint.js';

function normalizeProducts(data) {
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}

const SEALED_PRODUCTS_PAGE_LIMIT = 200;

/**
 * セットに紐づくシールド商品を全件取得して保存（ページネーション対応）
 * BOX・パック情報と価格・価格履歴を取得
 */
export async function fetchAndStoreSealedProductsBySet(setId) {
  let totalProductsStored = 0;
  let totalHistoryStored = 0;
  let offset = 0;

  while (true) {
    const response = await getSealedProducts({
      setId,
      fetchAllInSet: true,
      includeHistory: config.batch.sealedIncludeHistory,
      days: 30,
      limit: SEALED_PRODUCTS_PAGE_LIMIT,
      offset,
    });

    const products = normalizeProducts(response.data);
    if (products.length === 0) break;

    const jpyRate = config.batch.usdJpyRate;
    const productRecords = products.map((p) => ({
      tcg_player_id: String(p.tcgPlayerId ?? p.id),
      set_tcg_player_id: p.setId ?? null,
      set_name: p.setName ?? null,
      name: p.name,
      unopened_price: p.unopenedPrice ?? null,
      unopened_price_jpy: usdToJpy(p.unopenedPrice, jpyRate),
      image_cdn_url: p.imageCdnUrl ?? null,
      image_cdn_url_200: p.imageCdnUrl200 ?? null,
      image_cdn_url_400: p.imageCdnUrl400 ?? null,
      image_cdn_url_800: p.imageCdnUrl800 ?? null,
      tcg_player_url: p.tcgPlayerUrl ?? null,
      last_scraped_at: p.lastScrapedAt ?? null,
      updated_at: new Date().toISOString(),
    }));

    const { error: productsError } = await supabase.from('sealed_products').upsert(productRecords, {
      onConflict: 'tcg_player_id',
      ignoreDuplicates: false,
    });

    if (productsError) {
      throw new Error(`シールド商品の保存に失敗: ${productsError.message}`);
    }

    const historyRecords = [];
    for (const p of products) {
      const priceHistory = p.priceHistory || [];
      const tcgId = String(p.tcgPlayerId ?? p.id);
      for (const point of priceHistory) {
        const dateStr = point.date ?? point.price_date;
        if (!dateStr) continue;
        const priceDate = typeof dateStr === 'string' ? dateStr.split('T')[0] : dateStr;
        const price = point.unopenedPrice ?? point.price ?? point.unopened_price;
        if (price == null) continue;
        historyRecords.push({
          product_tcg_player_id: tcgId,
          tcg_player_id: tcgId,
          price_date: priceDate,
          unopened_price: price,
          unopened_price_jpy: usdToJpy(price, jpyRate),
        });
      }
    }

    if (historyRecords.length > 0) {
      const { error: historyError } = await supabase
        .from('sealed_product_price_history')
        .upsert(historyRecords, {
          onConflict: 'product_tcg_player_id,price_date',
          ignoreDuplicates: false,
        });
      if (!historyError) totalHistoryStored += historyRecords.length;
    }

    totalProductsStored += productRecords.length;

    if (products.length < SEALED_PRODUCTS_PAGE_LIMIT) break;
    offset += SEALED_PRODUCTS_PAGE_LIMIT;
    await sleep(config.batch.delayBetweenRequests);
  }

  return { productsStored: totalProductsStored, historyStored: totalHistoryStored };
}

/**
 * DB のセット一覧を元にシールド商品を一括取得
 * maxSets=0 のときは全セットを対象
 * 途中終了した場合はチェックポイントから続きを実行。BATCH_FULL_RUN=true で先頭から実行。
 */
export async function runSealedProductsBatch(options = {}) {
  const { maxSets = config.batch.maxSetsPerRun, fullRun = config.batch.fullRun } = options;

  let setsQuery = supabase
    .from('sets')
    .select('tcg_player_id')
    .order('release_date', { ascending: false, nullsFirst: false });
  setsQuery = maxSets > 0 ? setsQuery.limit(maxSets) : setsQuery.limit(99999);
  const { data: sets, error: setsError } = await setsQuery;

  if (setsError) throw new Error(`セット取得に失敗: ${setsError.message}`);
  if (!sets?.length) {
    console.log('[sealed] セットが存在しません。先に sets バッチを実行してください。');
    return { productsStored: 0, historyStored: 0, creditsUsed: 0 };
  }

  let startIndex = 0;
  if (!fullRun) {
    const lastSetId = await getCheckpoint('sealed');
    if (lastSetId) {
      const idx = sets.findIndex((s) => s.tcg_player_id === lastSetId);
      if (idx >= 0 && idx < sets.length - 1) {
        startIndex = idx + 1;
        console.log(`[sealed] 続きから再開: ${startIndex + 1}/${sets.length} セット目から (前回: ${lastSetId})`);
      }
    }
  } else {
    await clearCheckpoint('sealed');
  }

  const setsToProcess = sets.slice(startIndex);
  let totalProducts = 0;
  let totalHistory = 0;
  let creditsUsed = 0;

  for (const { tcg_player_id: setId } of setsToProcess) {
    console.log(`[sealed] セット取得中: ${setId}`);
    const { productsStored, historyStored } = await fetchAndStoreSealedProductsBySet(setId);
    totalProducts += productsStored;
    totalHistory += historyStored;
    const cost = config.batch.sealedIncludeHistory ? 2 : 1;
    creditsUsed += productsStored * cost;
    await saveCheckpoint('sealed', setId);
    console.log(`  → 商品: ${productsStored} 件, 価格履歴: ${historyStored} 件`);
    await sleep(config.batch.delayBetweenRequests);
  }

  if (setsToProcess.length > 0 && startIndex + setsToProcess.length >= sets.length) {
    await clearCheckpoint('sealed');
    console.log('[sealed] 全セット処理完了。チェックポイントをクリアしました。');
  }

  return { productsStored: totalProducts, historyStored: totalHistory, creditsUsed };
}
