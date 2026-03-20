/**
 * ③ 価格・履歴・PSAバッチ
 * cards テーブルに存在する全日本語カードを対象。
 * カード1枚単位で GET /cards?language=japanese&tcgPlayerId={id}&includeHistory=true&includeEbay=true&days=180 を実行。
 * 価格・価格履歴・PSA価格・PSA価格履歴を取得して保存。
 */
import { getCards, sleep, getRecommendedDelayMs } from "../api/pokemonPriceTracker.js";
import { supabase } from "../db/supabase.js";
import { config } from "../config.js";
import { getUsdJpyRate, usdToJpy } from "./exchangeRate.js";
import { getCheckpoint, saveCheckpoint, clearCheckpoint } from "./checkpoint.js";
import { log, error as logError } from "./utils/logger.js";
import { getTodayDateString } from "../utils/date.js";

/** グレードキー（psa10, cgc9.5 等）から grader と grade_value を抽出 */
function parseGradeKey(gradeKey) {
    const key = String(gradeKey).toLowerCase();
    const match = key.match(/^(psa|bgs|cgc|sgc|tag|ace|mnt|cga|ags)(.+)$/);
    if (!match) return { grader: key.slice(0, 3).toUpperCase(), grade_value: key.slice(3) || "" };
    return { grader: match[1].toUpperCase(), grade_value: match[2] || "" };
}

const CARDS_PAGE_SIZE = 1000;

/**
 * 対象カード取得。全日本語カード（tcg_player_id が有効なもの）
 * limit=0 のときはページネーションで全件取得（Supabase の 1000 件上限を超える分も取得）
 * @param {number} limit - 0 のときは全件
 * @param {string} mode - 'full' | 'diff'。diff のときは本日 card_prices に未登録のカードのみ返す
 * @param {string} [minReleaseDate] - 指定時は sets.release_date >= minReleaseDate のセットに属するカードのみ対象
 */
async function getCardsForPrices(limit = 0, mode = "full", minReleaseDate = null) {
    let setIds = null;
    if (minReleaseDate) {
        const { data: setsData, error: setsError } = await supabase
            .from("sets")
            .select("id")
            .eq("language", "japanese")
            .gte("release_date", minReleaseDate);
        if (setsError) throw new Error(`セット取得に失敗: ${setsError.message}`);
        setIds = (setsData ?? []).map((s) => s.id).filter(Boolean);
        if (setIds.length === 0) return [];
    }

    const all = [];
    let offset = 0;
    const pageSize = limit > 0 ? limit : CARDS_PAGE_SIZE;

    while (true) {
        let query = supabase
            .from("cards")
            .select("id, tcg_player_id")
            .eq("language", "japanese")
            .not("tcg_player_id", "is", null);

        if (setIds && setIds.length > 0) {
            query = query.in("set_id", setIds);
        }

        query = query.range(offset, offset + pageSize - 1);

        const { data, error } = await query;
        if (error) throw new Error(`カード取得に失敗: ${error.message}`);
        const page = (data ?? []).filter((c) => c.tcg_player_id?.trim?.());
        all.push(...page);

        if (limit > 0 || page.length < pageSize) break;
        offset += pageSize;
    }

    if (mode !== "diff" || all.length === 0) return all;

    // diff: card_prices, card_price_history, card_ebay_prices, card_ebay_price_history の
    // いずれかに未保存（日付/データがない）のカードのみ取得
    const today = getTodayDateString();

    const [
        { data: hasCardPricesToday },
        { data: hasCardPriceHistory },
        { data: hasCardEbayPrices },
        { data: hasCardEbayPriceHistory },
    ] = await Promise.all([
        supabase
            .from("card_prices")
            .select("card_tcg_player_id")
            .eq("price_date", today),
        supabase.from("card_price_history").select("card_tcg_player_id"),
        supabase.from("card_ebay_prices").select("card_tcg_player_id"),
        supabase.from("card_ebay_price_history").select("card_tcg_player_id"),
    ]);

    const idsWithPricesToday = new Set(
        (hasCardPricesToday ?? []).map((r) => r.card_tcg_player_id).filter(Boolean),
    );
    const idsWithHistory = new Set(
        (hasCardPriceHistory ?? []).map((r) => r.card_tcg_player_id).filter(Boolean),
    );
    const idsWithEbay = new Set(
        (hasCardEbayPrices ?? []).map((r) => r.card_tcg_player_id).filter(Boolean),
    );
    const idsWithEbayHistory = new Set(
        (hasCardEbayPriceHistory ?? []).map((r) => r.card_tcg_player_id).filter(Boolean),
    );

    // 4テーブル全てにデータがあるカードはスキップ。いずれか欠けていれば取得対象
    return all.filter((c) => {
        const id = c.tcg_player_id;
        const hasPrices = idsWithPricesToday.has(id);
        const hasHistory = idsWithHistory.has(id);
        const hasEbay = idsWithEbay.has(id);
        const hasEbayHistory = idsWithEbayHistory.has(id);
        const isComplete =
            hasPrices && (hasHistory || hasEbay || hasEbayHistory);
        return !isComplete;
    });
}

