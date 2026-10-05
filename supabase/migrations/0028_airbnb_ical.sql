-- ============================================================
-- 0028: Airbnb のカレンダー（iCal）を取り込む
--
-- Airbnb の公式 API は個人ホストに公開されていないため、
-- 各リスティングの「カレンダーをエクスポート」の URL を読む。
-- iCal で取れるのは日付と予約コードまで。名前と人数は入らないので、
-- 管理者が後から手で入れる。
--
--   property_ical_feeds   棟ごとの iCal の URL（管理者だけ）
--   airbnb_stays          取り込んだ宿泊・ブロック（全員が見る）
--   airbnb_stay_guests    ゲスト名（管理者だけ）
--
-- 名前を airbnb_stays に置かないのは、RLS が行単位でしか
-- 絞れないため。スタッフに名前を渡さないよう表ごと分ける。
--
-- 取り込み（insert / 日付の更新 / キャンセル）はサーバーの
-- service_role で行う。毎朝の自動実行にはログインした人が
-- いないため。authenticated には insert / delete を与えない。
--
-- 予定の種別に is_cleaning を足す。チェックイン当日に
-- 清掃の予定があるかを判定するのに使う。
-- ============================================================

-- ------------------------------------------------------------
-- 棟ごとの iCal の URL
--
-- URL を知っていれば誰でも予約日程を読めるため、管理者だけに見せる。
-- properties はスタッフも読むので、そこには置かない。
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.property_ical_feeds (
  property_id    UUID PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
  ical_url       TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ,
  last_error     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT property_ical_feeds_url_check CHECK (ical_url ~ '^https://')
);

DROP TRIGGER IF EXISTS trg_property_ical_feeds_updated_at ON public.property_ical_feeds;
CREATE TRIGGER trg_property_ical_feeds_updated_at
  BEFORE UPDATE ON public.property_ical_feeds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.property_ical_feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_ical_feeds FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS property_ical_feeds_admin ON public.property_ical_feeds;
CREATE POLICY property_ical_feeds_admin ON public.property_ical_feeds
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_ical_feeds TO authenticated;

-- ------------------------------------------------------------
-- 取り込んだ宿泊・ブロック
--
-- ical_uid で iCal の予定と1対1に結びつける。日付が変わっても
-- 同じ行を更新するので、手で入れた人数やメモが残る。
--
-- iCal から消えた未来の予定は削除せず status = 'cancelled' にする。
-- 一時的な取得の不調で消えた場合に、戻ってきたら active に戻せるように。
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.airbnb_stays (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id      UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  ical_uid         TEXT NOT NULL,
  kind             TEXT NOT NULL DEFAULT 'reserved',
  check_in         DATE NOT NULL,
  check_out        DATE NOT NULL,
  reservation_code TEXT,
  guest_count      INTEGER,
  note             TEXT,
  status           TEXT NOT NULL DEFAULT 'active',
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT airbnb_stays_uid_unique UNIQUE (property_id, ical_uid),
  CONSTRAINT airbnb_stays_kind_check CHECK (kind IN ('reserved', 'blocked')),
  CONSTRAINT airbnb_stays_status_check CHECK (status IN ('active', 'cancelled')),
  CONSTRAINT airbnb_stays_dates_check CHECK (check_out > check_in),
  CONSTRAINT airbnb_stays_guest_count_check
    CHECK (guest_count IS NULL OR (guest_count >= 1 AND guest_count <= 100))
);

CREATE INDEX IF NOT EXISTS idx_airbnb_stays_range
  ON public.airbnb_stays(check_in, check_out);

DROP TRIGGER IF EXISTS trg_airbnb_stays_updated_at ON public.airbnb_stays;
CREATE TRIGGER trg_airbnb_stays_updated_at
  BEFORE UPDATE ON public.airbnb_stays
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.airbnb_stays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.airbnb_stays FORCE ROW LEVEL SECURITY;

-- スタッフもチェックインと人数を見て清掃の準備をする
DROP POLICY IF EXISTS airbnb_stays_select ON public.airbnb_stays;
CREATE POLICY airbnb_stays_select ON public.airbnb_stays
  FOR SELECT TO authenticated
  USING (true);

-- 管理者が人数・メモを入れる。日付は API 側で更新させない
DROP POLICY IF EXISTS airbnb_stays_admin_update ON public.airbnb_stays;
CREATE POLICY airbnb_stays_admin_update ON public.airbnb_stays
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, UPDATE ON public.airbnb_stays TO authenticated;

-- ------------------------------------------------------------
-- ゲスト名（管理者だけ）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.airbnb_stay_guests (
  stay_id    UUID PRIMARY KEY REFERENCES public.airbnb_stays(id) ON DELETE CASCADE,
  guest_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT airbnb_stay_guests_name_check CHECK (length(trim(guest_name)) > 0)
);

DROP TRIGGER IF EXISTS trg_airbnb_stay_guests_updated_at ON public.airbnb_stay_guests;
CREATE TRIGGER trg_airbnb_stay_guests_updated_at
  BEFORE UPDATE ON public.airbnb_stay_guests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.airbnb_stay_guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.airbnb_stay_guests FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS airbnb_stay_guests_admin ON public.airbnb_stay_guests;
CREATE POLICY airbnb_stay_guests_admin ON public.airbnb_stay_guests
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.airbnb_stay_guests TO authenticated;

-- ------------------------------------------------------------
-- 予定の種別に「清掃」の目印を足す
-- ------------------------------------------------------------
ALTER TABLE public.reservation_types
  ADD COLUMN IF NOT EXISTS is_cleaning BOOLEAN NOT NULL DEFAULT false;

UPDATE public.reservation_types
  SET is_cleaning = true
  WHERE name = '清掃・作業';
