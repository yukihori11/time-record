-- ============================================================
-- 0024: 管理者の通知先を取得する
--
-- スタッフがシフトに回答したとき、管理者へ通知を送りたい。
-- しかし push_subscriptions の RLS は「自分の購読のみ」なので、
-- スタッフの権限では管理者の送信先を取得できない。
--
-- 結果、notifications への記録は残るのにプッシュが飛ばない、
-- という状態になっていた。
--
-- 送信先だけを返す関数を用意する。
-- 誰の購読かは返さず、送信に必要な値のみ。
-- ============================================================

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
      -- ログイン済みのユーザーからのみ呼べる
      AND auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.admin_push_targets() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_push_targets() TO authenticated;

-- ------------------------------------------------------------
-- 無効になった購読を消す
--
-- 送信時に 404/410 が返った購読は使えないので削除したい。
-- こちらもスタッフの権限では他人の行を消せないため関数にする。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_push_subscriptions(p_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  removed INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.push_subscriptions WHERE id = ANY(p_ids);
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_push_subscriptions(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_push_subscriptions(UUID[]) TO authenticated;
