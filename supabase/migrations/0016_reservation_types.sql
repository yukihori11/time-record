-- ============================================================
-- 0016: 予約の種別マスタ
--
-- 宿泊・清掃・準備・メンテナンスなどを管理画面から
-- 追加・編集できるようにする。固定値にしない。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.reservation_types (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  color         TEXT NOT NULL DEFAULT '#3b82f6',
  icon          TEXT NOT NULL DEFAULT '',
  -- 客が滞在するか。false なら人数の入力を求めない
  has_guests    BOOLEAN NOT NULL DEFAULT true,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reservation_types_name_check CHECK (length(trim(name)) > 0),
  CONSTRAINT reservation_types_color_check CHECK (color ~ '^#[0-9a-fA-F]{6}$')
);

CREATE INDEX IF NOT EXISTS idx_reservation_types_active
  ON public.reservation_types(is_active, display_order);

DROP TRIGGER IF EXISTS trg_reservation_types_updated_at ON public.reservation_types;
CREATE TRIGGER trg_reservation_types_updated_at
  BEFORE UPDATE ON public.reservation_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 初期の種別
INSERT INTO public.reservation_types (name, color, icon, has_guests, display_order)
  SELECT * FROM (VALUES
    ('宿泊',         '#3b82f6', '🛏',  true,  1),
    ('清掃・作業',   '#10b981', '🧹', false, 2),
    ('準備',         '#f59e0b', '📦', false, 3),
    ('メンテナンス', '#ef4444', '🔧', false, 4)
  ) AS v(name, color, icon, has_guests, display_order)
  WHERE NOT EXISTS (SELECT 1 FROM public.reservation_types);

ALTER TABLE public.reservation_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_types FORCE ROW LEVEL SECURITY;

-- 種別はカレンダー表示に必要なので全員が読める
DROP POLICY IF EXISTS reservation_types_select ON public.reservation_types;
CREATE POLICY reservation_types_select ON public.reservation_types
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS reservation_types_admin ON public.reservation_types;
CREATE POLICY reservation_types_admin ON public.reservation_types
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservation_types TO authenticated;
