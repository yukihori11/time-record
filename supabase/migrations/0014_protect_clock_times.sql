-- ============================================================
-- 0014: 打刻時刻の保護
--
-- ws_update_self ポリシーは「本人の未退勤セッション」の更新を許すが、
-- 列単位の制限ができないため clock_in を書き換えられてしまう。
-- スタッフが出勤時刻を過去にずらせば労働時間を水増しできる。
--
-- アプリからそのような操作は出さないが、RLS を最後の砦と
-- 位置づけている以上、DB 側でも塞いでおく。
-- ============================================================

CREATE OR REPLACE FUNCTION public.protect_clock_times()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 管理者は修正できる（押し忘れ対応のため）
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- 本人による時刻の書き換えは拒否する。
  -- 打刻は clock_in/clock_out/break_start/break_end の
  -- SECURITY DEFINER 関数経由でのみ行う。
  IF NEW.clock_in IS DISTINCT FROM OLD.clock_in THEN
    RAISE EXCEPTION 'FORBIDDEN: 出勤時刻は変更できません' USING ERRCODE = '42501';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'FORBIDDEN: 担当者は変更できません' USING ERRCODE = '42501';
  END IF;

  IF NEW.is_manually_edited IS DISTINCT FROM OLD.is_manually_edited THEN
    RAISE EXCEPTION 'FORBIDDEN: 修正フラグは変更できません' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ws_protect_times ON public.work_sessions;
CREATE TRIGGER trg_ws_protect_times
  BEFORE UPDATE ON public.work_sessions
  FOR EACH ROW EXECUTE FUNCTION public.protect_clock_times();

-- ------------------------------------------------------------
-- 休憩時刻も同様に保護する
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_break_times()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.break_start IS DISTINCT FROM OLD.break_start THEN
    RAISE EXCEPTION 'FORBIDDEN: 休憩開始時刻は変更できません' USING ERRCODE = '42501';
  END IF;

  IF NEW.session_id IS DISTINCT FROM OLD.session_id THEN
    RAISE EXCEPTION 'FORBIDDEN: 紐づく勤務は変更できません' USING ERRCODE = '42501';
  END IF;

  -- 一度終了した休憩を本人が開き直すことはできない
  IF OLD.break_end IS NOT NULL AND NEW.break_end IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: 終了した休憩は変更できません' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_br_protect_times ON public.break_records;
CREATE TRIGGER trg_br_protect_times
  BEFORE UPDATE ON public.break_records
  FOR EACH ROW EXECUTE FUNCTION public.protect_break_times();
