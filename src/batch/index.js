import { supabase } from '../db/supabase.js';
import { config } from '../config.js';
import { fetchJapaneseSets } from './fetchJapaneseSets.js';
import { fetchJapaneseCards } from './fetchJapaneseCards.js';
import { fetchJapanesePrices } from './fetchJapanesePrices.js';
import { runSealedProductsBatch } from './fetchSealedProducts.js';
import { log, error as logError } from './utils/logger.js';

const BATCH_TYPES = {
  sets: runSetsBatch,
  cards: runCardsOnlyBatch,
  prices: runPricesBatch,
  sealed: runSealedBatch,
  full: runFullBatch,
  diff: runDiffBatch,
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
 * ① セット取得バッチ（日本語のみ）
 */
async function runSetsBatch(options = {}) {
  const runId = crypto.randomUUID();
  log(`セット取得を開始 (run: ${runId})`);

  try {
    const setsFetched = await fetchJapaneseSets(options);
    await logBatchRun('sets', 'completed', {
      setsFetched,
      metadata: { jpFetched: setsFetched },
    });
    log(`完了: 日本語セット ${setsFetched} 件`);
    return { success: true, setsFetched };
  } catch (err) {
    logError(`セット取得エラー: ${err.message}`);
    await logBatchRun('sets', 'failed', { errorMessage: err.message });
    throw err;
  }
}

/**
 * ② 日本語カードのみバッチ（DB のセットを参照、setId=api_set_id）
 */
async function runCardsOnlyBatch(options = {}) {
  const runId = crypto.randomUUID();
  log(`カード取得を開始 (run: ${runId})`);

  try {
    const { cardsStored } = await fetchJapaneseCards(options);
    await logBatchRun('cards', 'completed', { cardsFetched: cardsStored });
    log(`完了: カード ${cardsStored} 枚`);
    return { success: true, cardsStored };
  } catch (err) {
    logError(`カード取得エラー: ${err.message}`);
    await logBatchRun('cards', 'failed', { errorMessage: err.message });
    throw err;
  }
}

/**
 * ③ 価格・履歴・PSAのみバッチ（cards に存在するカードのみ。日本語カードIDで取得、為替で JPY も保存）
 */
async function runPricesBatch(options = {}) {
  const runId = crypto.randomUUID();
  log(`価格・履歴・PSA取得を開始 (run: ${runId})`);

  try {
    const { pricesStored, historyStored, psaStored, psaHistoryStored } = await fetchJapanesePrices(options);
    await logBatchRun('prices', 'completed', {
      pricesUpdated: pricesStored,
      metadata: { historyStored, psaStored, psaHistoryStored },
    });
    log(`完了: 現在価格 ${pricesStored}, 履歴 ${historyStored}, PSA ${psaStored}, PSA履歴 ${psaHistoryStored}`);
    return { success: true, pricesStored, historyStored, psaStored, psaHistoryStored };
  } catch (err) {
    logError(`価格取得エラー: ${err.message}`);
    await logBatchRun('prices', 'failed', { errorMessage: err.message });
    throw err;
  }
}

/**
 * シールド商品のみバッチ
 */
async function runSealedBatch(options = {}) {
  console.log('[batch] シールド商品取得を開始');

  try {
    const { productsStored, historyStored, creditsUsed } = await runSealedProductsBatch(options);
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
 * 差分バッチ（日次用。sets → cards → prices → sealed を順に差分モードで実行）
 */
async function runDiffBatch(options = {}) {
  const runId = crypto.randomUUID();
  log(`差分バッチを開始 (run: ${runId})`);

  const batchOptions = { ...options, mode: 'diff' };

  try {
    const setsResult = await runSetsBatch(batchOptions);
    const cardsResult = await runCardsOnlyBatch(batchOptions);
    const pricesResult = await runPricesBatch(batchOptions);
    const sealedResult = await runSealedBatch(batchOptions);

    await logBatchRun('diff', 'completed', {
      setsFetched: setsResult.setsFetched ?? 0,
      cardsFetched: cardsResult.cardsStored ?? 0,
      pricesUpdated: pricesResult.pricesStored ?? 0,
      creditsUsed: sealedResult.creditsUsed ?? 0,
      metadata: {
        historyStored: pricesResult.historyStored ?? 0,
        psaStored: pricesResult.psaStored ?? 0,
        productsStored: sealedResult.productsStored ?? 0,
        sealedHistoryStored: sealedResult.historyStored ?? 0,
      },
    });

    log('差分バッチ完了');
    return {
      success: true,
      setsFetched: setsResult.setsFetched,
      cardsStored: cardsResult.cardsStored,
      pricesStored: pricesResult.pricesStored,
      historyStored: pricesResult.historyStored,
      psaStored: pricesResult.psaStored,
      productsStored: sealedResult.productsStored,
      sealedHistoryStored: sealedResult.historyStored,
      creditsUsed: sealedResult.creditsUsed,
    };
  } catch (err) {
    logError(`差分バッチエラー: ${err.message}`);
    await logBatchRun('diff', 'failed', { errorMessage: err.message });
    throw err;
  }
}

/**
 * フルバッチ（① セット → ② カード → ③ 価格・履歴・PSA。順番が重要）
 */
async function runFullBatch(options = {}) {
  const runId = crypto.randomUUID();
  log(`フルバッチを開始 (run: ${runId})`);

  try {
    const setsResult = await runSetsBatch(options);
    const cardsResult = await runCardsOnlyBatch(options);
    const pricesResult = await runPricesBatch(options);

    await logBatchRun('full', 'completed', {
      setsFetched: setsResult.setsFetched ?? 0,
      cardsFetched: cardsResult.cardsStored ?? 0,
      pricesUpdated: pricesResult.pricesStored ?? 0,
      metadata: {
        historyStored: pricesResult.historyStored ?? 0,
        psaStored: pricesResult.psaStored ?? 0,
      },
    });

    log('フルバッチ完了');
    return {
      success: true,
      setsFetched: setsResult.setsFetched,
      cardsStored: cardsResult.cardsStored,
      pricesStored: pricesResult.pricesStored,
      historyStored: pricesResult.historyStored,
      psaStored: pricesResult.psaStored,
    };
  } catch (err) {
    logError(`フルバッチエラー: ${err.message}`);
    await logBatchRun('full', 'failed', { errorMessage: err.message });
    throw err;
  }
}

/**
 * バッチを実行
 * @param {string} type - sets | cards | prices | sealed | full | diff
 * @param {Object} [options] - mode: 'full' | 'diff'（CLI優先、未指定時は config.batch.mode）
 */
export async function runBatch(type = 'full', options = {}) {
  const fn = BATCH_TYPES[type];

  if (!fn) {
    throw new Error(`不明なバッチタイプ: ${type}. 利用可能: ${Object.keys(BATCH_TYPES).join(', ')}`);
  }

  const mode = options.mode ?? config.batch.mode;
  const batchOptions = { ...options, mode };

  return fn(batchOptions);
}
