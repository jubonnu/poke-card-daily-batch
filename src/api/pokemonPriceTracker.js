import fetch from 'node-fetch';
import { config } from '../config.js';

const BASE_URL = config.api.baseUrl;
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

/**
 * API リクエストの基底関数（リトライ付き）
 * 429・5xx・ネットワークエラー時に指数バックオフでリトライする
 */
async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const doRequest = async () => {
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
  };

  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await doRequest();
    } catch (err) {
      lastError = err;
      if (attempt === MAX_RETRIES || !isRetryable(err)) throw err;

      const delayMs = RETRY_DELAY_MS * Math.pow(2, attempt);
      console.warn(
        `[API] リトライ (${attempt + 1}/${MAX_RETRIES}): ${err.status ?? 'network'} - ${delayMs / 1000}s 後に再試行: ${endpoint}`
      );
      await wait(delayMs);
    }
  }

  throw lastError;
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
      language: params.language || config.api.language,
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
      days: params.days ?? 30,
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

export { sleep };
