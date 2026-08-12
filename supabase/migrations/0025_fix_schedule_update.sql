-- ============================================================
-- 0025: 予定の更新が必ず失敗する問題を直す
--
-- 症状:
--   予定を編集すると 500 になり、保存できない。
--
--     errMsg: "DELETE requires a WHERE clause"
--     pgCode: 21000
--
-- 原因:
--   0022 の update_schedule_with_shifts が、回答状況を退避する
--   一時テーブルを空にするために WHERE なしの DELETE を使っていた。
--
--     DELETE FROM _prev_shifts;
--
--   Supabase は WHERE のない DELETE を拒否する設定になっている。
--   本番で全件消す事故を防ぐためのもので、一時テーブルも例外にならない。
--
-- 対応:
--   一時テーブルをやめ、配列で保持する。
--   作成も削除も不要になり、この制約に触れなくなる。
--
--   ついでに、同じ担当者を二重に登録しても取り違えないよう
--   user_id で引く形は保ったままにしてある。
-- ============================================================

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
  -- 入れ替え前の回答状況。一時テーブルではなく配列で持つ。
  prev   JSONB;
  target UUID;
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

  -- 今の割り当てを控える。
  -- 時刻だけ直したときに、承諾済みが未回答に戻らないようにするため。
  SELECT COALESCE(
           jsonb_object_agg(
             user_id::text,
             jsonb_build_object('status', status, 'responded_at', responded_at)
           ),
           '{}'::jsonb
         )
    INTO prev
    FROM public.shifts
   WHERE reservation_id = p_reservation_id;

  DELETE FROM public.shifts WHERE reservation_id = p_reservation_id;

  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(p_shifts, '[]'::jsonb))
  LOOP
    CONTINUE WHEN item->>'userId' IS NULL OR item->>'userId' = '';

    target := (item->>'userId')::uuid;

    -- 前回も担当していたなら、その回答を引き継ぐ
    prev_status    := prev -> (target::text) ->> 'status';
    prev_responded := (prev -> (target::text) ->> 'responded_at')::timestamptz;

    INSERT INTO public.shifts (
      user_id, property_id, reservation_id, shift_date,
      start_time, end_time, note, assigned_by, status, responded_at
    )
    VALUES (
      target,
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
  END LOOP;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.update_schedule_with_shifts(UUID, UUID, UUID, DATE, INTEGER, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_schedule_with_shifts(UUID, UUID, UUID, DATE, INTEGER, TEXT, JSONB) TO authenticated;
