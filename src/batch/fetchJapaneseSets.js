/**
 * ① 日本語セット取得バッチ
 * すべての日本語セットを DB に保存。API の id を api_set_id に保存し、② カード取得で GET /cards?setId=api_set_id に使用する。
 * set_code, normalized_series_key は 日本語↔英語セット マッチング用。
 */
import { getSets, sleep } from '../api/pokemonPriceTracker.js';
import { supabase } from '../db/supabase.js';
import { config } from '../config.js';
import { log } from './utils/logger.js';
import { extractSetCode, normalizeSeriesKey } from '../utils/setNormalize.js';

const LANGUAGE = 'japanese';

function mapSetToDb(set) {
  const name = set.name ?? '';
  const series = set.series ?? null;
  const numericId = set.tcgPlayerNumericId ?? set.tcg_player_numeric_id;
  const tcgId = String(set.tcgPlayerId ?? set.id ?? set._id ?? '');
  return {
    api_set_id: set.id ?? set._id ?? null,
    tcg_player_id: tcgId,
    tcg_player_numeric_id: numericId ?? null,
    name,
    series,
    set_code: extractSetCode(name),
    normalized_series_key: normalizeSeriesKey(series, name),
    release_date: set.releaseDate ?? null,
    card_count: set.cardCount ?? 0,
    image_cdn_url: set.imageCdnUrl ?? null,
    image_cdn_url_200: set.imageCdnUrl200 ?? null,
    image_cdn_url_400: set.imageCdnUrl400 ?? null,
    image_cdn_url_800: set.imageCdnUrl800 ?? null,
    price_guide_url: set.priceGuideUrl ?? null,
    has_price_guide: set.hasPriceGuide ?? true,
    no_price_guide_reason: set.noPriceGuideReason ?? null,
    language: LANGUAGE,
    updated_at: new Date().toISOString(),
  };
}

/**
 * 日本語セット一覧を取得して Supabase に保存（upsert: tcg_player_id + language 基準）
 * tcg_player_id は TCGPlayer の安定した識別子。差分時は DB に存在しない tcg_player_id のみ保存。
 * 毎日 or 週1 で実行でOK
 * @param {Object} options - maxSets, mode: 'full' | 'diff'
 */
export async function fetchJapaneseSets(options = {}) {
  const { maxSets = config.batch.maxSetsPerRun, mode = config.batch.mode } = options;
  let totalFetched = 0;
  let offset = 0;
  const limit = 100;

  log(mode === 'diff' ? '日本語セット取得を開始（差分モード）' : '日本語セット取得を開始');

  while (true) {
    const response = await getSets({
      language: LANGUAGE,
      limit,
      offset,
      sortBy: 'releaseDate',
      sortOrder: 'desc',
    });

    const raw = response.data ?? response;
    const sets = Array.isArray(raw) ? raw : [raw];
    if (!sets.length) break;

    let records = sets
      .map(mapSetToDb)
      .filter((r) => r.api_set_id != null && r.tcg_player_id);

    if (mode === 'diff' && records.length > 0) {
      const tcgPlayerIds = [...new Set(records.map((r) => r.tcg_player_id).filter(Boolean))];
      const { data: existing } = await supabase
        .from('sets')
        .select('tcg_player_id')
        .eq('language', LANGUAGE)
        .in('tcg_player_id', tcgPlayerIds);
      const existingTcgIds = new Set((existing ?? []).map((r) => r.tcg_player_id).filter(Boolean));
      records = records.filter((r) => !existingTcgIds.has(r.tcg_player_id));
      if (records.length === 0) {
        log(`セット ${offset + 1}-${offset + sets.length} 件は全て既存のためスキップ`);
        if (sets.length < limit) break;
        log('差分モード: 既存セットのみのページに到達。終了します。');
        break;
      }
    }

    if (records.length === 0) {
      offset += limit;
      continue;
    }

    const { error } = await supabase.from('sets').upsert(records, {
      onConflict: ['tcg_player_id', 'language'],
      ignoreDuplicates: false,
    });

    if (error) {
      throw new Error(`セットの保存に失敗: ${error.message}`);
    }

    totalFetched += records.length;
    log(`セット ${records.length} 件保存 (合計: ${totalFetched})`);

    if (sets.length < limit) break;
    if (maxSets > 0 && totalFetched >= maxSets) break;

    offset += limit;
    await sleep(config.batch.delayBetweenRequests);
  }

  log(`日本語セット取得完了: ${totalFetched} 件`);
  return totalFetched;
}
