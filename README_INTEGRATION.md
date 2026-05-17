# NewsHub UI & RAG — 統合手順 (v2)

既存のあなたのスキーマ・型に**合わせた**バージョンです。
スキーマは破壊せず、追加マイグレーションだけ適用します。

## 1. ファイル配置

```
your-repo/
├── app/
│   ├── globals.css                  ← 置き換え
│   ├── layout.tsx                   ← 置き換え
│   ├── page.tsx                     ← 置き換え（トップ）
│   ├── general/page.tsx             ← 新規
│   ├── cybersecurity/page.tsx       ← 新規
│   ├── ai/page.tsx                  ← 新規
│   ├── important/page.tsx           ← 新規（importance_score 横断ビュー）
│   └── api/
│       ├── articles/route.ts        ← 新規（GET 一覧）
│       ├── chat/route.ts            ← 新規（POST RAGチャット, SSE）
│       └── ingest/route.ts          ← 新規（POST 取込, tags正規化+embedding）
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx              ← 置き換え（既存より多機能）
│   │   └── Header.tsx               ← 新規
│   ├── news/
│   │   ├── NewsList.tsx             ← 新規（既存NewsGridの代替）
│   │   ├── NewsCard.tsx             ← 置き換え（必須4要素+重要バッジ）
│   │   ├── FilterTabs.tsx           ← 新規
│   │   └── TagBadge.tsx             ← 新規
│   └── chat/
│       └── AIChatDock.tsx           ← 新規
├── lib/
│   ├── types.ts                     ← 置き換え（NewsArticleは既存形そのまま）
│   ├── categories.ts                ← 新規
│   ├── db.ts                        ← 新規
│   └── rag/
│       ├── config.ts                ← 新規（★ AI動作はここ）
│       ├── embeddings.ts            ← 新規
│       ├── retriever.ts             ← 新規
│       └── chat.ts                  ← 新規
├── database/
│   └── migration.sql                ← 追加マイグレーション（既存スキーマに ADD）
├── tailwind.config.ts
└── wrangler.toml.example
```

### 削除対象（NewsGridはNewsListに置き換えたため）

```bash
rm components/news/NewsGrid.tsx
```

`tsconfig.json` の `@/*` パスエイリアスが無ければ追加：
```json
{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["./*"] } } }
```

## 2. 既存スキーマとの関係

あなたの既存スキーマ (`articles` / `tags` / `article_tags` / `raw_feeds`) は**そのまま使用**します。
本マイグレーションは以下を**追加**するだけ：

| 追加内容 | 用途 |
|---|---|
| `articles.vector_id` カラム | Vectorize ID 参照 |
| `articles.embedded_at` カラム | 埋め込み更新日時 |
| `idx_articles_*` インデックス | カテゴリ/地域/サブカテゴリ別フィルタの高速化 |
| `idx_article_tags_*` インデックス | タグJOIN高速化 |
| `rag_config` テーブル | RAG実行時設定（再デプロイ不要で変更可） |
| `chat_messages` テーブル | チャット履歴（任意） |

既存データには触れません。

## 3. Cloudflare リソース作成

```bash
# D1（既に作成済みならスキップ）
wrangler d1 create newshub

# 追加マイグレーションを流す
wrangler d1 execute newshub --file=database/migration.sql --remote

# Vectorize（次元はembedding_modelに合わせる：bge-base-en-v1.5 → 768）
wrangler vectorize create newshub-index --dimensions=768 --metric=cosine

# wrangler.toml に ID を反映
cp wrangler.toml.example wrangler.toml
```

## 4. ローカル起動

```bash
npm install
npx @opennextjs/cloudflare
npx wrangler pages dev .vercel/output/static
```

## 5. 動作確認

```bash
curl -X POST http://localhost:8788/api/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "articles": [{
      "title": "TEST: Critical Vulnerability in Example Router",
      "url": "https://example.com/cve-2026-0001",
      "source": "BleepingComputer",
      "category": "cybersecurity",
      "subcategory": "vulnerability",
      "tags": ["CVE-2026-0001","router","critical"],
      "summary": "A critical RCE vulnerability...",
      "content": "Full article body here. The longer the better for RAG.",
      "importanceScore": 9,
      "publishedAt": "2026-05-15T10:00:00Z"
    }]
  }'
```

`/cybersecurity` を開くと記事が表示され、★9/10 の重要バッジが付き、
`/important` にも横断表示されます。右下のチャットドックで質問もできます。

## 6. データモデルの取り扱い

### TypeScript ↔ D1 のマッピング

