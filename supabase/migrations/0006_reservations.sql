-- ============================================================
-- 0006: 予約（どの棟に何人が何泊するか）
--
-- 泊数は check_out - check_in から導出できるので保存しない。
-- 「8/15に何人滞在中か」は check_in <= 8/15 < check_out で求まる。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.reservations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id    UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  guest_name     TEXT NOT NULL DEFAULT '',
  guest_count    INTEGER NOT NULL DEFAULT 1,
  check_in       DATE NOT NULL,
  check_out      DATE NOT NULL,
  check_in_time  TIME,
  check_out_time TIME,
  status         TEXT NOT NULL DEFAULT 'confirmed',
  source         TEXT,
  contact        TEXT,
  note           TEXT,
  created_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reservations_dates_check CHECK (check_out > check_in),
  CONSTRAINT reservations_guest_count_check CHECK (guest_count > 0 AND guest_count <= 100),
  CONSTRAINT reservations_status_check CHECK (status IN ('confirmed', 'cancelled'))
);

-- 泊数（生成列。滞在日数ではなく宿泊数）
ALTER TABLE public.reservations
  DROP COLUMN IF EXISTS nights;
ALTER TABLE public.reservations
  ADD COLUMN nights INTEGER GENERATED ALWAYS AS (check_out - check_in) STORED;

-- 月カレンダーは「期間が指定月と重なる予約」を引くので範囲検索が効くように
CREATE INDEX IF NOT EXISTS idx_reservations_range
  ON public.reservations(check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_reservations_property
  ON public.reservations(property_id, check_in);

DROP TRIGGER IF EXISTS trg_reservations_updated_at ON public.reservations;
CREATE TRIGGER trg_reservations_updated_at
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- 同一棟の予約が期間重複していないか検査
--
-- 民泊はチェックアウト日に次の客がチェックインできるため、
-- 半開区間 [check_in, check_out) として重なりを判定する。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_reservation_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  conflict_count INTEGER;
BEGIN
  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO conflict_count
    FROM public.reservations r
    WHERE r.property_id = NEW.property_id
      AND r.id <> NEW.id
      AND r.status = 'confirmed'
      AND daterange(r.check_in, r.check_out, '[)')
          && daterange(NEW.check_in, NEW.check_out, '[)');

  IF conflict_count > 0 THEN
    RAISE EXCEPTION 'RESERVATION_OVERLAP: 同じ棟で予約期間が重複しています'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reservations_overlap ON public.reservations;
CREATE TRIGGER trg_reservations_overlap
  BEFORE INSERT OR UPDATE OF property_id, check_in, check_out, status
  ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.check_reservation_overlap();

ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations FORCE ROW LEVEL SECURITY;

-- バイト生もカレンダーで予約を見る（何人来るか把握するため）
DROP POLICY IF EXISTS reservations_select ON public.reservations;
CREATE POLICY reservations_select ON public.reservations
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS reservations_admin_all ON public.reservations;
CREATE POLICY reservations_admin_all ON public.reservations
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservations TO authenticated;
