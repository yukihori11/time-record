-- ============================================================
-- 0011: 監査ログ
--
-- 給与に直結するデータ（勤怠・休憩・時給）の変更を記録する。
-- 「誰がいつ何をどう変えたか」を残す。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  table_name  TEXT NOT NULL,
  record_id   UUID NOT NULL,
  action      TEXT NOT NULL,
  actor_id    UUID,
  before_data JSONB,
  after_data  JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_action_check CHECK (action IN ('insert', 'update', 'delete'))
);

CREATE INDEX IF NOT EXISTS idx_audit_record
  ON public.audit_logs(table_name, record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created
  ON public.audit_logs(created_at DESC);

CREATE OR REPLACE FUNCTION public.write_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  rec_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    rec_id := OLD.id;
  ELSE
    rec_id := NEW.id;
  END IF;

  INSERT INTO public.audit_logs (table_name, record_id, action, actor_id, before_data, after_data)
    VALUES (
      TG_TABLE_NAME,
      rec_id,
      lower(TG_OP),
      auth.uid(),
      CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
      CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
    );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_work_sessions ON public.work_sessions;
CREATE TRIGGER trg_audit_work_sessions
  AFTER INSERT OR UPDATE OR DELETE ON public.work_sessions
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

DROP TRIGGER IF EXISTS trg_audit_break_records ON public.break_records;
CREATE TRIGGER trg_audit_break_records
  AFTER INSERT OR UPDATE OR DELETE ON public.break_records
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

DROP TRIGGER IF EXISTS trg_audit_hourly_wages ON public.hourly_wages;
CREATE TRIGGER trg_audit_hourly_wages
  AFTER INSERT OR UPDATE OR DELETE ON public.hourly_wages
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;

-- 閲覧は管理者のみ。書き込みはトリガー（SECURITY DEFINER）のみ。
DROP POLICY IF EXISTS audit_logs_select ON public.audit_logs;
CREATE POLICY audit_logs_select ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.is_admin());

GRANT SELECT ON public.audit_logs TO authenticated;
