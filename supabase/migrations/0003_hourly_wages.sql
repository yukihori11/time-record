-- ============================================================
-- 0003: 時給履歴
--
-- effective_to は持たない。適用開始日だけを積み重ね、
-- 「その日に有効な時給」= effective_from <= 対象日 の最新行 とする。
-- 区間の重複・穴という不整合が構造的に発生しない。
-- 給与額を保存しないので、時給を遡って直せば過去分も自動で整合する。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.hourly_wages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  hourly_wage    INTEGER NOT NULL,
  effective_from DATE NOT NULL,
  note           TEXT,
  created_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hourly_wages_amount_check CHECK (hourly_wage > 0 AND hourly_wage < 100000),
  CONSTRAINT hourly_wages_unique_from UNIQUE (user_id, effective_from)
);

-- 「その日に有効な時給」の検索がインデックスだけで完結する
CREATE INDEX IF NOT EXISTS idx_hourly_wages_lookup
  ON public.hourly_wages(user_id, effective_from DESC);

DROP TRIGGER IF EXISTS trg_hourly_wages_updated_at ON public.hourly_wages;
CREATE TRIGGER trg_hourly_wages_updated_at
  BEFORE UPDATE ON public.hourly_wages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.hourly_wages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hourly_wages FORCE ROW LEVEL SECURITY;

-- 本人は自分の時給を見られる（給与画面の内訳表示に必要）
DROP POLICY IF EXISTS hourly_wages_select ON public.hourly_wages;
CREATE POLICY hourly_wages_select ON public.hourly_wages
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS hourly_wages_admin_all ON public.hourly_wages;
CREATE POLICY hourly_wages_admin_all ON public.hourly_wages
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hourly_wages TO authenticated;

-- ------------------------------------------------------------
-- 指定日に有効な時給を返す
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wage_at(p_user_id UUID, p_date DATE)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT hourly_wage
    FROM public.hourly_wages
    WHERE user_id = p_user_id
      AND effective_from <= p_date
    ORDER BY effective_from DESC
    LIMIT 1;
$$;
