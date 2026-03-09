import fetch from 'node-fetch';
import { config } from '../config.js';

const BASE_URL = config.api.baseUrl;
const TRACKER_BASE = config.api.trackerBaseUrl;
const API_KEY = config.api.apiKey;
const MAX_RETRIES = config.api.maxRetries ?? 3;
const RETRY_DELAY_MS = config.api.retryDelayMs ?? 5000;

/**
 * リトライすべきエラーかどうか（429 / 5xx / ネットワークエラー）
 */
function isRetryable(error) {
  const status = error.status;
  if (status == null) return true; // ネットワークエラーなど
  if (status === 429) return true; // レート制限
  if (status >= 500 && status < 600) return true; // サーバーエラー
  return false;
}

/**
 * 指定ミリ秒だけ待機
 */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RATE_LIMIT_WAIT_MS = 65_000;

/**
 * fetch を実行し、レスポンスをパースしてエラーハンドリング
 */
async function doFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || `API Error: ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

/**
 * リトライ付きでリクエストを実行
 * @param {string} url - リクエスト先 URL
 * @param {Object} options - fetch オプション
 * @param {Object} retryOpts - useRateLimitDelay: 429 時に長めの待機を使うか
 */
async function requestWithRetry(url, options = {}, retryOpts = {}) {
  const { useRateLimitDelay = false } = retryOpts;
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await doFetch(url, options);
    } catch (err) {
      lastError = err;
      if (attempt === MAX_RETRIES || !isRetryable(err)) throw err;

      const delayMs = useRateLimitDelay && err.status === 429
        ? RATE_LIMIT_WAIT_MS
        : RETRY_DELAY_MS * Math.pow(2, attempt);
      console.warn(
        `[API] リトライ (${attempt + 1}/${MAX_RETRIES}): ${err.status ?? 'network'} - ${delayMs / 1000}s 後に再試行: ${url}`
      );
      await wait(delayMs);
    }
  }

  throw lastError;
}

/**
 * API リクエスト（相対パス、429 時は長めの待機）
 */
async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  return requestWithRetry(url, options, { useRateLimitDelay: true });
}

/**
 * 絶対URLでリクエスト（tracker 等の別ベース用）
 */
async function requestAbsolute(fullUrl, options = {}) {
  return requestWithRetry(fullUrl, options);
}

/**
 * レート制限用遅延
 */
function sleep(ms = config.api.rateLimitMs) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * オブジェクトを URL クエリパラメータに変換（undefined を除外）
 */
function toQueryParams(obj) {
  return Object.entries(obj).reduce((acc, [key, value]) => {
    if (value !== undefined && value !== null) {
      acc[key] = typeof value === 'boolean' ? String(value) : value;
    }
    return acc;
  }, {});
}

/**
 * セット一覧を取得
 * @param {Object} params - クエリパラメータ
 */
export async function getSets(params = {}) {
  const searchParams = new URLSearchParams(
    toQueryParams({
      language: params.language || config.api.language,
      limit: params.limit ?? 100,
      offset: params.offset ?? 0,
      sortBy: params.sortBy || 'releaseDate',
      sortOrder: params.sortOrder || 'desc',
      search: params.search,
      series: params.series,
    })
  );

  return request(`/sets?${searchParams.toString()}`);
}

/**
 * カードを取得
 * @param {Object} params - クエリパラメータ
 */
export async function getCards(params = {}) {
  const searchParams = new URLSearchParams(
    toQueryParams({
      ...(params.omitLanguage ? {} : { language: params.language || config.api.language }),
      tcgPlayerId: params.tcgPlayerId,
      cardId: params.cardId,
      setId: params.setId,
      set: params.set,
      search: params.search,
      limit: params.limit ?? config.batch.cardsPerRequest,
      offset: params.offset ?? 0,
      sortBy: params.sortBy || 'cardNumber',
      sortOrder: params.sortOrder || 'asc',
      includeHistory: params.includeHistory ?? config.batch.includeHistory,
      includeEbay: params.includeEbay ?? false,
      includeBoth: params.includeBoth,
      days: params.days ?? 30,
      maxDataPoints: params.maxDataPoints,
      fetchAllInSet: params.fetchAllInSet ?? false,
    })
  );

  return request(`/cards?${searchParams.toString()}`);
}

/**
 * 特定セットの全カードを取得
 * @param {string} setId - セットID（TCGPlayer slug または GroupId）
 * @param {Object} options - オプション
 */
export async function getCardsBySet(setId, options = {}) {
  const includeHistory = options.includeHistory ?? config.batch.includeHistory;
  const includeEbay = options.includeEbay ?? config.batch.includeEbay;
  let limit = 200;
  if (includeEbay) limit = 50;
  else if (includeHistory) limit = 100;
  return getCards({
    setId,
    fetchAllInSet: true,
    limit,
    includeHistory,
    includeEbay,
    days: options.days ?? 30,
    ...options,
  });
}

/**
 * 特定カードを TCGPlayer ID で取得
 * @param {string} tcgPlayerId - TCGPlayer ID
 */
export async function getCardByTcgPlayerId(tcgPlayerId) {
  return getCards({
    tcgPlayerId,
    limit: 1,
  });
}

/**
 * 特定カードを TCGPlayer ID で取得（eBay/PSA データ含む：現在価格＋価格履歴）
 * GET /cards?tcgPlayerId=...&includeEbay=true で data.ebay.salesByGrade / data.ebay.priceHistory を取得
 * @param {string} tcgPlayerId - TCGPlayer ID（cards.tcg_player_id）
 * @param {Object} options - language, days
 */
export async function getCardWithEbay(tcgPlayerId, options = {}) {
  return getCards({
    language: options.language || config.api.language,
    tcgPlayerId,
    includeEbay: true,
    limit: 1,
    days: options.days ?? 30,
  });
}

/**
 * シールド商品を取得（パック・ボックス・ETB等）
 * @param {Object} params - クエリパラメータ
 */
export async function getSealedProducts(params = {}) {
  const searchParams = new URLSearchParams(
    toQueryParams({
      language: params.language || config.api.language,
      tcgPlayerId: params.tcgPlayerId,
      setId: params.setId,
      set: params.set,
      search: params.search,
      minPrice: params.minPrice,
      maxPrice: params.maxPrice,
      includeHistory: params.includeHistory ?? false,
      days: params.days ?? 30,
      fetchAllInSet: params.fetchAllInSet ?? false,
      sortBy: params.sortBy || 'name',
      sortOrder: params.sortOrder || 'desc',
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    })
  );

  return request(`/sealed-products?${searchParams.toString()}`);
}

/**
 * ③ 価格・履歴バッチ用: カードの現在価格を取得
 * GET /api/v2/cards/{cardId}/prices
 * @param {string} cardId - APIのカードID（cards.api_card_id）
 */
export async function getCardPrices(cardId) {
  return request(`/cards/${encodeURIComponent(cardId)}/prices`);
}

/**
 * ③ 価格履歴用: カードの価格履歴を取得（プラン制限あり・6ヶ月等）
 * GET /api/tracker/history/{cardId}?days=180
 * @param {string} cardId - APIのカードID（cards.api_card_id）
 * @param {Object} options - days（履歴の日数、デフォルト180）
 */
export async function getCardHistory(cardId, options = {}) {
  const days = options.days ?? 180;
  const url = `${TRACKER_BASE}/history/${encodeURIComponent(cardId)}?days=${days}`;
  return requestAbsolute(url);
}

/**
 * ③ PSA価格用: カードのPSA価格を取得
 * GET /api/v2/psa/{cardId}
 * @param {string} cardId - APIのカードID（cards.api_card_id）
 */
export async function getPsaPrices(cardId) {
  return request(`/psa/${encodeURIComponent(cardId)}`);
}

export { sleep };
