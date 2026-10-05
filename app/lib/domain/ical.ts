// Airbnb の「カレンダーをエクスポート」で得られる iCal を読む。
//
// 汎用の iCal ライブラリは繰り返し予定やタイムゾーンまで扱うため大きい。
// Airbnb の出力は終日の単発予定だけなので、必要な分だけを自前で読む。

export type IcalStayKind = 'reserved' | 'blocked';

export interface IcalStay {
  uid: string;
  kind: IcalStayKind;
  /** 'YYYY-MM-DD'。チェックイン日 */
  checkIn: string;
  /** 'YYYY-MM-DD'。チェックアウト日（iCal の DTEND は終わりの翌日＝チェックアウト日） */
  checkOut: string;
  /** 予約コード（HM から始まる）。ブロックには無い */
  reservationCode: string | null;
}

interface RawEvent {
  [key: string]: string;
}

/**
 * 折り返された行をつなぐ。
 * iCal は75オクテットごとに「改行＋空白1つ」で折り返す決まり。
 */
function unfold(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

/** TEXT 値のエスケープを戻す */
function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/** 'YYYYMMDD' または 'YYYYMMDDTHHMMSSZ' → 'YYYY-MM-DD'。読めなければ null */
function toDate(value: string | undefined): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function parseEvents(text: string): RawEvent[] {
  const events: RawEvent[] = [];
  let current: RawEvent | null = null;

  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;

    const colon = line.indexOf(':');
    if (colon < 0) continue;

    // 「DTSTART;VALUE=DATE:20261010」のように引数が付くので名前だけ取る
    const name = line.slice(0, colon).split(';')[0].toUpperCase();
    current[name] = line.slice(colon + 1);
  }

  return events;
}

/**
 * 予約かブロックかを見分ける。
 *
 * Airbnb は予約を「Reserved」、手で売り止めにした日を
 * 「Airbnb (Not available)」として出す。表記が変わった場合に
 * 予約を見落とさないよう、予約コードがあれば予約とみなす。
 */
function classify(summary: string, reservationCode: string | null): IcalStayKind {
  if (reservationCode) return 'reserved';
  if (/reserved/i.test(summary)) return 'reserved';
  return 'blocked';
}

/** 説明文の予約ページの URL から予約コードを取り出す */
function extractReservationCode(description: string): string | null {
  const m = description.match(/\/details\/([A-Z0-9]{6,})/i);
  return m ? m[1].toUpperCase() : null;
}

/**
 * iCal の本文から宿泊・ブロックを取り出す。
 * 日付が読めない予定、終わりが始まり以前の予定は捨てる。
 */
export function parseAirbnbIcal(text: string): IcalStay[] {
  const result: IcalStay[] = [];

  for (const ev of parseEvents(text)) {
    const uid = ev.UID?.trim();
    const checkIn = toDate(ev.DTSTART);
    const checkOut = toDate(ev.DTEND);
    if (!uid || !checkIn || !checkOut || checkOut <= checkIn) continue;

    const summary = unescapeText(ev.SUMMARY ?? '');
    const description = unescapeText(ev.DESCRIPTION ?? '');
    const reservationCode = extractReservationCode(description);

    result.push({
      uid,
      kind: classify(summary, reservationCode),
      checkIn,
      checkOut,
      reservationCode,
    });
  }

  return result;
}

/** 本文が iCal として読めるか。HTML のエラーページ等を弾く */
export function looksLikeIcal(text: string): boolean {
  return text.trimStart().startsWith('BEGIN:VCALENDAR');
}

/**
 * 取り込み先として許す URL か。
 *
 * サーバーから任意の URL を取りに行かせると、内部のアドレスを
 * 叩かせる攻撃（SSRF）に使われる。Airbnb の https に限る。
 */
export function isAllowedIcalUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password || url.port) return false;
  return /(^|\.)airbnb\.[a-z]{2,3}(\.[a-z]{2})?$/i.test(url.hostname);
}
