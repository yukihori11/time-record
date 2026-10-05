import { describe, expect, it } from 'vitest';
import { isAllowedIcalUrl, looksLikeIcal, parseAirbnbIcal } from './ical';

// Airbnb の出力に近い形。予約は Reserved、売り止めは Airbnb (Not available)
const SAMPLE = [
  'BEGIN:VCALENDAR',
  'PRODID;X-RICAL-TZSOURCE=TZINFO:-//Airbnb Inc//Hosting Calendar 1.0//EN',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'DTEND;VALUE=DATE:20261012',
  'DTSTART;VALUE=DATE:20261010',
  'UID:1418fb94e984-aaaa@airbnb.com',
  'DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/d',
  ' etails/HMABCD1234\\nPhone Number (Last 4 Digits): 1234',
  'SUMMARY:Reserved',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTEND;VALUE=DATE:20261020',
  'DTSTART;VALUE=DATE:20261015',
  'UID:7f3e-bbbb@airbnb.com',
  'SUMMARY:Airbnb (Not available)',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('parseAirbnbIcal', () => {
  it('予約とブロックを読み分ける', () => {
    const stays = parseAirbnbIcal(SAMPLE);
    expect(stays).toEqual([
      {
        uid: '1418fb94e984-aaaa@airbnb.com',
        kind: 'reserved',
        checkIn: '2026-10-10',
        checkOut: '2026-10-12',
        reservationCode: 'HMABCD1234',
      },
      {
        uid: '7f3e-bbbb@airbnb.com',
        kind: 'blocked',
        checkIn: '2026-10-15',
        checkOut: '2026-10-20',
        reservationCode: null,
      },
    ]);
  });

  it('折り返された行をつないで予約コードを読む', () => {
    const [stay] = parseAirbnbIcal(SAMPLE);
    expect(stay.reservationCode).toBe('HMABCD1234');
  });

  it('LF だけの改行でも読める', () => {
    expect(parseAirbnbIcal(SAMPLE.replace(/\r\n/g, '\n'))).toHaveLength(2);
  });

  it('予約コードがあれば題名が違っても予約とみなす', () => {
    const text = SAMPLE.replace('SUMMARY:Reserved', 'SUMMARY:予約済み');
    expect(parseAirbnbIcal(text)[0].kind).toBe('reserved');
  });

  it('日付が読めない・期間が0日の予定は捨てる', () => {
    const text = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:no-date',
      'SUMMARY:Reserved',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:zero',
      'DTSTART;VALUE=DATE:20261010',
      'DTEND;VALUE=DATE:20261010',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n');
    expect(parseAirbnbIcal(text)).toEqual([]);
  });
});

describe('looksLikeIcal', () => {
  it('iCal の本文だけを通す', () => {
    expect(looksLikeIcal(SAMPLE)).toBe(true);
    expect(looksLikeIcal('<!DOCTYPE html><html>')).toBe(false);
  });
});

describe('isAllowedIcalUrl', () => {
  it('Airbnb の https を通す', () => {
    expect(isAllowedIcalUrl('https://www.airbnb.com/calendar/ical/123.ics?s=abc')).toBe(true);
    expect(isAllowedIcalUrl('https://www.airbnb.jp/calendar/ical/123.ics?s=abc')).toBe(true);
    expect(isAllowedIcalUrl('https://www.airbnb.co.jp/calendar/ical/123.ics')).toBe(true);
  });

  it('http・他のドメイン・紛らわしいドメインを弾く', () => {
    expect(isAllowedIcalUrl('http://www.airbnb.com/calendar/ical/1.ics')).toBe(false);
    expect(isAllowedIcalUrl('https://example.com/airbnb.ics')).toBe(false);
    expect(isAllowedIcalUrl('https://airbnb.com.evil.example/x.ics')).toBe(false);
    expect(isAllowedIcalUrl('https://evilairbnb.com/x.ics')).toBe(false);
    expect(isAllowedIcalUrl('https://www.airbnb.com:8443/x.ics')).toBe(false);
    expect(isAllowedIcalUrl('not a url')).toBe(false);
  });
});
