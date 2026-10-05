-- ============================================================
-- 0029: スタッフが読める Airbnb の宿泊を、自分の担当分に絞る
--
-- 0028 では全員が全ての宿泊を読めた。スタッフのカレンダーは
-- 自分にお願いされた分だけを見せる方針にしたため、DB でも絞る。
--
-- スタッフが読めるのは「自分のシフトがある日・棟に
-- チェックインする宿泊」だけ。清掃はチェックイン当日に行うので、
-- 担当する清掃の人数を確かめるのに必要な分だけ見せる。
-- ブロック（売り止め）はスタッフには見せない。
--
-- アプリ側（getCalendarData）でも同じ条件で絞っている。
-- こちらは API に不備があった場合の最後の砦。
-- ============================================================

DROP POLICY IF EXISTS airbnb_stays_select ON public.airbnb_stays;
CREATE POLICY airbnb_stays_select ON public.airbnb_stays
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (
      kind = 'reserved'
      AND EXISTS (
        SELECT 1
          FROM public.shifts sh
         WHERE sh.user_id = auth.uid()
           AND sh.property_id = airbnb_stays.property_id
           AND sh.shift_date = airbnb_stays.check_in
      )
    )
  );
