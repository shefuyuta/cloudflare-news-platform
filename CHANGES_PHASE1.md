# NewsHub — Phase 1 変更概要 & Phase 2 セットアップ手順

議論で確定した方針の Phase 1（構造修正）を実装しました。embedding 本格活用は
Phase 2 として差し込み口のみ用意しています。

---

## Phase 1 で入った変更

### 1. 多ラベル分類（データ A + UI 思想 X）

- `lib/fetcher/classifier.ts`
  - `classifyCategoryMulti()` を新設。**主カテゴリ 1 つ + 越境ラベル配列**
    （`"AI"` / `"Cyber"`）を返す。旧 `classifyCategory()` は後方互換で残置。
  - 越境ラベルは STRONG シグナル（キーワード 2 件以上）のときのみ付与。
    弱いヒットでデスクを汚さない保守的設計。
- `app/api/fetch-news/route.ts`
  - 越境ラベルと `sub:*`（サブカテゴリ）を **タグとして** 書き込む。
    スキーマ追加なし（既存 `tags` / `article_tags` を利用）。重複除去済み。
- `lib/db.ts` `listArticles()`
  - `crossLabel` 分岐を追加。`/ai` は `category='ai' OR tag='AI'`、
    `/cybersecurity` は `OR tag='Cyber'` で **越境記事を両デスクに表示**。
  - `listAllTags()` は `isControlTag()` で `sub:*` / `AI` / `Cyber` を
    フィルタチップ一覧から除外。
- `components/news/NewsCard.tsx` + `TagBadge.tsx`
  - `CrossBadge`（`↔ AI` / `↔ Cyber`、上限 2 個）を追加。制御タグは
    `#tag` チップに出さない。

### 2. サブカテゴリの構造修正（早い者勝ち廃止）

- `classifySubcategories()`（多ラベル）と、スコア比較版
  `classifySubcategory()`（主値 1 つ）に置換。
- **修正したバグ**: 旧実装は vulnerability を先に評価し、`exploit` などの
  両義語 1 つでも当たると脆弱性に確定していた。そのため「ランサム被害」
  記事が脆弱性タブに混入していた。新実装は vuln/incident のスコアを
  比較し、同点は incident に倒す（歴史的な脆弱性偏重の是正）。中間ケース
  （脆弱性を悪用したインシデント）は **両サブカテに所属**。
- `/cybersecurity` のサブカテタブは `sub:*` タグで絞り込む方式に変更。

### 3. 重要度スコア / important の全廃

削除・除去したもの:
- `app/important/`（ページ）
- `app/api/score-articles/`, `app/api/slack-briefing/`（ルート）
- `importance_score` 依存: `lib/db.ts`, `lib/types.ts`, `lib/categories.ts`
  (`IMPORTANT_THRESHOLD`), `articles` API, `export`, `ingest`, `retriever`,
  `dashboard` route + `DashboardClient`（重要度分布 UI と Slack/Email 配信
  UI）, `search` ページ + `SearchPage`（重要度ソート / minScore / maxScore）,
  `Header`（scoring ステップ）, `i18n`（important 系キー）, `Sidebar` /
  `MobileDrawer`（`/important` 導線）。
- Dashboard の「本日のブリーフィング」（UI 内生成）は **残置**。ソートを
  `published_at DESC` に変更。
- `TagBadge` の `ImportanceBadge` は削除。

### 4. 既読ラベル Read → Seen/確認済み

- `lib/i18n.ts`: `readArticle` = `"Seen"` / `"確認済み"`、
  `markRead` = `"Mark seen"` / `"確認済みにする"`。
- 挙動（タイトル認知 = 判断済み → 淡色化）は意図通りのため変更なし。

### DB マイグレーション

- `database/migration_multilabel.sql` を実行してください:
  ```
  wrangler d1 execute newshub --file=database/migration_multilabel.sql --remote
  ```
  - `importance_score` カラムと関連インデックスを削除。
  - 既存 cyber 記事の legacy `subcategory` から `sub:*` タグをバックフィル
    （新サブカテタブが旧データでも機能するように）。

### 型チェック

- `npx tsc --noEmit` はクリーン（このパッチ適用後の状態で確認済み）。

---

## Phase 2 セットアップ手順（embedding 本格活用）

Phase 1 では以下の **差し込み口のみ** 用意しました。実際に効かせるには
セットアップが必要です。

### (A) サブカテゴリの embedding 判定

- フック: `lib/fetcher/classifier.ts` の
  `classifySubcategoriesEmbedding(articleVector, refVectors, threshold)`。
  現状は `null` を返し、呼び出し側はキーワード版にフォールバックします。
- 有効化に必要な作業:
  1. **代表ベクトルの生成**: "vulnerability" と "incident" それぞれの
     お手本テキスト（数十件の代表記事、または定義文）を embed し、
     平均ベクトルを算出。`rag_config` か専用テーブルに保存。
  2. fetch/ingest 経路で、記事本文の embedding と各代表ベクトルの
     コサイン類似度を計算し、閾値超えのラベルを付与。
  3. キーワード版と併用（OR）するか置換するかを決める。まずは併用推奨
     （embedding が拾い漏れた明示キーワードを keyword 側が補完）。
- 注意: vuln と incident は意味的に隣接するため、閾値は実データで調整が
  必要。中間ケースは Phase 1 と同様「両ラベル付与」で扱えば境界問題は
  緩和されます。

### (B) セマンティック検索（日英横断）

- 現状の検索は `title/summary/content LIKE '%q%'`（`lib/db.ts`）。
- Vectorize は既に ingest で記事チャンクを保存済み（`app/api/ingest`）。
  検索クエリを 1 回 embed → `env.VECTORIZE.query()` で近傍取得 →
  D1 で本文をハイドレート、という経路に差し替える。
- **生成 LLM のトークンは消費しません**（埋め込み変換のみ）。「ランサム」で
  英語 "ransomware" 記事もヒットする日英横断が実現します。
- 実装は RAG の `lib/rag/retriever.ts` の近傍取得ロジックを検索にも
  再利用するのが最小コスト。

### (C) キーワード外フィルタ

- (B) と同一基盤。あるカテゴリ内で「意味的に近い」記事を拾う機能は、
  検索の embedding 近傍取得をカテゴリ絞り込みと組み合わせるだけ。

### 前提となるバックフィル

- 既存記事に embedding が付いていない場合、`app/api/embed-missing` を
  一巡させてから (A)(B)(C) を有効化してください。

---

## まだやっていないこと（意図的に Phase 2 / 別作業）

- cron による自動 fetch。**分類が正しく動くことを確認してから**追加する、
  という順序合意に従い未着手。`wrangler.toml` に `[triggers]` を足す前に、
  数回手動 fetch して新分類の結果を検証してください。
- メール / Slack 配信（恒久的に自分専用のため不要と決定 → 削除済み）。
- 越境ラベルのembedding化（Phase 2 (A) と同基盤）。
