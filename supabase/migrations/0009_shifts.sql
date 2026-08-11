-- ============================================================
-- 0009: シフト（管理者が割当 → バイト生が承諾/辞退）
--
-- どの棟の担当かを property_id で持つ。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.shifts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  property_id    UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  shift_date     DATE NOT NULL,
  start_time     TIME,
  end_time       TIME,
  status         TEXT NOT NULL DEFAULT 'assigned',
  assigned_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  responded_at   TIMESTAMPTZ,
  decline_reason TEXT,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shifts_status_check CHECK (status IN ('assigned', 'accepted', 'declined')),
  CONSTRAINT shifts_time_check
    CHECK (start_time IS NULL OR end_time IS NULL OR end_time > start_time)
);

-- 同一人物・同一日・同一開始時刻の二重割当を防ぐ
CREATE UNIQUE INDEX IF NOT EXISTS uniq_shift_assignment
  ON public.shifts(user_id, shift_date, COALESCE(start_time, '00:00:00'::time));

CREATE INDEX IF NOT EXISTS idx_shifts_user_date
  ON public.shifts(user_id, shift_date DESC);
CREATE INDEX IF NOT EXISTS idx_shifts_date
  ON public.shifts(shift_date DESC);
CREATE INDEX IF NOT EXISTS idx_shifts_pending
  ON public.shifts(user_id) WHERE status = 'assigned';

DROP TRIGGER IF EXISTS trg_shifts_updated_at ON public.shifts;
CREATE TRIGGER trg_shifts_updated_at
  BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts FORCE ROW LEVEL SECURITY;

-- 誰がどの棟に入るかはバイト生同士でも見える方が運用しやすい
DROP POLICY IF EXISTS shifts_select ON public.shifts;
CREATE POLICY shifts_select ON public.shifts
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS shifts_admin_all ON public.shifts;
CREATE POLICY shifts_admin_all ON public.shifts
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- スタッフの承諾/辞退は respond_to_shift() 経由のみ。
-- 直接 UPDATE させると shift_date や property_id まで書き換えられるため
-- テーブルへの UPDATE 権限は与えない。
GRANT SELECT ON public.shifts TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.shifts TO authenticated;

-- ------------------------------------------------------------
-- シフトへの応答（承諾 / 辞退）
--
-- assigned からのみ遷移可能。一度応答したら本人は変更できない
-- （変更が必要なら管理者に依頼する運用）。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.respond_to_shift(
  p_shift_id UUID,
  p_response TEXT,
  p_reason   TEXT DEFAULT NULL
)
RETURNS public.shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result public.shifts;
BEGIN
  IF p_response NOT IN ('accepted', 'declined') THEN
    RAISE EXCEPTION 'VALIDATION: accepted か declined のみ' USING ERRCODE = '22023';
  END IF;

  UPDATE public.shifts
    SET status         = p_response,
        responded_at   = now(),
        decline_reason = CASE WHEN p_response = 'declined' THEN p_reason ELSE NULL END
    WHERE id = p_shift_id
      AND user_id = auth.uid()
      AND status = 'assigned'
    RETURNING * INTO result;

  IF result IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: 応答可能なシフトが見つかりません' USING ERRCODE = 'P0002';
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_shift(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_shift(UUID, TEXT, TEXT) TO authenticated;
