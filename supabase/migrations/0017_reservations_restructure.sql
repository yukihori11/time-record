-- ============================================================
-- 0017: 予約の再構成
--
-- お客さんの個人情報は扱わない方針に変更。
-- 必要なのは「どの棟に・いつ・何人・どんな用件か」だけ。
--
-- あわせてシフトを予約に紐づけ、予約フォームから
-- 担当バイト生を割り当てられるようにする。
-- ============================================================

-- ------------------------------------------------------------
-- 種別への参照を追加
-- ------------------------------------------------------------
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS type_id UUID REFERENCES public.reservation_types(id) ON DELETE RESTRICT;

-- 既存行に「宿泊」を割り当てる
UPDATE public.reservations
  SET type_id = (
    SELECT id FROM public.reservation_types
    WHERE name = '宿泊' ORDER BY display_order LIMIT 1
  )
  WHERE type_id IS NULL;

-- 以降は必須
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.reservation_types) THEN
    ALTER TABLE public.reservations ALTER COLUMN type_id SET NOT NULL;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 客の個人情報を削除
--
-- 保持しないことが最も確実な個人情報保護になる。
-- ------------------------------------------------------------
ALTER TABLE public.reservations DROP COLUMN IF EXISTS guest_name;
ALTER TABLE public.reservations DROP COLUMN IF EXISTS contact;
ALTER TABLE public.reservations DROP COLUMN IF EXISTS source;
ALTER TABLE public.reservations DROP COLUMN IF EXISTS check_in_time;
ALTER TABLE public.reservations DROP COLUMN IF EXISTS check_out_time;

-- 客が滞在しない種別（清掃など）では人数0を許す
ALTER TABLE public.reservations DROP CONSTRAINT IF EXISTS reservations_guest_count_check;
ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_guest_count_check
  CHECK (guest_count >= 0 AND guest_count <= 100);
ALTER TABLE public.reservations ALTER COLUMN guest_count SET DEFAULT 0;

-- 1日だけの作業（清掃など）を登録できるようにする。
-- 宿泊は check_out > check_in だが、作業は同日で完結する。
ALTER TABLE public.reservations DROP CONSTRAINT IF EXISTS reservations_dates_check;
ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_dates_check CHECK (check_out >= check_in);

CREATE INDEX IF NOT EXISTS idx_reservations_type
  ON public.reservations(type_id);

-- ------------------------------------------------------------
-- 期間の重複チェックを見直す
--
-- 宿泊同士は重複させない。
-- ただし清掃や準備は宿泊と同じ日に入ることがあるため、
-- 「客が滞在する種別」同士でのみ重複を禁止する。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_reservation_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  conflict_count INTEGER;
  new_has_guests BOOLEAN;
BEGIN
  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  SELECT has_guests INTO new_has_guests
    FROM public.reservation_types WHERE id = NEW.type_id;

  -- 作業系は重複してよい（清掃中に準備が入るなど）
  IF new_has_guests IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO conflict_count
    FROM public.reservations r
    JOIN public.reservation_types rt ON rt.id = r.type_id
    WHERE r.property_id = NEW.property_id
      AND r.id <> NEW.id
      AND r.status = 'confirmed'
      AND rt.has_guests = true
      AND daterange(r.check_in, GREATEST(r.check_out, r.check_in + 1), '[)')
          && daterange(NEW.check_in, GREATEST(NEW.check_out, NEW.check_in + 1), '[)');

  IF conflict_count > 0 THEN
    RAISE EXCEPTION 'RESERVATION_OVERLAP: 同じ棟で宿泊の期間が重複しています'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reservations_overlap ON public.reservations;
CREATE TRIGGER trg_reservations_overlap
  BEFORE INSERT OR UPDATE OF property_id, check_in, check_out, status, type_id
  ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.check_reservation_overlap();

-- ------------------------------------------------------------
-- シフトを予約に紐づける
--
-- 予約フォームから担当者を割り当てられるようにする。
-- 予約を消したらシフトも消える（ON DELETE CASCADE）。
-- 予約に紐づかない単発のシフトも作れるよう NULL を許す。
-- ------------------------------------------------------------
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS reservation_id UUID
  REFERENCES public.reservations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_shifts_reservation
  ON public.shifts(reservation_id);
