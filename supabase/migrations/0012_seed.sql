-- ============================================================
-- 0012: 初期データ
-- ============================================================

-- 民泊2棟。名前・住所は管理画面から変更できる。
INSERT INTO public.properties (name, color, display_order, capacity)
  SELECT 'A棟', '#3b82f6', 1, 6
  WHERE NOT EXISTS (SELECT 1 FROM public.properties);

INSERT INTO public.properties (name, color, display_order, capacity)
  SELECT 'B棟', '#f97316', 2, 4
  WHERE (SELECT COUNT(*) FROM public.properties) = 1;

-- ------------------------------------------------------------
-- 最初の管理者を作る
--
-- Supabase ダッシュボードでアカウントを作成したあと、
-- 以下を SQL Editor で実行して自分を管理者にする:
--
--   UPDATE public.users SET role = 'admin'
--     WHERE email = 'あなたのメールアドレス';
-- ------------------------------------------------------------
