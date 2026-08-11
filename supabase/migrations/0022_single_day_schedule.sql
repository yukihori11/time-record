-- ============================================================
-- 0022: 予約を1日単位の「予定」に変える
--
-- 連泊の期間管理は不要になった。
-- 必要なのは「その日・どの棟・何名・何をするか」だけ。
--
-- check_in / check_out の2列をやめ、schedule_date 1列にする。
-- ============================================================

-- 既存データを引き継ぐため、まず列を足す
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS schedule_date DATE;

UPDATE public.reservations
  SET schedule_date = check_in
  WHERE schedule_date IS NULL;

ALTER TABLE public.reservations
  ALTER COLUMN schedule_date SET NOT NULL;

-- 期間にまつわるものを落とす
DROP TRIGGER IF EXISTS trg_reservations_overlap ON public.reservations;
DROP FUNCTION IF EXISTS public.check_reservation_overlap() CASCADE;

ALTER TABLE public.reservations DROP CONSTRAINT IF EXISTS reservations_dates_check;
DROP INDEX IF EXISTS idx_reservations_range;
DROP INDEX IF EXISTS idx_reservations_active;

ALTER TABLE public.reservations DROP COLUMN IF EXISTS nights;
ALTER TABLE public.reservations DROP COLUMN IF EXISTS check_in;
ALTER TABLE public.reservations DROP COLUMN IF EXISTS check_out;

CREATE INDEX IF NOT EXISTS idx_reservations_date
  ON public.reservations(schedule_date);
CREATE INDEX IF NOT EXISTS idx_reservations_date_active
  ON public.reservations(schedule_date) WHERE status = 'confirmed';

-- ------------------------------------------------------------
-- 予定の作成（シフト付き）
--
-- 1日で完結するため、シフトも同じ日の分だけ。
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_reservation_with_shifts(UUID, UUID, DATE, DATE, INTEGER, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.create_schedule_with_shifts(
  p_property_id   UUID,
  p_type_id       UUID,
  p_schedule_date DATE,
  p_guest_count   INTEGER DEFAULT 0,
  p_note          TEXT DEFAULT NULL,
  p_shifts        JSONB DEFAULT '[]'::jsonb
)
RETURNS public.reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result public.reservations;
  item   JSONB;
  uid    UUID := auth.uid();
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: 管理者権限が必要です' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.reservations (
    property_id, type_id, schedule_date, guest_count, note, created_by
  )
  VALUES (
    p_property_id, p_type_id, p_schedule_date,
    COALESCE(p_guest_count, 0), p_note, uid
  )
  RETURNING * INTO result;

  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(p_shifts, '[]'::jsonb))
  LOOP
    CONTINUE WHEN item->>'userId' IS NULL OR item->>'userId' = '';

    INSERT INTO public.shifts (
      user_id, property_id, reservation_id, shift_date,
      start_time, end_time, note, assigned_by, status
    )
    VALUES (
      (item->>'userId')::uuid,
      p_property_id,
      result.id,
      p_schedule_date,
      NULLIF(item->>'startTime', '')::time,
      NULLIF(item->>'endTime', '')::time,
      NULLIF(item->>'note', ''),
      uid,
      'assigned'
    );
  END LOOP;

  RETURN result;
END;
$$;

-- ------------------------------------------------------------
-- 予定の更新
--
-- シフトは入れ替えるが、同じ担当者なら回答状況を引き継ぐ。
-- 時刻だけ直したときに承諾が取り消されないようにするため。
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.update_reservation_with_shifts(UUID, UUID, UUID, DATE, DATE, INTEGER, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.update_schedule_with_shifts(
  p_reservation_id UUID,
  p_property_id    UUID,
  p_type_id        UUID,
  p_schedule_date  DATE,
  p_guest_count    INTEGER DEFAULT 0,
  p_note           TEXT DEFAULT NULL,
  p_shifts         JSONB DEFAULT '[]'::jsonb
)
RETURNS public.reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result public.reservations;
  item   JSONB;
  uid    UUID := auth.uid();
  prev_status    TEXT;
  prev_responded TIMESTAMPTZ;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: 管理者権限が必要です' USING ERRCODE = '42501';
  END IF;

  UPDATE public.reservations
    SET property_id   = p_property_id,
        type_id       = p_type_id,
        schedule_date = p_schedule_date,
        guest_count   = COALESCE(p_guest_count, 0),
        note          = p_note
    WHERE id = p_reservation_id
    RETURNING * INTO result;

  IF result IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: 予定が見つかりません' USING ERRCODE = 'P0002';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _prev_shifts (
    user_id UUID, status TEXT, responded_at TIMESTAMPTZ
  ) ON COMMIT DROP;
  DELETE FROM _prev_shifts;

  INSERT INTO _prev_shifts (user_id, status, responded_at)
    SELECT user_id, status, responded_at
      FROM public.shifts WHERE reservation_id = p_reservation_id;

  DELETE FROM public.shifts WHERE reservation_id = p_reservation_id;

  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(p_shifts, '[]'::jsonb))
  LOOP
    CONTINUE WHEN item->>'userId' IS NULL OR item->>'userId' = '';

    SELECT status, responded_at INTO prev_status, prev_responded
      FROM _prev_shifts
      WHERE user_id = (item->>'userId')::uuid
      LIMIT 1;

    INSERT INTO public.shifts (
      user_id, property_id, reservation_id, shift_date,
      start_time, end_time, note, assigned_by, status, responded_at
    )
    VALUES (
      (item->>'userId')::uuid,
      p_property_id,
      result.id,
      p_schedule_date,
      NULLIF(item->>'startTime', '')::time,
      NULLIF(item->>'endTime', '')::time,
      NULLIF(item->>'note', ''),
      uid,
      COALESCE(prev_status, 'assigned'),
      prev_responded
    );

    prev_status := NULL;
    prev_responded := NULL;
  END LOOP;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_schedule_with_shifts(UUID, UUID, DATE, INTEGER, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_schedule_with_shifts(UUID, UUID, UUID, DATE, INTEGER, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_schedule_with_shifts(UUID, UUID, DATE, INTEGER, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_schedule_with_shifts(UUID, UUID, UUID, DATE, INTEGER, TEXT, JSONB) TO authenticated;
