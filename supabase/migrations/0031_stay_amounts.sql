-- ============================================================
-- 0031: Airbnb の宿泊ごとの金額（管理者だけ）
-- ============================================================
--
-- iCal には金額が入っていないため、管理者が予約ごとに手で入れる。
-- 分析画面で売上・1泊あたりの単価・人件費の割合を出すのに使う。
--
-- airbnb_stays に列を足さず、別の表にする。
-- airbnb_stays はスタッフも自分の担当分を読める（0029）ため、
-- 同じ行に金額を置くと、スタッフにも売上が見えてしまう。
-- 金額はこの表に分け、管理者だけが読み書きできるようにする。
--
-- 宿泊の行が消えれば金額も消える（ON DELETE CASCADE）。
-- 同期では宿泊の行は消さず cancelled にするだけなので、通常は残る。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.airbnb_stay_amounts (
  stay_id    UUID PRIMARY KEY REFERENCES public.airbnb_stays(id) ON DELETE CASCADE,
  -- 円。Airbnb の予約ページの「ホストの受取額」を入れる想定
  amount     INTEGER NOT NULL,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT airbnb_stay_amounts_amount_check CHECK (amount >= 0 AND amount <= 100000000)
);

DROP TRIGGER IF EXISTS trg_airbnb_stay_amounts_updated_at ON public.airbnb_stay_amounts;
CREATE TRIGGER trg_airbnb_stay_amounts_updated_at
  BEFORE UPDATE ON public.airbnb_stay_amounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.airbnb_stay_amounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.airbnb_stay_amounts FORCE ROW LEVEL SECURITY;

-- 読み書きとも管理者だけ。スタッフには行が1件も見えない
DROP POLICY IF EXISTS airbnb_stay_amounts_admin ON public.airbnb_stay_amounts;
CREATE POLICY airbnb_stay_amounts_admin ON public.airbnb_stay_amounts
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.airbnb_stay_amounts TO authenticated;
