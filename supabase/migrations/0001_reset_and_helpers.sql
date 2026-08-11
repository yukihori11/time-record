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
-- SECURITY DEFINER にすることで users テーブルの RLS を回避し、
-- RLS ポリシー内から呼んでも無限再帰しないようにする。
-- search_path 固定は権限昇格攻撃対策として必須。
-- STABLE にしないと行ごとに再評価されて極端に遅くなる。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND role = 'admin'
      AND is_active = true
  );
$$;

-- ------------------------------------------------------------
-- 有効なスタッフか（無効化された退職者を弾く）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND is_active = true
  );
$$;

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
