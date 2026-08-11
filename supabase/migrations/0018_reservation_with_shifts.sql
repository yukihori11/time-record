-- ============================================================
-- 0018: 予約とシフトを一度に登録する
--
-- 予約フォームから「どの日に誰が何時入りか」をまとめて渡す。
-- 予約だけ作られてシフトが失敗する状態を避けるため、
-- 単一トランザクションで処理する。
-- ============================================================

-- ------------------------------------------------------------
-- 予約の作成（シフト付き）
--
-- p_shifts は以下の形の JSON 配列:
--   [{"date":"2026-08-15","userId":"...","startTime":"10:00","endTime":"15:00","note":"..."}]
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_reservation_with_shifts(
  p_property_id UUID,
  p_type_id     UUID,
  p_check_in    DATE,
  p_check_out   DATE,
  p_guest_count INTEGER DEFAULT 0,
  p_note        TEXT DEFAULT NULL,
  p_shifts      JSONB DEFAULT '[]'::jsonb
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
    property_id, type_id, check_in, check_out, guest_count, note, created_by
  )
  VALUES (
    p_property_id, p_type_id, p_check_in, p_check_out,
    COALESCE(p_guest_count, 0), p_note, uid
  )
  RETURNING * INTO result;

  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(p_shifts, '[]'::jsonb))
  LOOP
    -- 担当者が指定されていない日は飛ばす（連泊の中日など）
    CONTINUE WHEN item->>'userId' IS NULL OR item->>'userId' = '';

    INSERT INTO public.shifts (
      user_id, property_id, reservation_id, shift_date,
      start_time, end_time, note, assigned_by, status
    )
    VALUES (
      (item->>'userId')::uuid,
      p_property_id,
      result.id,
      (item->>'date')::date,
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
-- 予約の更新（シフトも入れ替える）
--
-- シフトは全消しして作り直す。日付や担当者の変更を
-- 差分検出するより単純で、取りこぼしがない。
-- ただし既に承諾済みのシフトは status を引き継ぐ。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_reservation_with_shifts(
  p_reservation_id UUID,
  p_property_id    UUID,
  p_type_id        UUID,
  p_check_in       DATE,
  p_check_out      DATE,
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
  prev_status TEXT;
  prev_responded TIMESTAMPTZ;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: 管理者権限が必要です' USING ERRCODE = '42501';
  END IF;

  UPDATE public.reservations
    SET property_id = p_property_id,
        type_id     = p_type_id,
        check_in    = p_check_in,
        check_out   = p_check_out,
        guest_count = COALESCE(p_guest_count, 0),
        note        = p_note
    WHERE id = p_reservation_id
    RETURNING * INTO result;

  IF result IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: 予約が見つかりません' USING ERRCODE = 'P0002';
  END IF;

  -- 入れ替え前に、既存の回答状況を退避しておく
  CREATE TEMP TABLE IF NOT EXISTS _prev_shifts (
    user_id UUID, shift_date DATE, status TEXT, responded_at TIMESTAMPTZ
  ) ON COMMIT DROP;
  DELETE FROM _prev_shifts;

  INSERT INTO _prev_shifts (user_id, shift_date, status, responded_at)
    SELECT user_id, shift_date, status, responded_at
      FROM public.shifts WHERE reservation_id = p_reservation_id;

  DELETE FROM public.shifts WHERE reservation_id = p_reservation_id;

  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(p_shifts, '[]'::jsonb))
  LOOP
    CONTINUE WHEN item->>'userId' IS NULL OR item->>'userId' = '';

    -- 同じ人・同じ日なら回答済みの状態を引き継ぐ。
    -- 時刻だけ直したときに承諾が取り消されるのを防ぐ。
    SELECT status, responded_at INTO prev_status, prev_responded
      FROM _prev_shifts
      WHERE user_id = (item->>'userId')::uuid
        AND shift_date = (item->>'date')::date
      LIMIT 1;

    INSERT INTO public.shifts (
      user_id, property_id, reservation_id, shift_date,
      start_time, end_time, note, assigned_by, status, responded_at
    )
    VALUES (
      (item->>'userId')::uuid,
      p_property_id,
      result.id,
      (item->>'date')::date,
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

REVOKE ALL ON FUNCTION public.create_reservation_with_shifts(UUID, UUID, DATE, DATE, INTEGER, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_reservation_with_shifts(UUID, UUID, UUID, DATE, DATE, INTEGER, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_reservation_with_shifts(UUID, UUID, DATE, DATE, INTEGER, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_reservation_with_shifts(UUID, UUID, UUID, DATE, DATE, INTEGER, TEXT, JSONB) TO authenticated;
