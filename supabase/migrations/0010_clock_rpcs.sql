-- ============================================================
-- 0010: 打刻 RPC
--
-- 打刻は複数テーブルにまたがるため、単一トランザクションで実行する。
-- Supabase JS からは複数文をトランザクションで囲めないので関数にする。
--
-- 引数に user_id を取らず auth.uid() を使うため、なりすましができない。
-- 時刻は全てサーバーの now()。端末の時計を信用しない。
-- ============================================================

-- ------------------------------------------------------------
-- 出勤
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clock_in(p_property_id UUID DEFAULT NULL)
RETURNS public.work_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result public.work_sessions;
  uid    UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_active_user() THEN
    RAISE EXCEPTION 'FORBIDDEN: 無効なアカウントです' USING ERRCODE = '42501';
  END IF;

  -- 未退勤のセッションがあれば二重出勤
  IF EXISTS (
    SELECT 1 FROM public.work_sessions
    WHERE user_id = uid AND clock_out IS NULL
  ) THEN
    RAISE EXCEPTION 'ALREADY_CLOCKED_IN: 既に出勤中です' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.work_sessions (user_id, property_id, clock_in, work_date, status)
    VALUES (uid, p_property_id, now(), public.jst_date(now()), 'working')
    RETURNING * INTO result;

  RETURN result;
END;
$$;

-- ------------------------------------------------------------
-- 退勤
--
-- 休憩中に退勤を押した場合は、その休憩も同時に終了させる。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clock_out()
RETURNS public.work_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result     public.work_sessions;
  open_sess  public.work_sessions;
  uid        UUID := auth.uid();
  now_ts     TIMESTAMPTZ := now();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO open_sess
    FROM public.work_sessions
    WHERE user_id = uid AND clock_out IS NULL
    FOR UPDATE;

  IF open_sess IS NULL THEN
    RAISE EXCEPTION 'NOT_CLOCKED_IN: 出勤していません' USING ERRCODE = 'P0002';
  END IF;

  -- 進行中の休憩を先に閉じる
  UPDATE public.break_records
    SET break_end = now_ts
    WHERE session_id = open_sess.id AND break_end IS NULL;

  UPDATE public.work_sessions
    SET clock_out = now_ts,
        status    = 'completed'
    WHERE id = open_sess.id
    RETURNING * INTO result;

  RETURN result;
END;
$$;

-- ------------------------------------------------------------
-- 休憩に入る
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.break_start()
RETURNS public.break_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result    public.break_records;
  open_sess public.work_sessions;
  uid       UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO open_sess
    FROM public.work_sessions
    WHERE user_id = uid AND clock_out IS NULL
    FOR UPDATE;

  IF open_sess IS NULL THEN
    RAISE EXCEPTION 'NOT_CLOCKED_IN: 出勤していません' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.break_records
    WHERE session_id = open_sess.id AND break_end IS NULL
  ) THEN
    RAISE EXCEPTION 'ALREADY_ON_BREAK: 既に休憩中です' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.break_records (session_id, break_start)
    VALUES (open_sess.id, now())
    RETURNING * INTO result;

  UPDATE public.work_sessions
    SET status = 'on_break'
    WHERE id = open_sess.id;

  RETURN result;
END;
$$;

-- ------------------------------------------------------------
-- 休憩から戻る
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.break_end()
RETURNS public.break_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result    public.break_records;
  open_sess public.work_sessions;
  uid       UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO open_sess
    FROM public.work_sessions
    WHERE user_id = uid AND clock_out IS NULL
    FOR UPDATE;

  IF open_sess IS NULL THEN
    RAISE EXCEPTION 'NOT_CLOCKED_IN: 出勤していません' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.break_records
    SET break_end = now()
    WHERE session_id = open_sess.id AND break_end IS NULL
    RETURNING * INTO result;

  IF result IS NULL THEN
    RAISE EXCEPTION 'NOT_ON_BREAK: 休憩中ではありません' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.work_sessions
    SET status = 'working'
    WHERE id = open_sess.id;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.clock_in(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clock_out() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.break_start() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.break_end() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.clock_in(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clock_out() TO authenticated;
GRANT EXECUTE ON FUNCTION public.break_start() TO authenticated;
GRANT EXECUTE ON FUNCTION public.break_end() TO authenticated;
