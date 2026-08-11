# 民泊 勤怠・給与管理アプリ

民泊運営のスタッフ向け勤怠管理アプリです。打刻・給与計算・シフト・予約管理をスマホから行えます。

## 主な機能

**スタッフ**

- 打刻（出勤 / 休憩に入る / 休憩から戻る / 退勤）
- 給与の確認（日別の金額・今月の合計・内訳）
- シフトの承諾 / 辞退
- 予約カレンダーの閲覧

**管理者**

- シフトの割当（棟の指定つき・複数日一括）
- 時給の設定（スタッフごと・履歴つき）
- 給与ルールの設定（丸め方向・単位・最低保証）
- 勤怠の修正（退勤の押し忘れ対応）
- 予約の登録・編集
- 給与集計（CSV出力）

## セットアップ

### 1. Supabase プロジェクトを作る

[supabase.com](https://supabase.com) でプロジェクトを作成します。

### 2. データベースを構築する

Supabase ダッシュボードの **SQL Editor** を開き、`supabase/migrations/` の SQL を
**番号順に** 実行します（0001 → 0013）。

まとめて実行する場合は、以下でファイルを連結できます。

```bash
cat supabase/migrations/*.sql > /tmp/all.sql
```

### 3. 環境変数を設定する

`.env.example` を `.env.local` にコピーし、値を入れます。

```bash
cp .env.example .env.local
```

| 変数 | 取得場所 |
| --- | --- |
| `SUPABASE_URL` | Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → service_role |
| `NEXT_PUBLIC_SITE_URL` | 本番のURL（開発中は `http://localhost:3000`） |

`NEXT_PUBLIC_` を付けた変数はブラウザに露出します。Supabase の接続情報には**絶対に付けない**でください。

### 4. パスワードリセットの設定

Supabase ダッシュボード → **Authentication → URL Configuration** で、
Redirect URLs に以下を追加します。

```
http://localhost:3000/reset-password
https://あなたのドメイン/reset-password
```

### 5. 最初の管理者を作る

アプリを起動し、Supabase ダッシュボードの **Authentication → Users** から
自分のアカウントを作成します。その後 SQL Editor で以下を実行します。

```sql
UPDATE public.users SET role = 'admin'
  WHERE email = 'あなたのメールアドレス';
```

以降のスタッフ追加・権限変更は管理画面から行えます。

### 6. 起動

```bash
pnpm install
pnpm dev
```

## 開発コマンド

```bash
pnpm dev        # 開発サーバー
pnpm build      # 本番ビルド
pnpm test       # テスト（給与計算・セキュリティ規約）
pnpm typecheck  # 型チェック
pnpm lint       # 静的解析
```

## 給与の計算ルール

```
実労働時間 = (退勤 − 出勤) − 休憩の合計
支給対象   = max(最低保証, 実労働を15分単位で丸めた時間)
支給額     = 支給対象(分) ÷ 60 × 時給   ← 円未満は切り捨て
```

- 丸め方向（切り上げ / 切り捨て）は管理画面で切り替えられます
- 最低保証は **1日あたり**。1日に2回出勤しても保証は1回だけです
- 時給は勤務日時点で有効なものが使われるため、時給改定しても過去分は当時の金額のまま計算されます

初期設定は「15分単位・切り上げ・最低保証2時間」です。

## 設計上の要点

### 打刻状態はデータベースが唯一の正

`localStorage` を使っていません。打刻は押した瞬間に DB へ書き込み、画面を開くたびに
`clock_out IS NULL` のセッションを取得して状態を復元します。

このため、スマホでタブが破棄されても、別の端末で開いても、正しい状態が続きます。
経過時間も保存せず、毎回 `現在時刻 − 出勤時刻 − 休憩` で計算し直すので、
バックグラウンドでタイマーが止まっても表示がズレません。

### 二重打刻はデータベースが弾く

```sql
CREATE UNIQUE INDEX uniq_open_session
  ON work_sessions(user_id) WHERE clock_out IS NULL;
```

未退勤のセッションは1人1件までという制約により、連打・再送・複数端末からの
同時操作が物理的に不可能になっています。休憩も同様の制約があります。

### クライアントは Supabase を知らない

ブラウザ側のコードに Supabase の SDK も接続情報も含まれていません。
認証は httpOnly Cookie で行われ、JavaScript からトークンを読めないため XSS に強い構成です。

データアクセスは全て `/api/*` を経由し、サーバー側で認証・権限チェックを行います。

### 権限は3層で守る

1. `middleware.ts` が未認証リクエストを弾く
2. API が `requireUser` / `requireAdmin` で検証する
3. DB の Row Level Security が最後の砦になる

管理者ロールの変更は `SECURITY DEFINER` 関数経由のみで、
`users.role` への直接更新は列権限で禁止されています。自己昇格ができません。

### 日をまたぐ勤務

`work_date` は出勤時刻の日本時間の日付で固定されます。
22時開始・翌6時退勤の夜勤は、退勤が翌日でも開始日の勤務として計上されます。

## ディレクトリ構成

```
app/
├─ (staff)/          スタッフ向け画面（打刻・給与・シフト）
├─ (admin)/          管理者向け画面
├─ calendar/         予約カレンダー（両者が利用）
├─ api/              API ルート
├─ lib/
│  ├─ domain/        給与計算などの純粋関数（テスト対象）
│  ├─ api/           認証・検証・変換
│  ├─ client/        ブラウザ用の fetch ラッパー
│  └─ supabase/      サーバー専用クライアント
├─ components/       UI コンポーネント
└─ hooks/            打刻状態・経過時間
supabase/migrations/ データベース定義
```

## テスト

給与計算のテストでは、境界値と異常系を確認しています。

```bash
pnpm test
```

- 15分丸めの境界（ちょうど割り切れる場合に切り上げで増やさない）
- 最低保証との比較（1日2回出勤しても保証は1回）
- 円未満の切り捨て
- 日またぎ勤務が正しい月に計上されるか
- 不正データ（退勤 < 出勤、休憩が勤務時間を超過）で落ちないか
- 管理者APIに権限チェックの書き忘れがないか
- クライアントコードに Supabase が混入していないか
