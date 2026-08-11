-- ============================================================
-- 0021: プッシュ通知の購読
--
-- シフトを割り当てたときにスマホへ通知を送る。
-- メールだと見落とされるため、端末の通知欄に直接届ける。
--
-- 1人が複数の端末（スマホ・PC）から購読することがあるので
-- ユーザーごとに複数行を持てるようにする。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- ブラウザが発行する購読先。端末ごとに異なる
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  -- 送信に失敗し続けた購読を掃除するための記録
  failed_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_user
  ON public.push_subscriptions(user_id);

DROP TRIGGER IF EXISTS trg_push_updated_at ON public.push_subscriptions;
CREATE TRIGGER trg_push_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions FORCE ROW LEVEL SECURITY;

-- 自分の購読だけ見える・消せる
DROP POLICY IF EXISTS push_select ON public.push_subscriptions;
CREATE POLICY push_select ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_admin());

DROP POLICY IF EXISTS push_insert_self ON public.push_subscriptions;
CREATE POLICY push_insert_self ON public.push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS push_update_self ON public.push_subscriptions;
CREATE POLICY push_update_self ON public.push_subscriptions
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS push_delete_self ON public.push_subscriptions;
CREATE POLICY push_delete_self ON public.push_subscriptions
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;

-- ------------------------------------------------------------
-- お知らせ（通知が届かなかった場合の受け皿）
--
-- 通知を許可していない端末や、通知を消してしまった場合でも
-- アプリを開けば確認できるようにする。
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  -- タップしたときに開く画面
  link       TEXT,
  kind       TEXT NOT NULL DEFAULT 'shift',
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notifications_kind_check
    CHECK (kind IN ('shift', 'shift_cancelled', 'reminder', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON public.notifications(user_id) WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select ON public.notifications;
CREATE POLICY notifications_select ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- 既読にするのは本人のみ
DROP POLICY IF EXISTS notifications_update_self ON public.notifications;
CREATE POLICY notifications_update_self ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- 作成は管理者（シフト割当時）のみ
DROP POLICY IF EXISTS notifications_insert_admin ON public.notifications;
CREATE POLICY notifications_insert_admin ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