/**
 * API の priceHistory（conditions/variants ネスト）を saveCardHistory 用のフラット配列に変換
 */
function flattenPriceHistory(priceHistory) {
    if (!priceHistory || typeof priceHistory !== "object") return [];
    const points = [];

    const conditions = priceHistory.conditions ?? {};
    for (const [condName, condData] of Object.entries(conditions)) {
        const history = condData?.history ?? [];
        for (const p of history) {
            points.push({
                ...p,
                condition_name: condName,
                printing_variant: "",
            });
        }
    }

    const variants = priceHistory.variants ?? {};
    for (const [varName, varData] of Object.entries(variants)) {
        for (const [condName, condData] of Object.entries(varData ?? {})) {
            const history = condData?.history ?? [];
            for (const p of history) {
                points.push({
                    ...p,
                    condition_name: condName,
                    printing_variant: varName,
                });
            }
        }
    }
    return points;
}

/**
 * ③-1 現在価格を保存
 * @param {string} [priceDate] - 保存する日付（未指定時は本日）。バッチ全体で統一するため呼び出し元で指定推奨
 */
async function saveCardPrices(card, pricesData, rate, priceDate) {
    const data = pricesData?.data ?? pricesData ?? {};
    const market = data.market ?? data.marketPrice ?? data.market_price;
    const low = data.low ?? data.lowPrice ?? data.low_price;

    if (market == null && low == null) return 0;

    const record = {
        card_tcg_player_id: card.tcg_player_id,
        tcg_player_id: card.tcg_player_id,
        market_price: market ?? null,
        low_price: low ?? null,
        market_price_jpy: usdToJpy(market, rate),
        low_price_jpy: usdToJpy(low, rate),
        listings: data.listings ?? null,
        sellers: data.sellers ?? null,
        primary_condition:
            data.primaryCondition ?? data.primary_condition ?? null,
        primary_printing: data.primaryPrinting ?? data.primary_printing ?? null,
        price_date: priceDate ?? getTodayDateString(),
        last_updated_at: data.lastUpdated ?? data.last_updated_at ?? null,
    };

    const { error } = await supabase.from("card_prices").upsert(record, {
        onConflict: "card_tcg_player_id,price_date",
        ignoreDuplicates: false,
    });
    return error ? 0 : 1;
}

/**
 * ③-2 価格履歴を保存（API レスポンス形状に依存。6ヶ月制限等は API 側）
 */
async function saveCardHistory(card, historyData, rate) {
    const points =
        historyData?.data ?? historyData?.history ?? Array.isArray(historyData)
            ? historyData
            : [];
    const arr = Array.isArray(points)
        ? points
        : Object.entries(points).flatMap(([, v]) =>
              Array.isArray(v) ? v : [v],
          );

    if (arr.length === 0) return 0;

    const records = [];
    for (const point of arr) {
        const dateStr = point.date ?? point.price_date ?? point.priceDate;
        if (!dateStr) continue;
        const priceDate = String(dateStr).split("T")[0];
        const market =
            point.market ??
            point.average ??
            point.market_price ??
            point.price_usd;

        if (market == null) continue;

        records.push({
            card_tcg_player_id: card.tcg_player_id,
            tcg_player_id: card.tcg_player_id,
            price_date: priceDate,
            market_price: market,
            market_price_jpy: usdToJpy(market, rate),
            volume: point.volume ?? null,
            condition_name: point.condition_name ?? point.conditionName ?? "",
            printing_variant:
                point.printing_variant ?? point.printingVariant ?? "",
        });
    }

    if (records.length === 0) return 0;

    const { error } = await supabase
        .from("card_price_history")
        .upsert(records, {
            onConflict:
                "card_tcg_player_id,price_date,condition_name,printing_variant",
            ignoreDuplicates: false,
        });
    return error ? 0 : records.length;
}

/**
 * ③-3 PSA価格（card_ebay_prices に格納する場合。API 形状に応じて調整）
 */
