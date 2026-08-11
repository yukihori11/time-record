-- ============================================================
-- 0008: 休憩記録
--
-- 1回の勤務に複数回の休憩が入る。
-- 休憩は推測ではなく実データとして保存する。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.break_records (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES public.work_sessions(id) ON DELETE CASCADE,
  break_start TIMESTAMPTZ NOT NULL,
  break_end   TIMESTAMPTZ,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT break_records_order_check
    CHECK (break_end IS NULL OR break_end > break_start)
);

-- 休憩中にもう一度休憩に入れない（DB レベルで防ぐ）
CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_break
  ON public.break_records(session_id)
  WHERE break_end IS NULL;

CREATE INDEX IF NOT EXISTS idx_br_session
  ON public.break_records(session_id, break_start);

DROP TRIGGER IF EXISTS trg_br_updated_at ON public.break_records;
CREATE TRIGGER trg_br_updated_at
  BEFORE UPDATE ON public.break_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- 休憩が勤務時間の内側に収まり、他の休憩と重ならないことを検査
--
-- 管理者の後修正で休憩が重複すると実労働がマイナスになるため、
-- 給与計算の前段でここを守る。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_break_validity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  ws           public.work_sessions;
  overlap_count INTEGER;
BEGIN
  SELECT * INTO ws FROM public.work_sessions WHERE id = NEW.session_id;

  IF ws IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: 勤務セッションが存在しません' USING ERRCODE = 'P0002';
  END IF;

  IF NEW.break_start < ws.clock_in THEN
    RAISE EXCEPTION 'INVALID_BREAK: 休憩開始が出勤時刻より前です' USING ERRCODE = '23514';
  END IF;

  IF ws.clock_out IS NOT NULL THEN
    IF NEW.break_start > ws.clock_out THEN
      RAISE EXCEPTION 'INVALID_BREAK: 休憩開始が退勤時刻より後です' USING ERRCODE = '23514';
    END IF;
    IF NEW.break_end IS NOT NULL AND NEW.break_end > ws.clock_out THEN
      RAISE EXCEPTION 'INVALID_BREAK: 休憩終了が退勤時刻より後です' USING ERRCODE = '23514';
    END IF;
  END IF;

  -- 同一セッション内の他の休憩と重ならないこと
  SELECT COUNT(*) INTO overlap_count
    FROM public.break_records b
    WHERE b.session_id = NEW.session_id
      AND b.id <> NEW.id
      AND tstzrange(b.break_start, COALESCE(b.break_end, 'infinity'::timestamptz), '[)')
          && tstzrange(NEW.break_start, COALESCE(NEW.break_end, 'infinity'::timestamptz), '[)');

  IF overlap_count > 0 THEN
    RAISE EXCEPTION 'BREAK_OVERLAP: 休憩時間が重複しています' USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_br_validity ON public.break_records;
CREATE TRIGGER trg_br_validity
  BEFORE INSERT OR UPDATE OF session_id, break_start, break_end
  ON public.break_records
  FOR EACH ROW EXECUTE FUNCTION public.check_break_validity();

-- ------------------------------------------------------------
-- RLS（親セッション経由で権限を判定）
-- ------------------------------------------------------------
ALTER TABLE public.break_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.break_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS br_select ON public.break_records;
CREATE POLICY br_select ON public.break_records
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.work_sessions ws
    WHERE ws.id = break_records.session_id
      AND (ws.user_id = auth.uid() OR public.is_admin())
  ));

DROP POLICY IF EXISTS br_insert_self ON public.break_records;
CREATE POLICY br_insert_self ON public.break_records
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.work_sessions ws
    WHERE ws.id = break_records.session_id
      AND ws.user_id = auth.uid()
      AND ws.clock_out IS NULL
  ));

DROP POLICY IF EXISTS br_update_self ON public.break_records;
CREATE POLICY br_update_self ON public.break_records
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.work_sessions ws
    WHERE ws.id = break_records.session_id
      AND ws.user_id = auth.uid()
      AND ws.clock_out IS NULL
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.work_sessions ws
    WHERE ws.id = break_records.session_id
      AND ws.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS br_admin_all ON public.break_records;
CREATE POLICY br_admin_all ON public.break_records
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.break_records TO authenticated;
