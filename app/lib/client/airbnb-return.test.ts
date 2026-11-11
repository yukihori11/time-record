import { beforeEach, describe, expect, it } from 'vitest';
import type { Stay } from '@/app/types/domain';
import { markAirbnbLeft, rememberAirbnbVisit, takeAirbnbReturn } from './airbnb-return';

// vitest は node で動くので、sessionStorage を簡単なもので置き換える
const store = new Map<string, string>();
(globalThis as { sessionStorage?: unknown }).sessionStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

const stay: Stay = {
  id: 's1',
  propertyId: 'p1',
  kind: 'reserved',
  checkIn: '2026-11-20',
  checkOut: '2026-11-22',
  reservationCode: 'HMABC',
  guestCount: null,
  note: null,
};

describe('Airbnb から戻ったときの入力欄', () => {
  beforeEach(() => store.clear());

  it('押してすぐ離れ、戻ったら一度だけ開く', () => {
    rememberAirbnbVisit(stay, { name: '介乃家 壱', color: '#f00' });
    const opened = JSON.parse(store.get('airbnb.return')!).openedAt as number;
    markAirbnbLeft(opened + 1000);
    const visit = takeAirbnbReturn(opened + 60_000);
    expect(visit?.stay.id).toBe('s1');
    expect(visit?.propertyName).toBe('介乃家 壱');
    expect(takeAirbnbReturn(opened + 61_000)).toBeNull();
  });

  it('アプリを離れていなければ開かない', () => {
    rememberAirbnbVisit(stay, undefined);
    expect(takeAirbnbReturn()).toBeNull();
  });

  it('押してから5秒を超えて離れたときは、Airbnb へ行ったとみなさない', () => {
    rememberAirbnbVisit(stay, undefined);
    const opened = JSON.parse(store.get('airbnb.return')!).openedAt as number;
    markAirbnbLeft(opened + 5001);
    expect(takeAirbnbReturn(opened + 6000)).toBeNull();
    expect(store.has('airbnb.return')).toBe(false);
  });

  it('5秒ちょうどなら離れたとみなす', () => {
    rememberAirbnbVisit(stay, undefined);
    const opened = JSON.parse(store.get('airbnb.return')!).openedAt as number;
    markAirbnbLeft(opened + 5000);
    expect(takeAirbnbReturn(opened + 6000)).not.toBeNull();
  });

  it('30分を超えて戻ったら開かない', () => {
    rememberAirbnbVisit(stay, undefined);
    const opened = JSON.parse(store.get('airbnb.return')!).openedAt as number;
    markAirbnbLeft(opened);
    expect(takeAirbnbReturn(opened + 30 * 60 * 1000 + 1)).toBeNull();
  });
});