| TypeScript (`NewsArticle`) | D1 column |
|---|---|
| `id` | `id` TEXT |
| `title` / `summary` / `content` / `source` / `url` | 同名 |
| `category` | `category` TEXT |
| `subcategory` | `subcategory` TEXT |
| `region` | `region` TEXT |
| `publishedAt` | `published_at` TEXT (ISO 8601) |
| `importanceScore` | `importance_score` INTEGER |
| `tags` | `article_tags` JOIN `tags` で配列化 |

`region` と `subcategory` は **自由文字列**ですが、UIのフィルタタブは以下の既知値だけ拾います：
- region: `japan` / `us` / `asia` / `europe` / `other`
- subcategory: `vulnerability` / `incident` / `other`

**フェッチャー側でこれらの値に正規化**しておくと、フィルタタブが効きます。
未知の値（例: `region="canada"`）でも記事は表示されますが、タブからは絞り込めません。

### タグ正規化

`/api/ingest` は受け取った `tags: string[]` を：
1. `tags` テーブルに `INSERT OR IGNORE` でname挿入
2. ID を取得して `article_tags` にリンク作成
3. 既存リンクは `DELETE` → `INSERT` で置換

なので同じ記事を何度ingestしても安全です。

## 7. RAG 設計のポイント

### ① 設定は一箇所に集約
モデル・top-k・温度・システムプロンプトは **`lib/rag/config.ts` の `DEFAULTS`** にあります。
さらに **D1の `rag_config` テーブル** に行を入れると、再デプロイ無しで上書きできます：

```sql
UPDATE rag_config SET value = '@cf/meta/llama-3.3-70b-instruct-fp8-fast' WHERE key = 'llm_model';
UPDATE rag_config SET value = '8' WHERE key = 'top_k';
```

### ② 検索スコープはUIと連動
`AIChatDock.tsx` の `useViewContext()` が現在URL（`/cybersecurity?subcategory=vulnerability` 等）を読み、
そのまま `/api/chat` の `context` フィールドに渡します。
`retriever.ts` の `buildFilter()` がこれを Vectorize の `filter` に変換するので、
**「サイバーセキュリティ > 脆弱性」を見ながら質問すれば、その範囲だけが検索対象** になります。

### ③ メタデータ設計
Vectorize ベクトルに付与している metadata：
- `article_id` — D1 行へのリンク
- `category` / `region` / `subcategory` — フィルタ用
- `text` — 取得時のスニペット復元用

新しいフィルタ軸を増やしたい場合：
1. `articles` に列追加（ALTER TABLE）
2. `app/api/ingest/route.ts` で metadata に含める
3. `lib/rag/retriever.ts` の `buildFilter()` に分岐追加
4. `lib/types.ts` の `ChatRequest.context` に追加

### ④ チャンク戦略は差し替え可能
`lib/rag/embeddings.ts` の `chunk()` を入れ替えるだけで、トークンベース/見出し分割などに変更できます。

### ⑤ 引用（citations）はSSEの最初のイベント
`/api/chat` のレスポンス：
```
event: citations
data: [{...}, {...}]

data: {"response":"…"}
data: {"response":"…"}
...
```
別のLLM（OpenAI互換 等）に差し替えてもこのフォーマットを保てばUIを変えなくて済みます。

## 8. デザイン規約

| 要素 | 配色 |
|---|---|
| 背景 | `#FAFAF9`（オフホワイト） |
| 本文 | `#0A0A0A`（ニアブラック） |
| 罫線 | `#E4E4E7`（ヘアライン） |
| **Generalバッジ** | 青系 |
| **Cybersecurityバッジ** | 赤系 |
| **AIバッジ** | 紫系 |
| **重要バッジ★** | 琥珀系（score ≥ 7） |
| 地域/サブカテゴリ/タグ | モノクロ |

カテゴリと重要度バッジ以外はすべてモノクロで統一。
フォント: 見出し **Fraunces**（セリフ）、UI **Geist**、コード **Geist Mono**。

## 9. 必須要件チェック

- ✅ 一般ニュースを地域別（日本/アメリカ/アジア/ヨーロッパ/その他）
- ✅ サイバーセキュリティを脆弱性/インシデント/その他で分類
- ✅ AIニュース独立メニュー
- ✅ 3カテゴリでメニューを分割、各画面にサブフィルタタブ + タグチップ
- ✅ ニュース項目に **タイトル / タグ / プラットフォーム / 参考URL** を必ず表示
- ✅ 白基調モノクロデザイン、アクセントはカテゴリ・重要度バッジのみ
- ✅ Cloudflare AIボット統合（floating dock、現在の表示範囲を自動でRAGにスコープ）
- ✅ RAG設定は `lib/rag/config.ts` + D1 `rag_config` テーブルで柔軟に変更可能
- ✅ 既存スキーマ・型・コンポーネント構造（`components/layout/`, `components/news/`）に整合
- ✅ `importance_score` を活用した重要記事バッジ + クロスカット表示
