import "dotenv/config";

const required = (key) => {
    const value = process.env[key];
    if (!value) {
        throw new Error(`環境変数 ${key} が設定されていません`);
    }
    return value;
};

export const config = {
    api: {
        baseUrl:
            process.env.POKEMON_API_BASE_URL ||
            "https://www.pokemonpricetracker.com/api/v2",
        /** 価格履歴用（GET /api/tracker/history/{cardId}） */
        trackerBaseUrl:
            process.env.POKEMON_API_TRACKER_URL ||
            (
                process.env.POKEMON_API_BASE_URL ||
                "https://www.pokemonpricetracker.com/api"
            ).replace(/\/v2\/?$/, "") + "/tracker",
        apiKey: required("POKEMON_API_KEY"),
        language: process.env.POKEMON_API_LANGUAGE || "japanese",
        rateLimitMs: parseInt(process.env.RATE_LIMIT_MS || "1100", 10), // 60/min = 1 req/sec + buffer
        /** リトライ回数（429・5xx・ネットワークエラー時）。0 で無効 */
        maxRetries: Math.max(
            0,
            parseInt(process.env.API_MAX_RETRIES ?? "3", 10),
        ),
        /** リトライ初回待機ミリ秒（指数バックオフの基準）。未設定時 5000 */
        retryDelayMs: Math.max(
            1000,
            parseInt(process.env.API_RETRY_DELAY_MS || "5000", 10),
        ),
    },
    supabase: {
        url: required("SUPABASE_URL"),
        serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    },
    batch: {
        cardsPerRequest: parseInt(
            process.env.BATCH_CARDS_PER_REQUEST || "50",
            10,
        ),
        maxSetsPerRun: parseInt(process.env.BATCH_MAX_SETS ?? "0", 10),
        includeHistory: process.env.BATCH_INCLUDE_HISTORY !== "false",
        includeEbay: process.env.BATCH_INCLUDE_EBAY !== "false",
        sealedIncludeHistory:
            process.env.BATCH_SEALED_INCLUDE_HISTORY !== "false",
        /** リクエスト間の待機ミリ秒。429 回避のため 1200（50 req/min）推奨。日次は workflow で指定 */
        delayBetweenRequests: parseInt(
            process.env.BATCH_DELAY_MS || "1200",
            10,
        ),
        /** 価格 API days（BATCH_PRICES_HISTORY_DAYS で上書き可）。diff は日次6h向けに短め */
        pricesHistoryDaysDiff: parseInt(
            process.env.BATCH_PRICES_HISTORY_DAYS_DIFF || "30",
            10,
        ),
        pricesHistoryDaysFull: parseInt(
            process.env.BATCH_PRICES_HISTORY_DAYS_FULL || "180",
            10,
        ),
        pricesMaxDataPointsDiff: parseInt(
            process.env.BATCH_PRICES_MAX_DATA_POINTS_DIFF || "200",
            10,
        ),
        pricesMaxDataPointsFull: parseInt(
            process.env.BATCH_PRICES_MAX_DATA_POINTS_FULL || "365",
            10,
        ),
        /** 両モード共通で days を固定したいとき（例: 180）。未設定なら diff/full 別デフォルト */
        pricesHistoryDaysOverride: process.env.BATCH_PRICES_HISTORY_DAYS
            ? parseInt(process.env.BATCH_PRICES_HISTORY_DAYS, 10)
            : null,
        pricesMaxDataPointsOverride:
            process.env.BATCH_PRICES_MAX_DATA_POINTS != null &&
            process.env.BATCH_PRICES_MAX_DATA_POINTS !== ""
                ? parseInt(process.env.BATCH_PRICES_MAX_DATA_POINTS, 10)
                : null,
        /** USD→JPY 基準レート（未設定時 150）。実際の保存は × usdJpySaveMultiplier */
        usdJpyRate: parseFloat(process.env.USD_JPY_RATE || "150", 10) || 150,
        /** 円換算保存時に基準レートへ掛ける係数（未設定時 1.5 → 実効 150×1.5=225） */
        usdJpySaveMultiplier: (() => {
            const v = parseFloat(
                process.env.USD_JPY_SAVE_MULTIPLIER ?? "1.5",
                10,
            );
            return Number.isFinite(v) && v > 0 ? v : 1.5;
        })(),
        /** true のときチェックポイントを無視し先頭から実行（未設定時は続きから再開） */
        fullRun: process.env.BATCH_FULL_RUN === "true",
        /** 'diff' のとき差分のみ取得（cards: カード未登録セットのみ, prices: 本日価格未登録カードのみ）。未設定時は 'full' */
        mode: process.env.BATCH_MODE || "full",
    },
};
