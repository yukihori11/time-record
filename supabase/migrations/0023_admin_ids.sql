-- ============================================================
-- 0023: 管理者の一覧を取得する
--
-- スタッフがシフトに回答したとき、管理者へ通知を送りたい。
-- しかし users テーブルの RLS は「自分の行のみ」のため、
-- スタッフの権限では管理者を探せない。
--
-- 通知の送信先を得るためだけの関数を用意する。
-- 返すのは id のみで、氏名やメールは含めない。
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_user_ids()
RETURNS TABLE (id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.id
    FROM public.users u
    WHERE u.role = 'admin'
      AND u.is_active = true
      -- ログイン済みのユーザーからのみ呼べる
      AND auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.admin_user_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_ids() TO authenticated;

-- ------------------------------------------------------------
-- 管理者への通知を作れるようにする
--
-- notifications の INSERT は管理者のみだったため、
-- スタッフが回答しても管理者宛の通知を作れなかった。
-- 通知の作成だけを許す関数を経由させる。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_admins(
  p_title TEXT,
  p_body  TEXT,
  p_link  TEXT DEFAULT NULL,
  p_kind  TEXT DEFAULT 'shift'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  inserted INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.notifications (user_id, title, body, link, kind)
    SELECT u.id, p_title, p_body, p_link, p_kind
      FROM public.users u
      WHERE u.role = 'admin' AND u.is_active = true;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_admins(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_admins(TEXT, TEXT, TEXT, TEXT) TO authenticated;
