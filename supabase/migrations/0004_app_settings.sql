-- ============================================================
-- 0004: 給与ルール設定（シングルトン）
--
-- 丸め方向・丸め単位・最低保証を管理画面から変更できるようにする。
-- 注意: 設定を変えると過去月の金額も変わる。
--       締め機能が必要になったら履歴テーブル化する。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.app_settings (
  id                     INTEGER PRIMARY KEY DEFAULT 1,
  rounding_mode          TEXT NOT NULL DEFAULT 'up',
  rounding_minutes       INTEGER NOT NULL DEFAULT 15,
  min_guaranteed_minutes INTEGER NOT NULL DEFAULT 120,
  updated_by             UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_singleton CHECK (id = 1),
  CONSTRAINT app_settings_mode_check CHECK (rounding_mode IN ('up', 'down')),
  CONSTRAINT app_settings_minutes_check CHECK (rounding_minutes IN (1, 5, 10, 15, 30, 60)),
  CONSTRAINT app_settings_guarantee_check CHECK (min_guaranteed_minutes >= 0 AND min_guaranteed_minutes <= 1440)
);

INSERT INTO public.app_settings (id, rounding_mode, rounding_minutes, min_guaranteed_minutes)
  VALUES (1, 'up', 15, 120)
  ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_app_settings_updated_at ON public.app_settings;
CREATE TRIGGER trg_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings FORCE ROW LEVEL SECURITY;

-- 給与画面で丸めルールを表示するため全員が読める
DROP POLICY IF EXISTS app_settings_select ON public.app_settings;
CREATE POLICY app_settings_select ON public.app_settings
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS app_settings_update ON public.app_settings;
CREATE POLICY app_settings_update ON public.app_settings
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 行の追加・削除は誰にも許可しない（シングルトンを守る）
GRANT SELECT, UPDATE ON public.app_settings TO authenticated;
