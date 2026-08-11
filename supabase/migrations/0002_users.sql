-- ============================================================
-- 0002: ユーザー（管理者 / バイト生）
-- ============================================================

CREATE TABLE IF NOT EXISTS public.users (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL DEFAULT '',
  role       TEXT NOT NULL DEFAULT 'staff',
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_role_check CHECK (role IN ('admin', 'staff'))
);

-- 既存テーブルがある場合に備えて列を追加
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'staff';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.users ALTER COLUMN name SET DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_users_role_active ON public.users(role, is_active);

-- ------------------------------------------------------------
-- 管理者判定
--
-- SECURITY DEFINER にすることで users テーブルの RLS を回避し、
-- RLS ポリシー内から呼んでも無限再帰しないようにする。
-- search_path 固定は権限昇格攻撃対策として必須。
-- STABLE にしないと行ごとに再評価されて極端に遅くなる。
--
-- users テーブルの列を参照するため、テーブル作成後に定義する。
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

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- サインアップ時のプロフィール自動作成
--
-- raw_user_meta_data はクライアントが自由に設定できるため、
-- name のみ読み取り role は常にサーバー側で 'staff' に固定する。
-- ここで role を読むと誰でも管理者になれてしまう。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    'staff'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select ON public.users;
CREATE POLICY users_select ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

-- 本人は自分の行のみ更新可。ただし列権限で name 以外は触れない
DROP POLICY IF EXISTS users_update_self ON public.users;
CREATE POLICY users_update_self ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS users_update_admin ON public.users;
CREATE POLICY users_update_admin ON public.users
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 自己昇格の防止。
-- RLS の WITH CHECK では列単位の制御ができないため、
-- GRANT/REVOKE で role と is_active への UPDATE 権限そのものを剥奪する。
-- 変更は後述の admin_set_user_role() 経由でのみ可能。
REVOKE UPDATE ON public.users FROM authenticated;
GRANT SELECT ON public.users TO authenticated;
GRANT UPDATE (name) ON public.users TO authenticated;

-- ------------------------------------------------------------
-- 管理者によるロール変更（SECURITY DEFINER 経由のみ）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  target_user_id UUID,
  new_role TEXT
)
RETURNS public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result public.users;
  admin_count INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: 管理者権限が必要です' USING ERRCODE = '42501';
  END IF;

  IF new_role NOT IN ('admin', 'staff') THEN
    RAISE EXCEPTION 'VALIDATION: role は admin か staff のみ' USING ERRCODE = '22023';
  END IF;

  -- 最後の管理者が自分を降格させると誰も管理できなくなる
  IF new_role = 'staff' THEN
    SELECT COUNT(*) INTO admin_count
      FROM public.users
      WHERE role = 'admin' AND is_active = true AND id <> target_user_id;
    IF admin_count = 0 THEN
      RAISE EXCEPTION 'LAST_ADMIN: 管理者が0人になるため変更できません' USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE public.users
    SET role = new_role
    WHERE id = target_user_id
    RETURNING * INTO result;

  IF result IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: 対象ユーザーが存在しません' USING ERRCODE = 'P0002';
  END IF;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_active(
  target_user_id UUID,
  active BOOLEAN
)
RETURNS public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result public.users;
  admin_count INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: 管理者権限が必要です' USING ERRCODE = '42501';
  END IF;

  IF active = false THEN
    SELECT COUNT(*) INTO admin_count
      FROM public.users
      WHERE role = 'admin' AND is_active = true AND id <> target_user_id;
    IF admin_count = 0 THEN
      RAISE EXCEPTION 'LAST_ADMIN: 管理者が0人になるため変更できません' USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE public.users
    SET is_active = active
    WHERE id = target_user_id
    RETURNING * INTO result;

  IF result IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: 対象ユーザーが存在しません' USING ERRCODE = 'P0002';
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_role(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_user_active(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_active(UUID, BOOLEAN) TO authenticated;
