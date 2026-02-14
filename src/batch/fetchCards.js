import { getCards, getCardsBySet, sleep } from '../api/pokemonPriceTracker.js';
import { supabase } from '../db/supabase.js';
import { config } from '../config.js';
import { usdToJpy } from '../utils/currency.js';
import { getCheckpoint, saveCheckpoint, clearCheckpoint } from './checkpoint.js';

const jpyRate = () => config.batch.usdJpyRate;

/**
 * API のカードデータを DB 用に変換
 */
function mapCardToDb(card) {
  return {
    tcg_player_id: String(card.tcgPlayerId ?? card.id),
    set_tcg_player_id: card.setId ?? null,
    set_name: card.setName ?? null,
    name: card.name,
    card_number: card.cardNumber ?? null,
    total_set_number: card.totalSetNumber ?? null,
    rarity: card.rarity ?? null,
    card_type: card.cardType ?? null,
    pokemon_type: card.pokemonType ?? null,
    artist: card.artist ?? null,
    hp: card.hp ?? null,
    stage: card.stage ?? null,
    flavor_text: card.flavorText ?? null,
    image_cdn_url: card.imageCdnUrl ?? null,
    image_cdn_url_200: card.imageCdnUrl200 ?? null,
    image_cdn_url_400: card.imageCdnUrl400 ?? null,
    image_cdn_url_800: card.imageCdnUrl800 ?? null,
    tcg_player_url: card.tcgPlayerUrl ?? null,
    data_completeness: card.dataCompleteness ?? null,
    last_scraped_at: card.lastScrapedAt ?? null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * API の価格データを DB 用に変換
 */
function mapPriceToDb(card, priceDate) {
  const prices = card.prices || {};
  const rate = jpyRate();
  return {
    card_tcg_player_id: String(card.tcgPlayerId ?? card.id),
    tcg_player_id: String(card.tcgPlayerId ?? card.id),
    market_price: prices.market ?? null,
    low_price: prices.low ?? null,
    market_price_jpy: usdToJpy(prices.market, rate),
    low_price_jpy: usdToJpy(prices.low, rate),
    listings: prices.listings ?? null,
    sellers: prices.sellers ?? null,
    primary_condition: prices.primaryCondition ?? null,
    primary_printing: prices.primaryPrinting ?? null,
    price_date: priceDate,
    last_updated_at: prices.lastUpdated ?? null,
  };
}

/**
 * カードを正規化（単一オブジェクトまたは配列）
 */
function normalizeCards(data) {
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}

/**
 * API の priceHistory から履歴レコードを抽出
 * @param {Object} card - API カードレスポンス
 * @returns {Array} card_price_history 用レコード
 */
function extractPriceHistoryRecords(card) {
  const tcgPlayerId = String(card.tcgPlayerId ?? card.id);
  const records = [];
  const priceHistory = card.priceHistory || {};

  const rate = jpyRate();
  const addPoint = (point, conditionName, printingVariant) => {
    if (!point || (point.market == null && point.average == null)) return;
    const market = point.market ?? point.average;
    const dateStr = point.date;
    if (!dateStr) return;
    const priceDate = dateStr.split('T')[0];
    records.push({
      card_tcg_player_id: tcgPlayerId,
      tcg_player_id: tcgPlayerId,
      price_date: priceDate,
      market_price: market,
      market_price_jpy: usdToJpy(market, rate),
      volume: point.volume ?? null,
      condition_name: conditionName || '',
      printing_variant: printingVariant || '',
    });
  };

  const conditions = priceHistory.conditions || {};
  for (const [conditionName, condData] of Object.entries(conditions)) {
    const history = condData?.history || condData;
    const points = Array.isArray(history) ? history : [];
    for (const point of points) {
      addPoint(point, conditionName, null);
    }
  }

  const variants = priceHistory.variants || {};
  for (const [variantName, variantData] of Object.entries(variants)) {
    if (typeof variantData !== 'object' || !variantData) continue;
    for (const [conditionName, condData] of Object.entries(variantData)) {
      const history = condData?.history || condData;
      const points = Array.isArray(history) ? history : [];
      for (const point of points) {
        addPoint(point, conditionName, variantName);
      }
    }
  }

  return records;
}

/**
 * grade_key (psa10, cgc9.5) を grader と grade_value に分解
 */
function parseGradeKey(gradeKey) {
  const key = String(gradeKey).toLowerCase();
  const match = key.match(/^(psa|bgs|cgc|sgc|tag|ace|mnt|cga|ags)(.+)$/);
  if (!match) return { grader: key.slice(0, 3).toUpperCase(), grade_value: key.slice(3) || '' };
  return { grader: match[1].toUpperCase(), grade_value: match[2] || '' };
}

/**
 * API の card.ebay.salesByGrade から現在価格レコードを抽出
 */
function extractEbayPricesRecords(card) {
  const tcgPlayerId = String(card.tcgPlayerId ?? card.id);
  const rate = jpyRate();
  const records = [];
  const salesByGrade = card.ebay?.salesByGrade || {};
  for (const [gradeKey, data] of Object.entries(salesByGrade)) {
    if (!data || (data.averagePrice == null && data.medianPrice == null)) continue;
    const { grader, grade_value } = parseGradeKey(gradeKey);
    records.push({
      card_tcg_player_id: tcgPlayerId,
      tcg_player_id: tcgPlayerId,
      grade_key: gradeKey.toLowerCase(),
      grader,
      grade_value,
      average_price: data.averagePrice ?? null,
      median_price: data.medianPrice ?? null,
      min_price: data.minPrice ?? null,
      max_price: data.maxPrice ?? null,
      market_price_7_day: data.marketPrice7Day ?? null,
      market_median_7_day: data.marketPriceMedian7Day ?? null,
      count: data.count ?? null,
      daily_volume_7_day: data.dailyVolume7Day ?? null,
      market_trend: data.marketTrend ?? null,
      total_value: data.totalValue ?? null,
      average_price_jpy: usdToJpy(data.averagePrice, rate),
      median_price_jpy: usdToJpy(data.medianPrice, rate),
      min_price_jpy: usdToJpy(data.minPrice, rate),
      max_price_jpy: usdToJpy(data.maxPrice, rate),
      market_price_7_day_jpy: usdToJpy(data.marketPrice7Day, rate),
      market_median_7_day_jpy: usdToJpy(data.marketPriceMedian7Day, rate),
      total_value_jpy: usdToJpy(data.totalValue, rate),
      last_market_update: data.lastMarketUpdate ?? null,
      updated_at: new Date().toISOString(),
    });
  }
  return records;
}

/**
 * API の card.ebay.priceHistory から履歴レコードを抽出
 */
function extractEbayPriceHistoryRecords(card) {
  const tcgPlayerId = String(card.tcgPlayerId ?? card.id);
  const rate = jpyRate();
  const records = [];
  const priceHistory = card.ebay?.priceHistory || {};
  for (const [gradeKey, dateData] of Object.entries(priceHistory)) {
    if (typeof dateData !== 'object' || !dateData) continue;
    const { grader, grade_value } = parseGradeKey(gradeKey);
    const gk = gradeKey.toLowerCase();
    for (const [dateStr, point] of Object.entries(dateData)) {
      if (!point || typeof dateStr !== 'string') continue;
      const priceDate = dateStr.split('T')[0];
      const avg = point.average ?? point.market ?? point.sevenDayAverage;
      if (avg == null) continue;
      records.push({
        card_tcg_player_id: tcgPlayerId,
        tcg_player_id: tcgPlayerId,
        grade_key: gk,
        grader,
        grade_value,
        price_date: priceDate,
        average_price: avg,
        count: point.count ?? null,
        seven_day_average: point.sevenDayAverage ?? null,
        total_value: point.totalValue ?? null,
        average_price_jpy: usdToJpy(avg, rate),
        seven_day_average_jpy: usdToJpy(point.sevenDayAverage, rate),
        total_value_jpy: usdToJpy(point.totalValue, rate),
      });
    }
  }
  return records;
}

/**
 * 指定セットのカードを全件取得して Supabase に保存（ページネーション対応）
 * 日本語カード・価格相場・価格履歴・PSA価格・PSA価格履歴を取得
 * @param {string} setId - セットID（TCGPlayer slug または GroupId）
 */
export async function fetchAndStoreCardsBySet(setId) {
  const includeEbay = config.batch.includeEbay;
  const limit = includeEbay ? 50 : config.batch.includeHistory ? 100 : 200;

  let totalCardsStored = 0;
  let totalPricesStored = 0;
  let totalHistoryStored = 0;
  let totalEbayPricesStored = 0;
  let totalEbayHistoryStored = 0;
  let offset = 0;

  while (true) {
    const response = await getCardsBySet(setId, {
      includeHistory: true,
      includeEbay,
      offset,
    });
    const cards = normalizeCards(response.data);

    if (cards.length === 0) break;

    const cardRecords = cards.map(mapCardToDb);

    const { error: cardsError } = await supabase.from('cards').upsert(cardRecords, {
      onConflict: 'tcg_player_id',
      ignoreDuplicates: false,
    });

    if (cardsError) {
      throw new Error(`カードの保存に失敗: ${cardsError.message}`);
    }

    const priceDate = new Date().toISOString().split('T')[0];
    const priceRecords = cards
      .filter((c) => c.prices && (c.prices.market != null || c.prices.low != null))
      .map((c) => mapPriceToDb(c, priceDate));

    let pricesStored = 0;
    if (priceRecords.length > 0) {
      const { error: pricesError } = await supabase.from('card_prices').upsert(priceRecords, {
        onConflict: 'card_tcg_player_id,price_date',
        ignoreDuplicates: false,
      });
      if (!pricesError) pricesStored = priceRecords.length;
    }

    let historyStored = 0;
    const allHistoryRecords = cards.flatMap(extractPriceHistoryRecords);
    if (allHistoryRecords.length > 0) {
      const { error: historyError } = await supabase
        .from('card_price_history')
        .upsert(allHistoryRecords, {
          onConflict: 'card_tcg_player_id,price_date,condition_name,printing_variant',
          ignoreDuplicates: false,
        });
      if (!historyError) historyStored = allHistoryRecords.length;
    }

    let ebayPricesStored = 0;
    let ebayHistoryStored = 0;
    const allEbayRecords = cards.flatMap(extractEbayPricesRecords);
    if (allEbayRecords.length > 0) {
      const { error: ebayError } = await supabase
        .from('card_ebay_prices')
        .upsert(allEbayRecords, {
          onConflict: 'card_tcg_player_id,grade_key',
          ignoreDuplicates: false,
        });
      if (!ebayError) ebayPricesStored = allEbayRecords.length;
    }

    const allEbayHistoryRecords = cards.flatMap(extractEbayPriceHistoryRecords);
    if (allEbayHistoryRecords.length > 0) {
      const { error: ebayHistoryError } = await supabase
        .from('card_ebay_price_history')
        .upsert(allEbayHistoryRecords, {
          onConflict: 'card_tcg_player_id,grade_key,price_date',
          ignoreDuplicates: false,
        });
      if (!ebayHistoryError) ebayHistoryStored = allEbayHistoryRecords.length;
    }

    totalCardsStored += cardRecords.length;
    totalPricesStored += pricesStored;
    totalHistoryStored += historyStored;
    totalEbayPricesStored += ebayPricesStored;
    totalEbayHistoryStored += ebayHistoryStored;

    if (cards.length < limit) break;
    offset += limit;
    await sleep(config.batch.delayBetweenRequests);
  }

  return {
    cardsStored: totalCardsStored,
    pricesStored: totalPricesStored,
    historyStored: totalHistoryStored,
    ebayPricesStored: totalEbayPricesStored,
    ebayHistoryStored: totalEbayHistoryStored,
  };
}

/**
 * 検索クエリでカードを取得して Supabase に保存
 * @param {string} search - 検索キーワード
 * @param {number} limit - 取得上限
 */
export async function fetchAndStoreCardsBySearch(search, limit = 50) {
  const response = await getCards({ search, limit });
  const cards = normalizeCards(response.data);

  if (cards.length === 0) return { cardsStored: 0, pricesStored: 0 };

  const cardRecords = cards.map(mapCardToDb);

  const { error: cardsError } = await supabase.from('cards').upsert(cardRecords, {
    onConflict: 'tcg_player_id',
    ignoreDuplicates: false,
  });

  if (cardsError) {
    throw new Error(`カードの保存に失敗: ${cardsError.message}`);
  }

  const priceDate = new Date().toISOString().split('T')[0];
  const priceRecords = cards
    .filter((c) => c.prices && (c.prices.market != null || c.prices.low != null))
    .map((c) => mapPriceToDb(c, priceDate));

  let pricesStored = 0;
  if (priceRecords.length > 0) {
    const { error: pricesError } = await supabase.from('card_prices').upsert(priceRecords, {
      onConflict: 'card_tcg_player_id,price_date',
      ignoreDuplicates: false,
    });

    if (!pricesError) {
      pricesStored = priceRecords.length;
    }
  }

  return { cardsStored: cardRecords.length, pricesStored };
}

/**
 * DB からセット一覧を取得（カード取得対象）
 * limit=0 のときは全セット取得
 */
async function getSetsFromDb(limit = 0) {
  let query = supabase
    .from('sets')
    .select('tcg_player_id')
    .order('release_date', { ascending: false, nullsFirst: false });
  if (limit > 0) {
    query = query.limit(limit);
  } else {
    query = query.limit(99999);
  }
  const { data, error } = await query;

  if (error) throw new Error(`セット取得に失敗: ${error.message}`);
  return data || [];
}

/**
 * フルバッチ: 全セット（または直近Nセット）のカードを一括取得
 * maxSets=0 のときはDBの全セットを対象
 * 途中終了した場合はチェックポイントから続きを実行。BATCH_FULL_RUN=true で先頭から実行。
 */
export async function runCardsBatch(options = {}) {
  const { maxSets = config.batch.maxSetsPerRun, fullRun = config.batch.fullRun } = options;
  let totalCards = 0;
  let totalPrices = 0;
  let creditsUsed = 0;

  const sets = await getSetsFromDb(maxSets);

  if (sets.length === 0) {
    console.log('[cards] セットが存在しません。先に sets バッチを実行してください。');
    return { cardsStored: 0, pricesStored: 0, historyStored: 0, ebayPricesStored: 0, ebayHistoryStored: 0, creditsUsed: 0 };
  }

  let startIndex = 0;
  if (!fullRun) {
    const lastSetId = await getCheckpoint('cards');
    if (lastSetId) {
      const idx = sets.findIndex((s) => s.tcg_player_id === lastSetId);
      if (idx >= 0 && idx < sets.length - 1) {
        startIndex = idx + 1;
        console.log(`[cards] 続きから再開: ${startIndex + 1}/${sets.length} セット目から (前回: ${lastSetId})`);
      }
    }
  } else {
    await clearCheckpoint('cards');
  }

  const setsToProcess = sets.slice(startIndex);
  let totalHistory = 0;
  let totalEbayPrices = 0;
  let totalEbayHistory = 0;
  const creditsPerCard = 1 + (config.batch.includeHistory ? 1 : 0) + (config.batch.includeEbay ? 1 : 0);

  for (const { tcg_player_id: setId } of setsToProcess) {
    console.log(`[cards] セット取得中: ${setId}`);
    const { cardsStored, pricesStored, historyStored, ebayPricesStored, ebayHistoryStored } = await fetchAndStoreCardsBySet(setId);
    totalCards += cardsStored;
    totalPrices += pricesStored;
    totalHistory += historyStored;
    totalEbayPrices += ebayPricesStored;
    totalEbayHistory += ebayHistoryStored;
    creditsUsed += cardsStored * creditsPerCard;
    await saveCheckpoint('cards', setId);
    console.log(`  → カード: ${cardsStored}, 価格: ${pricesStored}, 履歴: ${historyStored}, PSA/eBay: ${ebayPricesStored}, PSA履歴: ${ebayHistoryStored}`);
    await sleep(config.batch.delayBetweenRequests);
  }

  if (setsToProcess.length > 0 && startIndex + setsToProcess.length >= sets.length) {
    await clearCheckpoint('cards');
    console.log('[cards] 全セット処理完了。チェックポイントをクリアしました。');
  }

  return {
    cardsStored: totalCards,
    pricesStored: totalPrices,
    historyStored: totalHistory,
    ebayPricesStored: totalEbayPrices,
    ebayHistoryStored: totalEbayHistory,
    creditsUsed,
  };
}
