import { getSealedProducts, sleep } from "../api/pokemonPriceTracker.js";
import { supabase } from "../db/supabase.js";
import { config } from "../config.js";
import { usdToJpy } from "../utils/currency.js";
import { parseSetName } from "../utils/setName.js";
import {
    getCheckpoint,
    saveCheckpoint,
    clearCheckpoint,
} from "./checkpoint.js";

function normalizeProducts(data) {
    if (!data) return [];
    return Array.isArray(data) ? data : [data];
}

const SEALED_PRODUCTS_PAGE_LIMIT = 100;
const SEALED_DELAY_BETWEEN_TERMS_MS = 65_000;
const LANGUAGE = "japanese";

/**
 * 検索ワード一覧（ポケモンTCGシールド商品の主要タイプをカバー）
 * GET /api/v2/sealed-products?language=japanese&search={term}&limit=100 で取得
 */
const SEARCH_TERMS = [
    "booster box",
];

/**
 * 検索ワードでシールド商品を取得して保存（ページネーション対応）
 * BOX・パック情報と価格・価格履歴を取得
 * @param {string} searchTerm - 検索ワード
 * @param {Object} options - mode: 'full' | 'diff'。diff のときは本日価格履歴未登録の商品のみ保存
 */
async function fetchAndStoreSealedProductsBySearch(searchTerm, options = {}) {
    const { mode = "full" } = options;
    let totalProductsStored = 0;
    let totalHistoryStored = 0;
    let offset = 0;

    let idsWithTodayPrice = new Set();
    if (mode === "diff") {
        const today = new Date().toISOString().split("T")[0];
        const { data } = await supabase
            .from("sealed_product_price_history")
            .select("product_tcg_player_id")
            .eq("price_date", today);
        idsWithTodayPrice = new Set(
            (data ?? []).map((r) => r.product_tcg_player_id).filter(Boolean),
        );
    }

    while (true) {
        const params = {
            language: LANGUAGE,
            limit: SEALED_PRODUCTS_PAGE_LIMIT,
            offset,
            includeHistory: config.batch.sealedIncludeHistory,
            days: 30,
        };
        if (searchTerm.trim()) params.search = searchTerm;
        const response = await getSealedProducts(params);

        const products = normalizeProducts(response.data);
        if (products.length === 0) break;

        let productsToSave = products;
        if (mode === "diff" && idsWithTodayPrice.size > 0) {
            productsToSave = products.filter(
                (p) => !idsWithTodayPrice.has(String(p.tcgPlayerId ?? p.id)),
            );
        }

        const jpyRate = config.batch.usdJpyRate;
        const productRecords = productsToSave.map((p) => {
            const { set_code, set_name } = parseSetName(p.setName);
            return {
                tcg_player_id: String(p.tcgPlayerId ?? p.id),
                set_tcg_player_id: p.setId ?? null,
                set_code,
                set_name,
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
            };
        });

        if (productRecords.length > 0) {
            const { error: productsError } = await supabase
                .from("sealed_products")
                .upsert(productRecords, {
                    onConflict: "tcg_player_id",
                    ignoreDuplicates: false,
                });

            if (productsError) {
                throw new Error(
                    `シールド商品の保存に失敗: ${productsError.message}`,
                );
            }
        }

        const historyRecords = [];
        for (const p of productsToSave) {
            const priceHistory = p.priceHistory || [];
            const tcgId = String(p.tcgPlayerId ?? p.id);
            for (const point of priceHistory) {
                const dateStr = point.date ?? point.price_date;
                if (!dateStr) continue;
                const priceDate =
                    typeof dateStr === "string"
                        ? dateStr.split("T")[0]
                        : dateStr;
                const price =
                    point.unopenedPrice ?? point.price ?? point.unopened_price;
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
                .from("sealed_product_price_history")
                .upsert(historyRecords, {
                    onConflict: "product_tcg_player_id,price_date",
                    ignoreDuplicates: false,
                });
            if (!historyError) totalHistoryStored += historyRecords.length;
        }

        totalProductsStored += productRecords.length;

        if (mode === "diff" && productsToSave.length === 0 && products.length > 0) {
            if (products.length < SEALED_PRODUCTS_PAGE_LIMIT) break;
            offset += SEALED_PRODUCTS_PAGE_LIMIT;
            await sleep(config.batch.delayBetweenRequests);
            continue;
        }

        if (products.length < SEALED_PRODUCTS_PAGE_LIMIT) break;
        offset += SEALED_PRODUCTS_PAGE_LIMIT;
        await sleep(config.batch.delayBetweenRequests);
    }

    return {
        productsStored: totalProductsStored,
        historyStored: totalHistoryStored,
    };
}

/**
 * 検索ワードベースでシールド商品を一括取得
 * GET /api/v2/sealed-products?language=japanese&search={term}&limit=100 を複数ワードで実行
 * 途中終了した場合はチェックポイントから続きを実行。BATCH_FULL_RUN=true で先頭から実行。
 */
export async function runSealedProductsBatch(options = {}) {
    const { fullRun = config.batch.fullRun, mode = config.batch.mode } = options;

    let startIndex = 0;
    if (!fullRun) {
        const lastSearchIndex = await getCheckpoint("sealed");
        if (lastSearchIndex != null) {
            const idx = parseInt(lastSearchIndex, 10);
            if (
                !Number.isNaN(idx) &&
                idx >= 0 &&
                idx < SEARCH_TERMS.length - 1
            ) {
                startIndex = idx + 1;
                const prevTerm = SEARCH_TERMS[idx] || "(全件)";
                console.log(
                    `[sealed] 続きから再開: ${startIndex + 1}/${
                        SEARCH_TERMS.length
                    } 検索ワード目 (前回: "${prevTerm}")`,
                );
            }
        }
    } else {
        await clearCheckpoint("sealed");
    }

    const termsToProcess = SEARCH_TERMS.slice(startIndex);
    let totalProducts = 0;
    let totalHistory = 0;
    let creditsUsed = 0;

    if (mode === "diff") {
        console.log("[sealed] 差分モード: 本日価格履歴未登録の商品のみ保存します。");
    }

    for (let i = 0; i < termsToProcess.length; i++) {
        const searchTerm = termsToProcess[i];
        const globalIndex = startIndex + i;
        console.log(`[sealed] 検索中: "${searchTerm || "(全件)"}"`);
        const { productsStored, historyStored } =
            await fetchAndStoreSealedProductsBySearch(searchTerm, { mode });
        totalProducts += productsStored;
        totalHistory += historyStored;
        const cost = config.batch.sealedIncludeHistory ? 2 : 1;
        creditsUsed += productsStored * cost;
        await saveCheckpoint("sealed", String(globalIndex));
        console.log(
            `  → 商品: ${productsStored} 件, 価格履歴: ${historyStored} 件`,
        );
        if (i < termsToProcess.length - 1) {
            console.log(
                `[sealed] レート制限回避: ${SEALED_DELAY_BETWEEN_TERMS_MS / 1000}s 待機...`,
            );
            await sleep(SEALED_DELAY_BETWEEN_TERMS_MS);
        }
    }

    if (
        termsToProcess.length > 0 &&
        startIndex + termsToProcess.length >= SEARCH_TERMS.length
    ) {
        await clearCheckpoint("sealed");
        console.log(
            "[sealed] 全検索ワード処理完了。チェックポイントをクリアしました。",
        );
    }

    return {
        productsStored: totalProducts,
        historyStored: totalHistory,
        creditsUsed,
    };
}
