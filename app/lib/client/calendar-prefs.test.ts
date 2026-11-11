import { describe, expect, it } from 'vitest';
import { DEFAULT_CALENDAR_PREFS, parseCalendarPrefs } from './calendar-prefs';

describe('カレンダーの表示の好み', () => {
  it('保存が無ければ初期値（すべて ON）', () => {
    expect(parseCalendarPrefs(null)).toEqual(DEFAULT_CALENDAR_PREFS);
  });

  it('保存された OFF を読む。無い項目は初期値で埋める', () => {
    const prefs = parseCalendarPrefs(JSON.stringify({ fillPastDays: false }));
    expect(prefs.fillPastDays).toBe(false);
    expect(prefs.fillCleaningDays).toBe(true);
  });

  it('壊れた値・型の違う値は無視する', () => {
    expect(parseCalendarPrefs('{')).toEqual(DEFAULT_CALENDAR_PREFS);
    expect(parseCalendarPrefs(JSON.stringify({ showGuestCount: 'no' })).showGuestCount).toBe(true);
    expect(parseCalendarPrefs('null')).toEqual(DEFAULT_CALENDAR_PREFS);
  });
});
