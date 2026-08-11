-- ============================================================
-- 0015: パフォーマンス改善
--
-- RLS ポリシーは行ごとに評価されるため、その中で呼ばれる関数の
-- コストがそのまま応答時間に効く。
-- ============================================================

-- ------------------------------------------------------------
-- auth.uid() の評価回数を減らす
--
-- ポリシー内の auth.uid() は行ごとに再評価される。
-- (SELECT auth.uid()) と書くと初期化時に1回だけ評価され、
-- 行数が多いテーブルで明確に速くなる。
-- ------------------------------------------------------------

-- work_sessions
DROP POLICY IF EXISTS ws_select ON public.work_sessions;
CREATE POLICY ws_select ON public.work_sessions
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_admin());

DROP POLICY IF EXISTS ws_insert_self ON public.work_sessions;
CREATE POLICY ws_insert_self ON public.work_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND is_manually_edited = false
    AND public.is_active_user()
  );

DROP POLICY IF EXISTS ws_update_self ON public.work_sessions;
CREATE POLICY ws_update_self ON public.work_sessions
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND clock_out IS NULL)
  WITH CHECK (user_id = (SELECT auth.uid()) AND is_manually_edited = false);

-- hourly_wages
DROP POLICY IF EXISTS hourly_wages_select ON public.hourly_wages;
CREATE POLICY hourly_wages_select ON public.hourly_wages
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_admin());

-- users
DROP POLICY IF EXISTS users_select ON public.users;
CREATE POLICY users_select ON public.users
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR public.is_admin());

DROP POLICY IF EXISTS users_update_self ON public.users;
CREATE POLICY users_update_self ON public.users
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- break_records（親セッション経由の判定）
DROP POLICY IF EXISTS br_select ON public.break_records;
CREATE POLICY br_select ON public.break_records
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.work_sessions ws
    WHERE ws.id = break_records.session_id
      AND (ws.user_id = (SELECT auth.uid()) OR public.is_admin())
  ));

DROP POLICY IF EXISTS br_insert_self ON public.break_records;
CREATE POLICY br_insert_self ON public.break_records
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.work_sessions ws
    WHERE ws.id = break_records.session_id
      AND ws.user_id = (SELECT auth.uid())
      AND ws.clock_out IS NULL
  ));

DROP POLICY IF EXISTS br_update_self ON public.break_records;
CREATE POLICY br_update_self ON public.break_records
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.work_sessions ws
    WHERE ws.id = break_records.session_id
      AND ws.user_id = (SELECT auth.uid())
      AND ws.clock_out IS NULL
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.work_sessions ws
    WHERE ws.id = break_records.session_id
      AND ws.user_id = (SELECT auth.uid())
  ));

-- ------------------------------------------------------------
-- 検索に使う組み合わせのインデックス
-- ------------------------------------------------------------

-- 給与集計は「期間 × ユーザー」で引く
CREATE INDEX IF NOT EXISTS idx_ws_date_user
  ON public.work_sessions(work_date, user_id);

-- 未退勤セッションの検索（打刻状態の復元で毎回使う）
CREATE INDEX IF NOT EXISTS idx_ws_open_lookup
  ON public.work_sessions(user_id, clock_in DESC)
  WHERE clock_out IS NULL;

-- 休憩の取得
CREATE INDEX IF NOT EXISTS idx_br_open
  ON public.break_records(session_id)
  WHERE break_end IS NULL;

-- 予約カレンダーの期間検索
CREATE INDEX IF NOT EXISTS idx_reservations_active
  ON public.reservations(check_in, check_out)
  WHERE status = 'confirmed';

-- 時給の解決
CREATE INDEX IF NOT EXISTS idx_wages_user_from
  ON public.hourly_wages(user_id, effective_from DESC);
