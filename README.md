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
| BATCH_MAX_SETS | - | 取得するセット数。**0=全セット**（デフォルト）。正の数で制限 |
| BATCH_CARDS_PER_REQUEST | - | 1リクエストあたりのカード数（デフォルト: 50） |
| BATCH_FULL_RUN | - | **true** のときチェックポイントを無視し先頭から実行。未設定時は**前回の続きから再開** |
| API_MAX_RETRIES | - | API 失敗時のリトライ回数（429・5xx・ネットワークエラー）。デフォルト 3、0 で無効 |
| API_RETRY_DELAY_MS | - | リトライ初回待機ミリ秒（指数バックオフ）。デフォルト 5000 |

### 3. Supabase テーブルの作成

Supabase ダッシュボードの **SQL Editor** でマイグレーションを順に実行するか、Supabase CLI で一括適用してください。

```bash
# Supabase CLI を使用する場合（全マイグレーション適用）
supabase db push
```

マイグレーション一覧:
- `20250214000000_initial_schema.sql` - sets, cards, card_prices, batch_runs
- `20250214100000_add_card_price_history.sql` - card_price_history（価格履歴）
- `20250214200000_add_card_ebay_prices.sql` - card_ebay_prices, card_ebay_price_history（PSA/eBay 価格・履歴）
- `20250214300000_add_sealed_products_and_population.sql` - sealed_products, sealed_product_price_history
- `20250214400000_drop_card_population.sql` - card_population 削除（既存環境用）
- `20250214500000_add_jpy_price_columns.sql` - 価格テーブルに JPY カラム追加
- `20250214600000_add_batch_checkpoints.sql` - バッチ再開用チェックポイント

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

各テーブルのカラム定義は **[docs/テーブル定義.md](docs/テーブル定義.md)** に日本語でまとめてあります。

## バッチの実行

```bash
# フルバッチ（セット → カード → シールド商品）※デフォルト
npm run batch

# セットのみ取得
npm run batch:sets

# カードのみ取得（DB のセットを参照）
npm run batch:cards

# シールド商品のみ取得
npm run batch:sealed

# 同様に --type オプションで指定
node src/index.js --type sets
node src/index.js --type cards
node src/index.js --type sealed
node src/index.js --type full
```

## バッチ処理の流れ（1回で全取得）

`BATCH_MAX_SETS=0`（デフォルト）のとき、**1回のフルバッチで以下をすべて取得**します。

1. **sets**: API から**全セット**を取得し、`sets` に upsert（`language=japanese`）
2. **cards**: DB の**全セット**を対象に、各セットの**全カード**をページネーションで取得（日本語カード・価格相場・価格履歴・PSA価格・PSA価格履歴）→ `cards`, `card_prices`, `card_price_history`, `card_ebay_prices`, `card_ebay_price_history` に upsert
3. **sealed**: DB の**全セット**を対象に、各セットの**全シールド商品**をページネーションで取得（BOX・パック情報と価格・価格履歴）→ `sealed_products`, `sealed_product_price_history` に upsert
4. **full**: 1 → 2 → 3 の順で実行

`BATCH_MAX_SETS` に正の数（例: 5）を指定すると、直近 N セットのみ対象になります。

## 途中終了からの再開

カード・シールド商品バッチは、**途中で終了（エラー・Ctrl+C・クレジット切れなど）しても、再度実行すると続きから再開**します。

- 最後に成功したセット ID を `batch_checkpoints` テーブルに保存し、次回はその次のセットから処理します。
- **先頭からやり直したいとき**は、環境変数 `BATCH_FULL_RUN=true` を指定して実行してください（このときチェックポイントはクリアされます）。
- 全セット処理が完了するとチェックポイントは自動でクリアされ、次回は先頭から実行されます。

## API リトライ

API 呼び出しで **429（レート制限）・5xx（サーバーエラー）・ネットワークエラー** が発生した場合、自動でリトライします。

- **回数**: `API_MAX_RETRIES`（デフォルト 3）。0 でリトライなし。
- **待機**: 指数バックオフ（初回 `API_RETRY_DELAY_MS` ms、2回目は2倍、3回目は4倍…）。デフォルト 5000ms。
- リトライ時はコンソールに `[API] リトライ (1/3): 429 - 5s 後に再試行: ...` のように出力されます。
- 4xx（429 以外）はクライアントエラーのためリトライしません。

## クレジット消費の目安

- セット: 100件/リクエストで取得、クレジットは少なめ
- カード（履歴 + eBay）: **1枚あたり 3 クレジット**（基本1 + 履歴1 + eBay1）。1リクエスト最大50枚のため、セットごとにページネーションで全件取得
- **シールド商品**: 返却数 × (1 + includeHistory)。1リクエスト最大200件、セットごとにページネーションで全件取得
- 全データ取得時は**数万〜数十万クレジット**になるため、API プラン以上を推奨

## プロジェクト構成

```
poke-card-daily-batch/
├── src/
│   ├── api/pokemonPriceTracker.js  # API クライアント
│   ├── db/supabase.js              # Supabase クライアント
│   ├── batch/
│   │   ├── fetchSets.js            # セット取得バッチ
│   │   ├── fetchCards.js           # カード・価格取得バッチ
│   │   ├── fetchSealedProducts.js  # シールド商品取得バッチ
│   │   ├── checkpoint.js           # 続きから再開用チェックポイント
│   │   └── index.js                # バッチオーケストレータ
│   ├── config.js                   # 設定
│   └── index.js                    # エントリーポイント
├── supabase/migrations/            # DB マイグレーション
├── .env.example
└── package.json
```

---

# Pokemon Price Tracker API ドキュメント

TCGPlayer のポケモンカード価格データ、eBay のグレードカード売却データにアクセスする API のリファレンスです。

## 概要

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

## 認証

すべての API リクエストで `Authorization` ヘッダーに Bearer トークンが必要です。

```
Authorization: Bearer YOUR_API_KEY
```

API キーは [pokemonpricetracker.com/api](https://pokemonpricetracker.com/api) で無料取得できます。

---

## レート制限

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

## プラン別機能

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

## エンドポイント

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

## エラーレスポンス

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

## リクエスト例

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

## 参考リンク

- API キー取得: [pokemonpricetracker.com/api](https://pokemonpricetracker.com/api)