async function savePsaPrices(card, psaData, rate) {
    const byGrade = psaData?.data ?? psaData?.salesByGrade ?? psaData ?? {};
    if (typeof byGrade !== "object") return 0;

    const records = [];
    for (const [gradeKey, data] of Object.entries(byGrade)) {
        if (!data || (data.averagePrice == null && data.medianPrice == null))
            continue;
        const { grader, grade_value } = parseGradeKey(gradeKey);
        const avg = data.averagePrice ?? data.medianPrice ?? data.average_price;
        records.push({
            card_tcg_player_id: card.tcg_player_id,
            tcg_player_id: card.tcg_player_id,
            grade_key: String(gradeKey).toLowerCase(),
            grader,
            grade_value,
            average_price: avg ?? null,
            median_price: data.medianPrice ?? data.median_price ?? null,
            average_price_jpy: usdToJpy(avg, rate),
            median_price_jpy: usdToJpy(
                data.medianPrice ?? data.median_price,
                rate,
            ),
            updated_at: new Date().toISOString(),
        });
    }

    if (records.length === 0) return 0;

    const { error } = await supabase.from("card_ebay_prices").upsert(records, {
        onConflict: "card_tcg_player_id,grade_key",
        ignoreDuplicates: false,
    });
    return error ? 0 : records.length;
}

/**
 * ③-4 PSA価格履歴（card_ebay_price_history に格納）
 * API の ebay.priceHistory: グレード別の日次価格。キーはグレードコード、値は日付キー→{ average, count, sevenDayAverage, totalValue }
 */
