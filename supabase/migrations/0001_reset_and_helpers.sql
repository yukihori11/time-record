-- ============================================================
-- 0001: 旧スキーマの破棄と共通ヘルパー
-- ============================================================

-- 旧テーブルを破棄（タイマーアプリ時代の遺産）
DROP TABLE IF EXISTS time_records CASCADE;
DROP FUNCTION IF EXISTS set_user_id(UUID) CASCADE;

-- anon ロールには何も触らせない（認証必須アプリのため）
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- ------------------------------------------------------------
-- updated_at 自動更新
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 管理者判定
--
-- is_admin() と is_active_user() は users テーブルの列を参照するため、
-- テーブルを作ったあとの 0002 で定義する。
-- ここで定義すると role 列がまだ存在せずエラーになる。
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- JST の日付を返す
-- 勤務日・予約日の境界は全て日本時間で判定する
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jst_date(ts TIMESTAMPTZ)
RETURNS DATE
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (ts AT TIME ZONE 'Asia/Tokyo')::date;
$$;
