-- ============================================================
-- 0005: 民泊物件（棟）
--
-- 現在2棟。増える前提で行を足すだけで済む形にする。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.properties (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  address       TEXT,
  capacity      INTEGER,
  color         TEXT NOT NULL DEFAULT '#3b82f6',
  note          TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT properties_name_check CHECK (length(trim(name)) > 0),
  CONSTRAINT properties_capacity_check CHECK (capacity IS NULL OR capacity > 0),
  -- カレンダーの色分けに使うため 16進カラーコードに限定
  CONSTRAINT properties_color_check CHECK (color ~ '^#[0-9a-fA-F]{6}$')
);

CREATE INDEX IF NOT EXISTS idx_properties_active
  ON public.properties(is_active, display_order);

DROP TRIGGER IF EXISTS trg_properties_updated_at ON public.properties;
CREATE TRIGGER trg_properties_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties FORCE ROW LEVEL SECURITY;

-- バイト生もカレンダーで棟名・色を見る必要がある
DROP POLICY IF EXISTS properties_select ON public.properties;
CREATE POLICY properties_select ON public.properties
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS properties_admin_all ON public.properties;
CREATE POLICY properties_admin_all ON public.properties
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;
