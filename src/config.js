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
        /** リクエスト間の待機ミリ秒。API 60req/min のため 1100 以上推奨。6時間以内完了のため 1100 をデフォルトに */
        delayBetweenRequests: parseInt(
            process.env.BATCH_DELAY_MS || "1100",
            10,
        ),
        /** USD→JPY 為替レート（バッチ保存時の円換算に使用。未設定時は 200） */
        usdJpyRate: parseFloat(process.env.USD_JPY_RATE || "200", 10) || 200,
        /** true のときチェックポイントを無視し先頭から実行（未設定時は続きから再開） */
        fullRun: process.env.BATCH_FULL_RUN === "true",
        /** 'diff' のとき差分のみ取得（cards: カード未登録セットのみ, prices: 本日価格未登録カードのみ）。未設定時は 'full' */
        mode: process.env.BATCH_MODE || "full",
    },
};
