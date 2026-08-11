-- ============================================================
-- 0007: 勤務セッション（出勤・退勤）
--
-- 打刻状態の唯一の真実。clock_out IS NULL の行が「今勤務中」。
-- localStorage には一切保存しない。画面を閉じてもこの行から復元する。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.work_sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  property_id        UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  work_date          DATE NOT NULL,
  clock_in           TIMESTAMPTZ NOT NULL,
  clock_out          TIMESTAMPTZ,
  status             TEXT NOT NULL DEFAULT 'working',
  note               TEXT,
  is_manually_edited BOOLEAN NOT NULL DEFAULT false,
  edited_by          UUID REFERENCES public.users(id) ON DELETE SET NULL,
  edited_at          TIMESTAMPTZ,
  edit_reason        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT work_sessions_status_check
    CHECK (status IN ('working', 'on_break', 'completed', 'cancelled')),

  -- 退勤は出勤より後
  CONSTRAINT work_sessions_order_check
    CHECK (clock_out IS NULL OR clock_out > clock_in),

  -- 24時間を超える勤務は押し忘れとみなす
  CONSTRAINT work_sessions_duration_check
    CHECK (clock_out IS NULL OR clock_out < clock_in + INTERVAL '24 hours'),

  -- status と clock_out の整合
  CONSTRAINT work_sessions_state_check CHECK (
    (clock_out IS NULL     AND status IN ('working', 'on_break')) OR
    (clock_out IS NOT NULL AND status IN ('completed', 'cancelled'))
  )
);

-- ------------------------------------------------------------
-- 二重出勤の物理的な防止
--
-- 1人が同時に持てる未退勤セッションは1件だけ。
-- 連打・再送・複数端末からの同時操作を DB が弾く。
-- アプリ側のチェックが漏れても破綻しない。
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_session
  ON public.work_sessions(user_id)
  WHERE clock_out IS NULL;

CREATE INDEX IF NOT EXISTS idx_ws_user_date
  ON public.work_sessions(user_id, work_date DESC);
CREATE INDEX IF NOT EXISTS idx_ws_date
  ON public.work_sessions(work_date DESC);

-- ------------------------------------------------------------
-- work_date を clock_in の JST 日付から決める
--
-- 22:00 開始で翌 6:00 退勤でも work_date は開始日のまま。
-- 管理者が clock_in を修正した場合は work_date も追随させる。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_work_date()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.work_date := public.jst_date(NEW.clock_in);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ws_work_date ON public.work_sessions;
CREATE TRIGGER trg_ws_work_date
  BEFORE INSERT OR UPDATE OF clock_in ON public.work_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_work_date();

DROP TRIGGER IF EXISTS trg_ws_updated_at ON public.work_sessions;
CREATE TRIGGER trg_ws_updated_at
  BEFORE UPDATE ON public.work_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE public.work_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_sessions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select ON public.work_sessions;
CREATE POLICY ws_select ON public.work_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- 本人の打刻。手動修正フラグは立てられない
DROP POLICY IF EXISTS ws_insert_self ON public.work_sessions;
CREATE POLICY ws_insert_self ON public.work_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND is_manually_edited = false
    AND public.is_active_user()
  );

-- 本人が更新できるのは未退勤のセッションのみ。
-- 完了済みの過去の勤務は書き換えられない。
DROP POLICY IF EXISTS ws_update_self ON public.work_sessions;
CREATE POLICY ws_update_self ON public.work_sessions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND clock_out IS NULL)
  WITH CHECK (user_id = auth.uid() AND is_manually_edited = false);

DROP POLICY IF EXISTS ws_admin_all ON public.work_sessions;
CREATE POLICY ws_admin_all ON public.work_sessions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_sessions TO authenticated;
