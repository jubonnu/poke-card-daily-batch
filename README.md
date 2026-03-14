# poke-card-daily-batch

Pokemon Price Tracker API からデータを取得し、Supabase に保存する Node.js バッチ処理です。

## 技術スタック

- **Node.js** (ES Modules)
- **Supabase** (PostgreSQL)
- **Pokemon Price Tracker API**

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数

`.env.example` を `.env` にコピーし、値を設定してください。

```bash
cp .env.example .env
```

| 変数名 | 必須 | 説明 |
|--------|------|------|
| POKEMON_API_KEY | ○ | [pokemonpricetracker.com/api](https://pokemonpricetracker.com/api) で取得 |
| SUPABASE_URL | ○ | Supabase プロジェクト URL |
| SUPABASE_SERVICE_ROLE_KEY | ○ | Supabase サービスロールキー（RLS をバイパス） |
| BATCH_MAX_SETS | - | 取得するセット数。**0=全セット**（デフォルト） |
| BATCH_CARDS_PER_REQUEST | - | 1リクエストあたりのカード数（デフォルト: 50） |
| BATCH_DELAY_MS | - | リクエスト間の待機ミリ秒（デフォルト: 2000） |
| BATCH_FULL_RUN | - | **true** のときチェックポイントを無視し先頭から実行 |
| BATCH_MODE | - | `full`（全取得）または `diff`（差分）。デフォルト: full |
| USD_JPY_RATE | - | USD→JPY 為替レート（デフォルト: 200） |
| API_MAX_RETRIES | - | API 失敗時のリトライ回数。デフォルト 3、0 で無効 |
| API_RETRY_DELAY_MS | - | リトライ初回待機ミリ秒（指数バックオフ）。デフォルト 5000 |

### 3. Supabase テーブルの作成

Supabase ダッシュボードの **SQL Editor** でマイグレーションを実行するか、Supabase CLI で適用してください。

```bash
# Supabase CLI を使用する場合
supabase db push
```

**マイグレーション**:
- `20250309000000_consolidated_schema.sql` — 全テーブル（sets, cards, 価格系, sealed, batch_runs, batch_checkpoints）を一括作成

> **既存データベースがある場合**: 以前のマイグレーションを適用済みの環境では、`supabase db reset` でリセットしてから適用するか、スキーマが既に揃っていればそのまま運用できます。

## テーブル設計

| テーブル | 説明 |
|----------|------|
| **sets** | ポケモンTCGセット（名前、シリーズ、リリース日など）※日本語 |
| **cards** | ポケモンカード（名前、レアリティ、セット情報など）※日本語のみ |
| **card_prices** | 日次価格スナップショット（market_price, low_price, 日付） |
| **card_price_history** | TCG 価格履歴（API includeHistory で取得） |
| **card_ebay_prices** | PSA/CGC/BGS/SGC 等のグレード現在価格（eBay 売却データ） |
| **card_ebay_price_history** | PSA 等のグレード価格履歴 |
| **sealed_products** | パック・シールド商品（ボックス、ETB、バンドル等） |
| **sealed_product_price_history** | シールド商品の価格履歴 |
| **batch_runs** | バッチ実行ログ（冪等性・監視用） |
| **batch_checkpoints** | 途中再開用チェックポイント |

各テーブルのカラム定義は **[docs/テーブル定義.md](docs/テーブル定義.md)** にまとめてあります。

> **日付のタイムゾーン**: `price_date` 等の日付は **日本時間（JST）** で記録されます。GitHub Actions で 10:00 JST 実行時も正しい日付が保存されます。

## バッチの実行

### 全取得（フル）と差分

| 種別 | 説明 |
|------|------|
| **全取得** | 対象データを全て取得。初回・再同期・手動実行向け |
| **差分** | 新規・未登録・本日未取得のもののみ取得。日次自動実行向け |

### コマンド一覧

```bash
# 日次差分バッチ（sets → cards → prices → sealed を順に差分モードで実行）
npm run batch:diff

# フルバッチ（① セット → ② カード → ③ 価格・履歴・PSA）※デフォルト
npm run batch

# 個別・全取得
npm run batch:sets
npm run batch:cards
npm run batch:prices
npm run batch:sealed

# 個別・差分
npm run batch:sets:diff
npm run batch:cards:diff
npm run batch:prices:diff
npm run batch:sealed:diff

# --type オプション
node src/index.js --type diff
node src/index.js --type full
node src/index.js --type sets --mode diff
```

### 推奨運用

| 頻度 | コマンド | 目的 |
|------|----------|------|
| **日次** | `npm run batch:diff` | 新規・本日未取得のデータを取得 |
| **週次** | `npm run batch:sets` | sets のメタデータ更新（名前・card_count 等）を反映 |
| **手動** | `npm run batch:full` + `npm run batch:sealed` | 初回セットアップ・全件再同期 |

**GitHub Actions** で毎日 10:00 JST に `batch:diff` が自動実行されます。リポジトリの **Settings > Secrets and variables > Actions** に `POKEMON_API_KEY`、`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` を設定してください。ワークフロー例は `.github/workflows/daily-batch.yml`、cron 例は **[docs/cron-example.sh](docs/cron-example.sh)** を参照してください。

### 差分モードの定義

| バッチ | 差分の対象 |
|--------|------------|
| **sets** | DB に未登録のセット（tcg_player_id が存在しないもの） |
| **cards** | カードが 0 件、または card_count より少ないセット |
| **prices** | card_prices（本日）・card_price_history・card_ebay_prices・card_ebay_price_history のいずれかに未保存のカード。**diff 時は sets.release_date >= 2016-01-01 のセットに属するカードのみ対象** |
| **sealed** | 本日の sealed_product_price_history に未登録の商品 |

### 差分バッチ（batch:diff）の実行内容

`npm run batch:diff` は **prices のみ** を実行します（sets / cards / sealed は実行しません）。

- 対象: `sets.release_date >= 2016-01-01` のセットに属するカードのうち、本日価格未登録のもの

## バッチ処理の流れ（3段階＋差分更新）

日本語カードは **① セット → ② カード → ③ 価格・履歴・PSA** の順が必須です。

1. **① sets（日本語セットのみ）**  
   `GET /api/v2/sets?language=japanese` で全日本語セットを取得。`tcg_player_id` を upsert 基準に、`api_set_id`・`tcg_player_numeric_id` を保存（② で `setId` に使用）。毎日 or 週1 でOK。

2. **② cards（日本語カード）**  
   DB の `sets`（`language=japanese`）を参照し、各セットごとに  
   `GET /api/v2/cards?language=japanese&setId={tcg_player_numeric_id or api_set_id}&fetchAllInSet=true` で取得。  
   カード情報のみ取得（価格・履歴・PSA は ③ で別途取得）。  
   `cards.set_id` = `sets.id`（UUID）、`cards.tcg_player_id` = TCGPlayer ID（③ 価格取得で使用）。

3. **③ prices（価格・履歴・PSA）**  
   `cards` に存在する全日本語カード（`tcg_player_id` あり）を対象。  
   カード1枚単位で `GET /api/v2/cards?language=japanese&tcgPlayerId={id}&includeHistory=true&includeEbay=true&days=180` を実行し、価格・価格履歴・PSA価格・PSA価格履歴を取得。為替（USD→JPY）はバッチ保存時に取得し、`price_jpy` も保存。daily or weekly 推奨。

4. **full**  
   ① → ② → ③ の順で実行。

5. **sealed（シールド商品）**  
   `GET /api/v2/sealed-products?language=japanese&search={term}&limit=100` を検索ワードで実行し、シールド商品を取得。DB の sets は不要。

`BATCH_MAX_SETS` に正の数（例: 5）を指定すると、①・② で直近 N セットのみ対象になります。

## 途中終了からの再開

カード・価格・シールド商品バッチは、**途中で終了（エラー・Ctrl+C・クレジット切れなど）しても、再度実行すると続きから再開**します。

- **カード**: 最後に成功したセット ID を `batch_checkpoints` に保存。
- **価格**: 最後に成功したカードの `tcg_player_id` を保存。
- **シールド**: 最後に成功した検索ワードのインデックスを保存。
- **先頭からやり直したいとき**は、環境変数 `BATCH_FULL_RUN=true` を指定して実行してください（このときチェックポイントはクリアされます）。
- 全件処理が完了するとチェックポイントは自動でクリアされ、次回は先頭から実行されます。

## トラブルシューティング

### ② カード取得でセットごとに 0 枚になる

**調査結果**: バッチは `api_set_id`（MongoDB 形式）を正しく API に送っており、レスポンスも `{ data: [], metadata }` の形で返ってきます。**API が `language=japanese` ＋ `setId=<api_set_id>` で空配列を返している**状態です。

- **想定される原因**
  1. Pokemon Price Tracker API 側で、日本語カードがセット単位では登録されていない（または別 ID 体系になっている）
  2. 対象セットが日本語版としてカードデータを持っていない

- **確認方法**
  - 同じ `setId` で `language=english` を指定して API を直接叩き、カードが返るか確認する。
  - API 提供元のドキュメントやサポートで「日本語カードをセット単位で取得する方法」を確認する。

- バッチ側の実装（`setId=tcg_player_numeric_id`（tcgPlayerNumericId）・`language=japanese`）は仕様どおりです。

## API リトライ

API 呼び出しで **429（レート制限）・5xx（サーバーエラー）・ネットワークエラー** が発生した場合、自動でリトライします。

- **回数**: `API_MAX_RETRIES`（デフォルト 3）。0 でリトライなし。
- **待機**: 指数バックオフ（初回 `API_RETRY_DELAY_MS` ms、2回目は2倍、3回目は4倍…）。デフォルト 5000ms。
- リトライ時はコンソールに `[API] リトライ (1/3): 429 - 5s 後に再試行: ...` のように出力されます。
- 4xx（429 以外）はクライアントエラーのためリトライしません。

## クレジット消費の目安

- セット: 100件/リクエストで取得、クレジットは少なめ
- カード（履歴 + eBay）: **1枚あたり 3 クレジット**（基本1 + 履歴1 + eBay1）。1リクエスト最大50枚のため、セットごとにページネーションで全件取得
- **シールド商品**: 返却数 × (1 + includeHistory)。`GET /sealed-products?language=japanese&search={term}&limit=100` を複数検索ワードで実行し全件取得
- 全データ取得時は**数万〜数十万クレジット**になるため、API プラン以上を推奨

## プロジェクト構成

```
poke-card-daily-batch/
├── src/
│   ├── api/pokemonPriceTracker.js   # API クライアント
│   ├── db/supabase.js               # Supabase クライアント
│   ├── batch/
│   │   ├── fetchJapaneseSets.js     # 日本語セット取得バッチ
│   │   ├── fetchJapaneseCards.js    # 日本語カード取得バッチ
│   │   ├── fetchJapanesePrices.js   # 価格・履歴・PSA取得バッチ
│   │   ├── fetchSealedProducts.js   # シールド商品取得バッチ
│   │   ├── checkpoint.js            # 続きから再開用チェックポイント
│   │   ├── utils/logger.js          # ログ出力
│   │   └── index.js                 # バッチオーケストレータ
│   ├── utils/                        # 日付・配列・通貨などのユーティリティ
│   ├── config.js                    # 設定
│   └── index.js                     # エントリーポイント
├── supabase/migrations/             # DB マイグレーション（1ファイル）
├── .github/workflows/               # GitHub Actions（日次自動実行）
├── docs/                            # テーブル定義・cron 例
├── .env.example
└── package.json
```

---

## 付録: Pokemon Price Tracker API リファレンス

TCGPlayer のポケモンカード価格データ、eBay のグレードカード売却データにアクセスする API のリファレンスです。

### 概要

- **ベースURL**: `https://www.pokemonpricetracker.com/api/v2`
- **認証**: すべてのリクエストで Bearer トークンが必要
- **主な機能**:
  - 23,000+ 英語カードの日次価格更新
  - 日本語カード対応
  - シールド商品（ボックス、ETB、バンドル）
  - eBay のグレードカード売却（PSA、CGC、BGS、SGC など）
  - 補間付き価格履歴
  - eBay タイトルパースによるカード特定

---

### 認証

すべての API リクエストで `Authorization` ヘッダーに Bearer トークンが必要です。

```
Authorization: Bearer YOUR_API_KEY
```

API キーは [pokemonpricetracker.com/api](https://pokemonpricetracker.com/api) で無料取得できます。

---

### レート制限

クレジットベースのレート制限システムを採用しています。

### プラン別制限

| プラン | 月額 | 日次クレジット | 分あたりコール数 |
|--------|------|----------------|------------------|
| Free | $0 | 100 | 60 |
| API | $9.99 | 20,000 | 60 |
| Business | $99 | 200,000 | 200 |

### クレジットコスト

| 操作 | コスト |
|------|--------|
| 基本カードクエリ | 1クレジット/枚 |
| 価格履歴付き | +1クレジット/枚 |
| eBay データ付き | +1クレジット/枚 |
| タイトルパース | 2クレジット（fuzzy +1、長文 +1、maxSuggestions>5 で +1） |
| Population | 2クレジット/枚 |

### レスポンス制限

| エンドポイント | 制限 |
|----------------|------|
| カード（標準） | 最大 200 枚 |
| カード（履歴付き） | 最大 100 枚 |
| カード（eBay 付き） | 最大 50 枚 |
| カード（履歴 + eBay） | 最大 50 枚 |
| Population | 最大 100 枚/リクエスト、tcgPlayerIds は最大 50 ID |

---

### プラン別機能

| 機能 | Free | API | Business |
|------|------|-----|----------|
| 履歴ウィンドウ | 3日 | 6ヶ月 | 12ヶ月+ |
| API キー数 | 1 | 最大5 | 無制限 |
| 日本語カード | × | ○ | ○ |
| グレード価格（PSA/CGC/BGS/SGC） | × | ○ | ○ |
| eBay 売却詳細（オークション/BIN） | × | × | ○ |
| Population | × | × | ○ |
| 商用利用 | × | × | ○ |
| サポート | コミュニティ | メール（24h） | 優先対応 |

---

### エンドポイント

### 1. GET /cards — カード検索・価格取得

ポケモンカードをフィルタ・ソートで取得。オプションで履歴・eBay データを含む。

**クレジット**: `返却枚数 × (1 + includeHistory + includeEbay)`

#### クエリパラメータ

| パラメータ | 型 | デフォルト | 説明 |
|------------|-----|-----------|------|
| language | string | english | `english` / `japanese` |
| tcgPlayerId | string | - | 特定カードを TCGPlayer ID で取得（単一オブジェクトで返却） |
| cardId | string | - | tcgPlayerId のエイリアス |
| setId | string | - | セット ID でフィルタ |
| set | string | - | セット名で検索（部分一致） |
| search | string | - | 複合検索（名前、セット名、番号、レアリティ、タイプ） |
| rarity | string | - | レアリティでフィルタ |
| cardType | string | - | `Pokemon` / `Trainer` / `Energy` |
| artist | string | - | アーティストでフィルタ |
| minPrice | number | - | 最低価格（USD） |
| maxPrice | number | - | 最高価格（USD） |
| printing | string | - | バリアント（1st Edition, Unlimited, Holofoil など） |
| condition | string | - | 状態（Near Mint, Lightly Played など） |
| includeHistory | boolean | false | 価格履歴を含む（+1クレジット/枚） |
| includeEbay | boolean | false | eBay データを含む（+1クレジット/枚） |
| includeBoth | boolean | false | 両方を含む省略記法 |
| days | integer | 30 | 履歴の日数（1-365） |
| maxDataPoints | integer | 365 | 履歴の最大ポイント数（1-1000） |
| fetchAllInSet | boolean | false | セット内全カード取得（セットフィルタ必須） |
| sortBy | string | cardNumber | `name` / `cardNumber` / `price` |
| sortOrder | string | desc | `asc` / `desc` |
| limit | integer | 50 | 1-200 |
| offset | integer | 0 | ページネーション用 |

#### マルチワード検索例

```
search=charizard base set          → ベースセットのリザードン
search=pikachu 4/102               → 番号で検索
search=umbreon ex unseen forces    → セット内のバリアント検索
```

#### レスポンス例

```json
{
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "tcgPlayerId": "233294",
    "name": "Charizard",
    "setName": "Base Set",
    "cardNumber": "4",
    "totalSetNumber": "102",
    "rarity": "Holo Rare",
    "cardType": "Pokemon",
    "pokemonType": "Fire",
    "prices": {
      "market": 420,
      "low": 350,
      "listings": 156,
      "sellers": 42,
      "primaryCondition": "Near Mint",
      "primaryPrinting": "Holofoil",
      "lastUpdated": "2024-01-15T12:00:00Z"
    },
    "imageCdnUrl": "https://tcgplayer-cdn.tcgplayer.com/product/233294_in_800x800.jpg"
  },
  "metadata": {
    "total": 1,
    "count": 1,
    "limit": 1,
    "offset": 0,
    "hasMore": false,
    "language": "english"
  }
}
```

---

### 2. GET /sets — セット一覧

ポケモン TCG セット情報を取得。

#### クエリパラメータ

| パラメータ | 型 | デフォルト | 説明 |
|------------|-----|-----------|------|
| language | string | english | `english` / `japanese` |
| search | string | - | セット名で検索 |
| series | string | - | シリーズでフィルタ |
| sortBy | string | releaseDate | `name` / `releaseDate` / `cardCount` / `createdAt` |
| sortOrder | string | desc | `asc` / `desc` |
| limit | integer | 100 | 1-500 |
| offset | integer | 0 | ページネーション用 |

---

### 3. GET /sealed-products — シールド商品

 booster boxes、ETB、バンドルなどのシールド商品を取得。

**クレジット**: `返却数 × (1 + includeHistory)`

#### クエリパラメータ

| パラメータ | 型 | デフォルト | 説明 |
|------------|-----|-----------|------|
| language | string | english | `english` / `japanese` |
| tcgPlayerId | string | - | 特定商品を ID で取得 |
| setId | string | - | セット ID でフィルタ |
| set | string | - | セット名で検索 |
| search | string | - | 商品名で検索 |
| minPrice | number | - | 最低価格（USD） |
| maxPrice | number | - | 最高価格（USD） |
| includeHistory | boolean | false | 価格履歴を含む |
| days | integer | 30 | 履歴の日数 |
| fetchAllInSet | boolean | false | セット内全商品を取得 |
| sortBy | string | name | `name` / `price` / `lastScrapedAt` |
| sortOrder | string | desc | `asc` / `desc` |
| limit | integer | 50 | 1-200 |
| offset | integer | 0 | ページネーション用 |

---

### 4. GET /population — グレード人口データ（GemRate）

PSA、BGS、CGC、SGC のグレード人口データを取得。**Business プランのみ**。

**クレジット**: 2クレジット/枚

#### クエリパラメータ

| パラメータ | 型 | デフォルト | 説明 |
|------------|-----|-----------|------|
| tcgPlayerId | string | - | 単一カードの人口データ |
| tcgPlayerIds | string | - | カンマ区切り ID（最大 50） |
| language | string | english | `english` / `japanese` |
| minPopulation | integer | - | 最低総人口でフィルタ |
| grader | string | - | `PSA` / `BGS` / `CGC` / `SGC` |
| minGemRate | number | - | 最低ジェム率（0-100） |
| limit | integer | 20 | 1-100 |
| offset | integer | 0 | ページネーション用 |

---

### 5. POST /parse-title — eBay タイトルパース

eBay リスティングタイトルからカード情報を抽出し、DB と照合。

**クレジット**: 基本 2（fuzzy +1、長文 +1、maxSuggestions>5 で +1）

#### リクエストボディ（JSON）

```json
{
  "title": "Pokemon PSA 10 Charizard VMAX Rainbow Rare 074/073 Champions Path",
  "options": {
    "fuzzyMatching": true,
    "maxSuggestions": 5
  }
}
```

| フィールド | 型 | 必須 | 説明 |
|------------|-----|------|------|
| title | string | ○ | パースするタイトル（3-500文字） |
| options.fuzzyMatching | boolean | - | 曖昧マッチング（+1クレジット） |
| options.maxSuggestions | integer | - | 最大マッチ数 1-10（>5 で +1クレジット） |

---

### エラーレスポンス

共通のエラー形式:

```json
{
  "error": "エラーコード",
  "message": "人間が読めるエラーメッセージ",
  "details": {}
}
```

| ステータス | 説明 |
|------------|------|
| 400 | 不正リクエスト（必須フィルタ欠落、不正パラメータ） |
| 401 | 認証エラー（無効または欠落した API キー） |
| 429 | レート制限超過 |
| 500 | サーバーエラー |

---

### リクエスト例

### カード検索（cURL）

```bash
curl 'https://www.pokemonpricetracker.com/api/v2/cards?language=english&search=charizard%20base%20set&limit=10' \
  --header 'Authorization: Bearer YOUR_API_KEY'
```

### セット一覧

```bash
curl 'https://www.pokemonpricetracker.com/api/v2/sets?search=scarlet%20violet&limit=100' \
  --header 'Authorization: Bearer YOUR_API_KEY'
```

### タイトルパース

```bash
curl https://www.pokemonpricetracker.com/api/v2/parse-title \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --data '{"title": "Pokemon PSA 10 Charizard VMAX Rainbow Rare 074/073 Champions Path"}'
```

---

### 参考リンク

- API キー取得: [pokemonpricetracker.com/api](https://pokemonpricetracker.com/api)
