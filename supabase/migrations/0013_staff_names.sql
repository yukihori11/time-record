-- ============================================================
-- 0013: スタッフの表示名一覧
--
-- カレンダーでシフト担当者の名前を出すために必要。
-- users テーブルの RLS は「自分の行のみ」なので、
-- 氏名だけを返す専用関数を用意する。
-- メールアドレスやロールは含めない。
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_staff_names()
RETURNS TABLE (id UUID, name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.id, u.name
    FROM public.users u
    WHERE u.is_active = true
      AND auth.uid() IS NOT NULL
    ORDER BY u.name;
$$;

REVOKE ALL ON FUNCTION public.list_staff_names() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_staff_names() TO authenticated;