async function savePsaPriceHistory(card, priceHistory, rate) {
    if (!priceHistory || typeof priceHistory !== "object") return 0;
    const records = [];
    const tcgId = card.tcg_player_id;
    for (const [gradeKey, dateData] of Object.entries(priceHistory)) {
        if (typeof dateData !== "object" || !dateData) continue;
        const { grader, grade_value } = parseGradeKey(gradeKey);
        const gk = String(gradeKey).toLowerCase();
        for (const [dateStr, point] of Object.entries(dateData)) {
            if (!point || typeof dateStr !== "string") continue;
            const priceDate = String(dateStr).split("T")[0];
            const avg = point.average ?? point.market ?? point.sevenDayAverage;
            if (avg == null) continue;
            records.push({
                card_tcg_player_id: tcgId,
                tcg_player_id: tcgId,
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
    if (records.length === 0) return 0;
    const { error } = await supabase.from("card_ebay_price_history").upsert(records, {
        onConflict: "card_tcg_player_id,grade_key,price_date",
        ignoreDuplicates: false,
    });
    return error ? 0 : records.length;
}

/**
 * 価格・履歴・PSA バッチ（cards に存在するカードのみ）
 * daily or weekly 推奨。為替はバッチ保存時に取得し USD と JPY の両方を保存。
 * 途中終了した場合はチェックポイントから続きを実行。BATCH_FULL_RUN=true で先頭から実行。
 */
export async function fetchJapanesePrices(options = {}) {
    const {
        maxCards = 0,
        includeHistory = true,
        includePsa = true,
        mode = config.batch.mode,
        minReleaseDate = mode === "diff" ? "2016-01-01" : null,
    } = options;
    const fullRun = config.batch.fullRun;

    const rate = await getUsdJpyRate();
    const priceDate = getTodayDateString();
    log(`為替レート: 1 USD = ${rate} JPY`);
    if (mode === "diff") {
        log("差分モード: 本日価格未登録のカードのみ取得します。");
        if (minReleaseDate) {
            log(`対象: release_date >= ${minReleaseDate} のセットに属するカードのみ`);
        }
    }

    const cards = await getCardsForPrices(maxCards, mode, minReleaseDate);
    if (cards.length === 0) {
        if (mode === "diff") {
            log(
                minReleaseDate
                    ? "差分モード: 対象セットに本日価格未登録のカードはありません。スキップします。"
                    : "差分モード: 本日価格未登録のカードはありません。スキップします。",
            );
        } else {
            log(
                "日本語カードがありません。先に batch:sets と batch:cards を実行してください。",
            );
        }
        return { pricesStored: 0, historyStored: 0, psaStored: 0, psaHistoryStored: 0 };
    }

    let startIndex = 0;
    if (!fullRun) {
        const lastId = await getCheckpoint("prices");
        if (lastId) {
            const idx = cards.findIndex((c) => c.tcg_player_id === lastId);
            if (idx >= 0) startIndex = idx + 1;
            if (startIndex >= cards.length) {
                log("全件処理済み。チェックポイントをクリアしました。");
                await clearCheckpoint("prices");
                return { pricesStored: 0, historyStored: 0, psaStored: 0, psaHistoryStored: 0 };
            }
            log(`続きから再開: ${startIndex + 1}/${cards.length} 件目 (前回: ${lastId})`);
        }
    } else {
        await clearCheckpoint("prices");
    }

    const toProcess = cards.slice(startIndex);
    log(`価格取得開始: ${toProcess.length} 件 (全体 ${cards.length} 件中)`);

    let pricesStored = 0;
    let historyStored = 0;
    let psaStored = 0;
    let psaHistoryStored = 0;
    let debugLogged = false;
    const total = cards.length;
    const progressInterval = 5; // 5件ごとに進捗表示

    const baseDelay = config.batch.delayBetweenRequests;

    for (let i = 0; i < toProcess.length; i++) {
        const card = toProcess[i];
        const tcgPlayerId = card.tcg_player_id;

        let res;
        try {
            if (!tcgPlayerId?.trim()) continue;
            const resPromise = getCards({
                tcgPlayerId,
                language: "japanese",
                includeHistory,
                includeEbay: includePsa,
                includeBoth: includeHistory && includePsa,
                days: 180,
                maxDataPoints: 365,
                limit: 1,
            });
            // 2件目以降: 待機中にAPI応答を並行取得（オーバーラップで6時間以内完了を目指す）
            if (i > 0) {
                const extraDelay = getRecommendedDelayMs();
                await sleep(baseDelay + extraDelay);
            }
            res = await resPromise;

            const raw = res?.data;
            const cardData = Array.isArray(raw) ? raw[0] : raw;
            if (!cardData) {
                logError(`[prices] カードデータなし tcg_player_id=${tcgPlayerId}`);
                continue;
            }

            // API は priceHistory/ebay をレスポンス直下に返す場合あり（metadata.includes が true なのに cardData に無い）
            const priceHistory =
                cardData.priceHistory ??
                cardData.price_history ??
                res?.priceHistory ??
                res?.price_history;
            const ebayData =
                cardData.ebay ??
                cardData.ebayData ??
                res?.ebay ??
                res?.ebayData;

            const p = await saveCardPrices(card, cardData.prices ?? {}, rate, priceDate);
            pricesStored += p;

            if (includeHistory && priceHistory) {
                const flatHistory = flattenPriceHistory(priceHistory);
                const h = await saveCardHistory(card, flatHistory, rate);
                historyStored += h;
            }

            if (includePsa && ebayData) {
                const s = await savePsaPrices(card, ebayData, rate);
                psaStored += s;
                const ebayPriceHistory =
                    ebayData.priceHistory ?? ebayData.price_history;
                const ph = await savePsaPriceHistory(
                    card,
                    ebayPriceHistory,
                    rate,
                );
                psaHistoryStored += ph;
            }

            // 履歴・eBay が取れない場合、最初の1件だけレスポンス構造をダンプ（診断用）
            if (
                !debugLogged &&
                ((includeHistory && !priceHistory) || (includePsa && !ebayData))
            ) {
                debugLogged = true;
                const resKeys = res ? Object.keys(res) : [];
                const cardDataKeys = cardData && typeof cardData === "object" ? Object.keys(cardData) : [];
                log(
                    `[prices] 診断: tcg_player_id=${tcgPlayerId} resのキー=[${resKeys.join(", ")}] cardDataのキー=[${cardDataKeys.join(", ")}]`,
                );
            }
        } catch (err) {
            logError(
                `[prices] failed card tcg_player_id=${tcgPlayerId}`,
                err,
            );
            // 429/403 時は次ループ前に追加待機（悪循環防止）
            if (err?.status === 429 || err?.status === 403) {
                const extraMs = 90_000; // 90秒
                log(`[prices] レート制限/ブロック検出: ${extraMs / 1000}s 待機して続行`);
                await sleep(extraMs);
            }
        }

        await saveCheckpoint("prices", card.tcg_player_id);

        const processed = startIndex + i + 1;
        if (
            processed % progressInterval === 0 ||
            processed === total
        ) {
            log(
                `[prices] 処理中: ${processed}/${total} 件 (価格 ${pricesStored}, 履歴 ${historyStored}, PSA ${psaStored}, PSA履歴 ${psaHistoryStored})`,
            );
        }
    }

    if (startIndex + toProcess.length >= cards.length) {
        await clearCheckpoint("prices");
        log("全件処理完了。チェックポイントをクリアしました。");
    }

    log(
        `価格バッチ完了: 現在価格 ${pricesStored}, 履歴 ${historyStored}, PSA ${psaStored}, PSA履歴 ${psaHistoryStored}`,
    );
    return { pricesStored, historyStored, psaStored, psaHistoryStored };
}
