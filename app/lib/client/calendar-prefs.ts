import { useSyncExternalStore } from 'react';

/**
 * カレンダーの表示の好み（何を目立たせるか）。
 *
 * 色は選ばせず、ON/OFF だけを選ぶ。色はアプリ側で見分けやすいものに固定しておく。
 * 人によって見やすさが違うため、その端末だけに保存する（DB には置かない）。
 * 保存できない環境（プライベートブラウズなど）では、初期値のまま表示する。
 */
export interface CalendarPrefs {
  /** 清掃に入る日（チェックインが1棟）を薄緑で塗る */
  fillCleaningDays: boolean;
  /** 2棟以上が同じ日にチェックインする日を黄色で塗る */
  fillMultiCheckIn: boolean;
  /** 過ぎた日も塗る */
  fillPastDays: boolean;
  /** 日付の横に、チェックインする棟の色の点を出す */
  showCheckInDots: boolean;
  /** 帯に人数を出す */
  showGuestCount: boolean;
}

export const DEFAULT_CALENDAR_PREFS: CalendarPrefs = {
  fillCleaningDays: true,
  fillMultiCheckIn: true,
  fillPastDays: true,
  showCheckInDots: true,
  showGuestCount: true,
};

const KEY = 'calendar.prefs';

/** 保存された値を読み、足りない項目・壊れた値は初期値で埋める */
export function parseCalendarPrefs(raw: string | null): CalendarPrefs {
  if (!raw) return DEFAULT_CALENDAR_PREFS;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const result = { ...DEFAULT_CALENDAR_PREFS };
    for (const key of Object.keys(DEFAULT_CALENDAR_PREFS) as (keyof CalendarPrefs)[]) {
      if (typeof value?.[key] === 'boolean') result[key] = value[key] as boolean;
    }
    return result;
  } catch {
    return DEFAULT_CALENDAR_PREFS;
  }
}

// useSyncExternalStore は同じ値なら同じ参照を返す必要があるため、読んだ結果を覚えておく
let cachedRaw: string | null | undefined;
let cached: CalendarPrefs = DEFAULT_CALENDAR_PREFS;

function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function getSnapshot(): CalendarPrefs {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parseCalendarPrefs(raw);
  }
  return cached;
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  // 別のタブで変えたときも反映する
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

export function setCalendarPref<K extends keyof CalendarPrefs>(key: K, value: CalendarPrefs[K]) {
  const next = { ...getSnapshot(), [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 保存できない環境。この画面を開いている間も変わらないが、壊れはしない
  }
  listeners.forEach((l) => l());
}

export function resetCalendarPrefs() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 同上
  }
  listeners.forEach((l) => l());
}

/** 表示の好みを読む。サーバーで描くときは初期値 */
export function useCalendarPrefs(): CalendarPrefs {
  return useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_CALENDAR_PREFS);
}
