-- ============================================================
-- 0030: スタッフが読めるシフト・予定を、自分の担当分に絞る
--
-- これまでシフトと予定は、ログインしていれば誰でも全件読めた。
-- 「誰がどの棟に入るかはスタッフ同士でも見える方が運用しやすい」
-- という考えだったが、スタッフには自分にお願いされた分だけを
-- 見せる方針に変えた。アプリ（API）では既に絞っている。
-- DB でも同じ条件にして、API に不備があっても漏れないようにする。
--
--   シフト  自分のもの
--   予定    自分のシフトが紐づくもの
--
-- 管理者は従来どおり全件読める。
-- 書き込みは管理者のポリシーと SECURITY DEFINER の関数
-- （respond_to_shift・create/update_schedule_with_shifts 等）が担うため影響しない。
--
-- 予定の判定に使う shifts(reservation_id) と shifts(user_id, ...) には
-- 索引がある（0009・0017）。
-- ============================================================

DROP POLICY IF EXISTS shifts_select ON public.shifts;
CREATE POLICY shifts_select ON public.shifts
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS reservations_select ON public.reservations;
CREATE POLICY reservations_select ON public.reservations
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
        FROM public.shifts sh
       WHERE sh.reservation_id = reservations.id
         AND sh.user_id = (SELECT auth.uid())
    )
  );
