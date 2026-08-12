-- ============================================================
-- 0027: 一度回答したシフトを本人が変更できるようにする
--
-- これまでは未回答のシフトにしか応答できなかった。
--
--   AND status = 'assigned'
--
-- 承諾したあとに都合が悪くなることは現実に起きる。
-- その場合は管理者が手で直すしかなく、連絡漏れがあると
-- 誰も来ないまま当日を迎えることになる。
--
-- 変更を許すが、無制限にはしない。
--
--   承諾 → 辞退   許す。代わりを探す必要があり、早いほどよい。
--   辞退 → 承諾   許す。都合がついたなら戻れた方がよい。
--   同じ回答       弾く。通知だけが飛ぶのを防ぐ。
--   過去の日付     弾く。終わったシフトを動かす意味がない。
--
-- 変更したことは呼び出し側に伝える。管理者への通知の
-- 文面を「承諾しました」と「辞退に変更しました」で
-- 分けたいため。
-- ============================================================

DROP FUNCTION IF EXISTS public.respond_to_shift(UUID, TEXT, TEXT);

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
  result   public.shifts;
  current  public.shifts;
BEGIN
  IF p_response NOT IN ('accepted', 'declined') THEN
    RAISE EXCEPTION 'VALIDATION: accepted か declined のみ' USING ERRCODE = '22023';
  END IF;

  -- 本人のシフトかを先に確かめる。
  -- 以降のエラーメッセージを状況に応じて変えるため。
  SELECT * INTO current
    FROM public.shifts
   WHERE id = p_shift_id
     AND user_id = auth.uid();

  IF current IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: シフトが見つかりません' USING ERRCODE = 'P0002';
  END IF;

  -- 同じ回答を繰り返しても意味がない。
  -- 二重送信で管理者に通知が飛ぶのも避けたい。
  IF current.status = p_response THEN
    RAISE EXCEPTION 'VALIDATION: すでに同じ内容で回答しています'
      USING ERRCODE = '22023';
  END IF;

  -- 終わったシフトは動かせない。
  -- 過ぎた日の承諾を辞退に変えられると、
  -- 実際に働いた記録と食い違う。
  IF current.shift_date < (now() AT TIME ZONE 'Asia/Tokyo')::date THEN
    RAISE EXCEPTION 'VALIDATION: 過ぎたシフトは変更できません'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.shifts
     SET status         = p_response,
         responded_at   = now(),
         decline_reason = CASE
                            WHEN p_response = 'declined' THEN p_reason
                            ELSE NULL
                          END
   WHERE id = p_shift_id
     AND user_id = auth.uid()
   RETURNING * INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_shift(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_shift(UUID, TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 変更前の状態を知るための関数
--
-- 通知の文面を「承諾しました」と「辞退に変更しました」で
-- 分けたい。respond_to_shift は変更後の行を返すため、
-- 呼ぶ前にこれで前の状態を取る。
--
-- 本人のシフトしか見えない。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_shift_status(p_shift_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT status
    FROM public.shifts
   WHERE id = p_shift_id
     AND user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.my_shift_status(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_shift_status(UUID) TO authenticated;
