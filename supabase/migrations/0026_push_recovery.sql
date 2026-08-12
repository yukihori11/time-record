-- ============================================================
-- 0026: 送信できなくなった端末を復旧できるようにする
--
-- 症状:
--   Android のスタッフに通知が届かない。
--   登録は残っていて、画面にも「受け取る」と出ている。
--
--   実際に送ってみると Google 側が拒否していた。
--     status=410 push subscription has unsubscribed or expired
--
-- 原因:
--   購読は端末やブラウザの都合で無効になることがある。
--   （アプリのデータ削除、長期間の未使用、ブラウザの更新など）
--
--   送信側は 410 を受けたら行を消していたが、それだけでは
--   端末側が気づけない。端末は購読を持ったままなので
--   「登録済み」と表示し続け、二度と復旧しなかった。
--
-- 対応:
--   消すのではなく、失敗した印を付けて残す。
--   端末が次に開いたとき status が「無効」と答えられるので、
--   その場で登録し直せる。
--
--   すぐ消してしまうと「サーバーに無い」と「無効になった」を
--   区別できず、同じ endpoint で再登録しても直らない。
-- ============================================================

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.push_subscriptions.failed_at IS
  '送信が拒否された日時（404/410）。NULL なら正常。'
  '端末が開き直したときに再登録させるための印。';

-- ------------------------------------------------------------
-- 送信できなかった端末に印を付ける
--
-- 他人の行を触るため、RLS を越える必要がある。
-- 消す代わりにこれを呼ぶ。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_push_failed(p_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  marked INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  UPDATE public.push_subscriptions
     SET failed_at = now()
   WHERE id = ANY(p_ids);

  GET DIAGNOSTICS marked = ROW_COUNT;
  RETURN marked;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_push_failed(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_push_failed(UUID[]) TO authenticated;

-- ------------------------------------------------------------
-- 送信対象からは失敗した端末を除く
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_push_targets()
RETURNS TABLE (id UUID, endpoint TEXT, p256dh TEXT, auth TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.endpoint, p.p256dh, p.auth
    FROM public.push_subscriptions p
    JOIN public.users u ON u.id = p.user_id
   WHERE u.role = 'admin'
     AND u.is_active = true
     AND p.failed_at IS NULL
     AND auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.admin_push_targets() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_push_targets() TO authenticated;
