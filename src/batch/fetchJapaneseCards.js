/**
 * ② 日本語カード取得バッチ（最重要）
 * DB の sets を参照し、各セットごとに GET /cards?language=japanese&setId=api_set_id&fetchAllInSet=true で取得。
 * set_id + language で紐づけ。並列 5〜10。
 */
import { getCards, sleep } from "../api/pokemonPriceTracker.js";
import { supabase } from "../db/supabase.js";
import { config } from "../config.js";
import { parseSetName } from "../utils/setName.js";
import { toArray } from "../utils/array.js";
import {
    getCheckpoint,
    saveCheckpoint,
    clearCheckpoint,
} from "./checkpoint.js";
import { log } from "./utils/logger.js";

const LANGUAGE = "japanese";

function toNum(value) {
    if (value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function mapCardToDb(card, setIdUuid) {
    const { set_code, set_name } = parseSetName(card.setName);
    return {
        tcg_player_id: String(card.tcgPlayerId ?? card.id ?? card._id ?? ""),
        set_id: setIdUuid,
        set_tcg_player_id: card.setId ?? null,
        set_code,
        set_name,
        name: card.name ?? "",
        card_number: card.cardNumber ?? null,
        total_set_number: card.totalSetNumber ?? null,
        rarity: card.rarity ?? null,
        card_type: card.cardType ?? null,
        pokemon_type: card.pokemonType ?? null,
        artist: card.artist ?? null,
        hp: toNum(card.hp),
        stage: card.stage ?? null,
        flavor_text: card.flavorText ?? null,
        image_cdn_url: card.imageCdnUrl ?? null,
        image_cdn_url_200: card.imageCdnUrl200 ?? null,
        image_cdn_url_400: card.imageCdnUrl400 ?? null,
        image_cdn_url_800: card.imageCdnUrl800 ?? null,
        tcg_player_url: card.tcgPlayerUrl ?? null,
        data_completeness: toNum(card.dataCompleteness),
        last_scraped_at: card.lastScrapedAt ?? null,
        language: LANGUAGE,
        api_card_id: card.id ?? card._id ?? null,
        updated_at: new Date().toISOString(),
    };
}

/**
 * 1 セット分のカードを取得して保存（ページネーション対応）
 */
async function fetchAndStoreCardsForSet(set, options = {}) {
    const { includeHistory = false, includeEbay = false } = options;
    // setId は tcgPlayerNumericId（API 仕様）。なければ api_set_id / tcg_player_id にフォールバック
    const setIdForApi =
        set.tcg_player_numeric_id != null
            ? String(set.tcg_player_numeric_id)
            : set.api_set_id || set.tcg_player_id;
    const limit = includeEbay ? 50 : includeHistory ? 100 : config.batch.cardsPerRequest;

    let total = 0;
    let offset = 0;

    while (true) {
        const response = await getCards({
            language: LANGUAGE,
            setId: setIdForApi,
            fetchAllInSet: true,
            limit,
            offset,
            includeHistory,
            includeEbay,
            days: 30,
        });

        const cards = toArray(response.data);
        if (cards.length === 0) break;

        const records = cards
            .map((c) => mapCardToDb(c, set.id))
            .filter((r) => r.api_card_id != null);

        if (records.length === 0) {
            offset += limit;
            continue;
        }

        const { error } = await supabase.from("cards").upsert(records, {
            onConflict: ["api_card_id", "language"],
            ignoreDuplicates: false,
        });

        if (error) throw new Error(`カードの保存に失敗: ${error.message}`);

        total += records.length;
        if (cards.length < limit) break;
        offset += limit;
        await sleep(config.batch.delayBetweenRequests);
    }

    return total;
}

/**
 * DB から日本語セット一覧を取得
 * @param {number} limit - 0 のときは全件
 * @param {string} mode - 'full' | 'diff'。diff のときはカードが未登録または不足しているセットのみ返す
 */
async function getJapaneseSetsFromDb(limit = 0, mode = "full") {
    let query = supabase
        .from("sets")
        .select("id, api_set_id, tcg_player_id, tcg_player_numeric_id, card_count")
        .eq("language", LANGUAGE)
        .order("release_date", { ascending: false, nullsFirst: false });

    if (limit > 0) query = query.limit(limit);
    else query = query.limit(99999);

    const { data: sets, error } = await query;
    if (error) throw new Error(`セット取得に失敗: ${error.message}`);
    const allSets = sets ?? [];

    if (mode !== "diff" || allSets.length === 0) return allSets;

    // diff: カードが1枚もない、または card_count より少ないセット
    const { data: cardsData } = await supabase
        .from("cards")
        .select("set_id")
        .eq("language", LANGUAGE);
    const cardCountBySet = new Map();
    for (const c of cardsData ?? []) {
        if (c.set_id) {
            cardCountBySet.set(c.set_id, (cardCountBySet.get(c.set_id) ?? 0) + 1);
        }
    }
    return allSets.filter((s) => {
        const count = cardCountBySet.get(s.id) ?? 0;
        const expected = s.card_count ?? 0;
        return count === 0 || (expected > 0 && count < expected);
    });
}

/**
 * 日本語カード取得バッチ（セット単位・順次実行でチェックポイントと整合）
 * NOTE: 現在はチェックポイント整合性のため順次実行。
 * 将来的に rate limit を見ながら chunk + Promise.all に切り替え可能。
 */
export async function fetchJapaneseCards(options = {}) {
    const {
        maxSets = config.batch.maxSetsPerRun,
        fullRun = config.batch.fullRun,
        mode = config.batch.mode,
    } = options;

    const sets = await getJapaneseSetsFromDb(maxSets, mode);
    if (sets.length === 0) {
        if (mode === "diff") {
            log("差分モード: カード未登録のセットはありません。スキップします。");
        } else {
            log(
                "日本語セットがありません。先に batch:sets（fetchJapaneseSets）を実行してください。",
            );
        }
        return { cardsStored: 0 };
    }

    let startIndex = 0;
    if (!fullRun) {
        const lastSetId = await getCheckpoint("cards_japanese");
        if (lastSetId) {
            const idx = sets.findIndex((s) => s.tcg_player_id === lastSetId);
            if (idx >= 0 && idx < sets.length - 1) {
                startIndex = idx + 1;
                log(
                    `続きから再開: ${startIndex + 1}/${
                        sets.length
                    } セット目 (前回: ${lastSetId})`,
                );
            }
        }
    } else {
        await clearCheckpoint("cards_japanese");
    }

    const toProcess = sets.slice(startIndex);
    const includeHistory = false;
    const includeEbay = false;

    let totalCards = 0;

    for (const set of toProcess) {
        const count = await fetchAndStoreCardsForSet(set, {
            includeHistory,
            includeEbay,
        });
        totalCards += count;
        await saveCheckpoint("cards_japanese", set.tcg_player_id);
        log(`セット ${set.tcg_player_id}: ${count} 枚`);
        await sleep(config.batch.delayBetweenRequests);
    }

    if (toProcess.length > 0 && startIndex + toProcess.length >= sets.length) {
        await clearCheckpoint("cards_japanese");
        log("全セット処理完了。チェックポイントをクリアしました。");
    }

    log(`日本語カード取得完了: ${totalCards} 枚`);
    return { cardsStored: totalCards };
}
