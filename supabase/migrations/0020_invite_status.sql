-- ============================================================
-- 0020: 招待の状態を持たせる
--
-- 招待した時点で auth.users に行ができ、トリガーで
-- public.users も作られる。そのため「招待メールを送っただけで
-- まだ本人が使い始めていない人」も一覧に出てしまっていた。
--
-- 管理画面で「招待中」と「利用中」を区別できるようにする。
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.users.invited_at IS
  '招待メールを送った日時。NULL なら管理者が直接作成した';
COMMENT ON COLUMN public.users.activated_at IS
  '本人が初めてログインした日時。NULL なら招待中（未使用）';

-- 既存ユーザーは利用中とみなす
UPDATE public.users
  SET activated_at = created_at
  WHERE activated_at IS NULL AND invited_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_pending
  ON public.users(activated_at) WHERE activated_at IS NULL;

-- ------------------------------------------------------------
-- 初回ログインを記録する
--
-- auth.users.last_sign_in_at が入った時点で「使い始めた」と判定する。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_user_signin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.last_sign_in_at IS NOT NULL
     AND (OLD.last_sign_in_at IS NULL) THEN
    UPDATE public.users
      SET activated_at = NEW.last_sign_in_at
      WHERE id = NEW.id AND activated_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_signin ON auth.users;
CREATE TRIGGER on_auth_user_signin
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_signin();

-- ------------------------------------------------------------
-- 招待の取り消し
--
-- まだ使い始めていない人だけ削除できる。
-- 既に勤務記録がある人を誤って消さないための安全策。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_cancel_invite(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target public.users;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: 管理者権限が必要です' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO target FROM public.users WHERE id = target_user_id;

  IF target IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: 対象が見つかりません' USING ERRCODE = 'P0002';
  END IF;

  IF target.activated_at IS NOT NULL THEN
    RAISE EXCEPTION 'ALREADY_ACTIVE: 既に利用開始しているため取り消せません'
      USING ERRCODE = '23514';
  END IF;

  -- 勤務記録があるなら消さない（念のため）
  IF EXISTS (SELECT 1 FROM public.work_sessions WHERE user_id = target_user_id) THEN
    RAISE EXCEPTION 'HAS_RECORDS: 勤務記録があるため取り消せません'
      USING ERRCODE = '23514';
  END IF;

  -- public.users は auth.users の削除に連動して消える
  DELETE FROM public.users WHERE id = target_user_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_cancel_invite(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_invite(UUID) TO authenticated;
