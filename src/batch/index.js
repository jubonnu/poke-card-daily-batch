import { supabase } from '../db/supabase.js';
import { fetchAndStoreSets } from './fetchSets.js';
import { runCardsBatch } from './fetchCards.js';
import { runSealedProductsBatch } from './fetchSealedProducts.js';

const BATCH_TYPES = {
  sets: runSetsBatch,
  cards: runCardsOnlyBatch,
  sealed: runSealedBatch,
  full: runFullBatch,
};

/**
 * バッチ実行ログを記録
 */
async function logBatchRun(batchType, status, stats = {}) {
  const { error } = await supabase.from('batch_runs').insert({
    batch_type: batchType,
    status,
    completed_at: status !== 'running' ? new Date().toISOString() : null,
    sets_fetched: stats.setsFetched ?? 0,
    cards_fetched: stats.cardsFetched ?? 0,
    prices_updated: stats.pricesUpdated ?? 0,
    credits_used: stats.creditsUsed ?? 0,
    error_message: stats.errorMessage ?? null,
    metadata: { ...(stats.metadata ?? {}), history_stored: stats.historyStored ?? 0 },
  });

  if (error) {
    console.warn('バッチログの記録に失敗:', error.message);
  }
}

/**
 * セットのみバッチ
 */
async function runSetsBatch() {
  const runId = crypto.randomUUID();
  console.log(`[batch] セット取得を開始 (run: ${runId})`);

  try {
    const setsFetched = await fetchAndStoreSets();
    await logBatchRun('sets', 'completed', { setsFetched });
    console.log(`[batch] 完了: セット ${setsFetched} 件`);
    return { success: true, setsFetched };
  } catch (err) {
    console.error('[batch] セット取得エラー:', err.message);
    await logBatchRun('sets', 'failed', { errorMessage: err.message });
    throw err;
  }
}

/**
 * カードのみバッチ（DB のセットを参照）
 */
async function runCardsOnlyBatch() {
  const runId = crypto.randomUUID();
  console.log(`[batch] カード取得を開始 (run: ${runId})`);

  try {
    const { cardsStored, pricesStored, historyStored, ebayPricesStored, ebayHistoryStored, creditsUsed } = await runCardsBatch();
    await logBatchRun('cards', 'completed', {
      cardsFetched: cardsStored,
      pricesUpdated: pricesStored,
      historyStored,
      creditsUsed,
      metadata: { ebayPricesStored, ebayHistoryStored },
    });
    console.log(`[batch] 完了: カード ${cardsStored}, 価格 ${pricesStored}, 履歴 ${historyStored}, PSA/eBay価格 ${ebayPricesStored}, PSA履歴 ${ebayHistoryStored}`);
    return { success: true, cardsStored, pricesStored, creditsUsed };
  } catch (err) {
    console.error('[batch] カード取得エラー:', err.message);
    await logBatchRun('cards', 'failed', { errorMessage: err.message });
    throw err;
  }
}

/**
 * シールド商品のみバッチ
 */
async function runSealedBatch() {
  console.log('[batch] シールド商品取得を開始');

  try {
    const { productsStored, historyStored, creditsUsed } = await runSealedProductsBatch();
    await logBatchRun('sealed', 'completed', {
      creditsUsed,
      metadata: { productsStored, historyStored },
    });
    console.log(`[batch] 完了: 商品 ${productsStored} 件, 価格履歴 ${historyStored} 件`);
    return { success: true, productsStored, historyStored, creditsUsed };
  } catch (err) {
    console.error('[batch] シールド商品取得エラー:', err.message);
    await logBatchRun('sealed', 'failed', { errorMessage: err.message });
    throw err;
  }
}

/**
 * フルバッチ（セット → カード → シールド商品）
 */
async function runFullBatch() {
  const runId = crypto.randomUUID();
  console.log(`[batch] フルバッチを開始 (run: ${runId})`);

  try {
    const setsResult = await runSetsBatch();
    const cardsResult = await runCardsOnlyBatch();
    const sealedResult = await runSealedBatch();

    const totalCredits =
      (cardsResult.creditsUsed ?? 0) + (sealedResult.creditsUsed ?? 0);

    await logBatchRun('full', 'completed', {
      setsFetched: setsResult.setsFetched ?? 0,
      cardsFetched: cardsResult.cardsStored ?? 0,
      pricesUpdated: cardsResult.pricesStored ?? 0,
      historyStored: cardsResult.historyStored ?? 0,
      creditsUsed: totalCredits,
      metadata: {
        ebayPricesStored: cardsResult.ebayPricesStored ?? 0,
        ebayHistoryStored: cardsResult.ebayHistoryStored ?? 0,
        sealedProductsStored: sealedResult.productsStored ?? 0,
        sealedHistoryStored: sealedResult.historyStored ?? 0,
      },
    });

    console.log('[batch] フルバッチ完了');
    return {
      success: true,
      setsFetched: setsResult.setsFetched,
      cardsStored: cardsResult.cardsStored,
      pricesStored: cardsResult.pricesStored,
      sealedProductsStored: sealedResult.productsStored,
      creditsUsed: totalCredits,
    };
  } catch (err) {
    console.error('[batch] フルバッチエラー:', err.message);
    await logBatchRun('full', 'failed', { errorMessage: err.message });
    throw err;
  }
}

/**
 * バッチを実行
 * @param {string} type - sets | cards | sealed | full
 */
export async function runBatch(type = 'full') {
  const fn = BATCH_TYPES[type];

  if (!fn) {
    throw new Error(`不明なバッチタイプ: ${type}. 利用可能: ${Object.keys(BATCH_TYPES).join(', ')}`);
  }

  return fn();
}
