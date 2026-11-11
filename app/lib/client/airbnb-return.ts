import type { Stay } from '@/app/types/domain';

/**
 * Airbnb の予約ページへ行って戻ってきたとき、その予約の入力欄を開くための記録。
 *
 * Airbnb のページはアプリの中に埋め込めない（X-Frame-Options: SAMEORIGIN）。
 * そこで別の画面で開き、戻ってきたら「人数・金額・メモ」の入力欄を出す。
 *
 * スマホではアプリを離れている間にページが読み込み直されることがあるため、
 * 記録はメモリではなく sessionStorage に置く。
 * 読み書きが禁止されている環境（プライベートブラウズなど）では何もしない。
 */

const KEY = 'airbnb.return';

/** これより長く離れていたら、戻っても入力欄は開かない */
const MAX_AWAY_MS = 30 * 60 * 1000;

/**
 * リンクを押してから、これより後に裏へ回ったときは Airbnb へ行ったとみなさない。
 * 裏のタブで開いた（画面が切り替わらなかった）あと、しばらくして別の用事で
 * アプリを離れたときに、戻った途端に入力欄が出るのを防ぐ
 */
const LEAVE_WITHIN_MS = 5 * 1000;

export interface AirbnbVisit {
  stay: Stay;
  propertyName: string;
  propertyColor: string | null;
  /** Airbnb を開いた時刻 */
  openedAt: number;
  /** 実際にアプリを離れたか。離れずに終わったとき（開けなかったなど）に出さないため */
  left: boolean;
}

function read(): AirbnbVisit | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AirbnbVisit) : null;
  } catch {
    return null;
  }
}

function write(visit: AirbnbVisit | null) {
  try {
    if (visit) sessionStorage.setItem(KEY, JSON.stringify(visit));
    else sessionStorage.removeItem(KEY);
  } catch {
    // 保存できなくても Airbnb は開ける。入力欄が出ないだけ
  }
}

/** Airbnb のリンクを押したときに呼ぶ */
export function rememberAirbnbVisit(
  stay: Stay,
  property: { name: string; color?: string | null } | undefined
) {
  write({
    stay,
    propertyName: property?.name ?? '棟不明',
    propertyColor: property?.color ?? null,
    openedAt: Date.now(),
    left: false,
  });
}

/** アプリが裏に回ったときに呼ぶ。Airbnb を開いた直後なら「離れた」と記録する */
export function markAirbnbLeft(now = Date.now()) {
  const visit = read();
  if (!visit || visit.left) return;
  if (now - visit.openedAt <= LEAVE_WITHIN_MS) write({ ...visit, left: true });
  else write(null);
}

/**
 * アプリに戻ったときに呼ぶ。入力欄を開くべき記録があれば返し、記録は消す。
 * 一度だけ開くようにするため。
 */
export function takeAirbnbReturn(now = Date.now()): AirbnbVisit | null {
  const visit = read();
  if (!visit || !visit.left) return null;
  write(null);
  if (now - visit.openedAt > MAX_AWAY_MS) return null;
  return visit;
}
