-- ============================================================
-- 0019: 最低保証の発動条件を追加
--
-- 保証を「常に下支え」から「一定時間を超えたら発動」に変更する。
--
--   1時間15分以下  → 実時間どおり  （75分 = 1250円）
--   それを超える   → 2時間分を保証  （76分 = 2000円）
--   2時間を超える  → 実時間で計算   （130分 = 2250円）
--
-- 下限・保証時間とも管理画面から変更できる。
--
-- 短時間で終わった日は実績どおり、少しだけ超えた日は
-- 保証で下支えする、という運用に合わせる。
-- ============================================================

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS guarantee_threshold_minutes INTEGER NOT NULL DEFAULT 75;

ALTER TABLE public.app_settings
  DROP CONSTRAINT IF EXISTS app_settings_threshold_check;
ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_threshold_check
  CHECK (guarantee_threshold_minutes >= 0 AND guarantee_threshold_minutes <= 1440);

-- 既定値を「1時間15分を超えたら2時間分」に揃える
UPDATE public.app_settings
  SET guarantee_threshold_minutes = 75,
      min_guaranteed_minutes = 120
  WHERE id = 1;

ALTER TABLE public.app_settings
  ALTER COLUMN min_guaranteed_minutes SET DEFAULT 120;
