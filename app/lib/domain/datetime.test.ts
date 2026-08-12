import { describe, expect, it } from 'vitest';
import { isPast, todayJst } from './datetime';

/**
 * isPast はシフトの回答を変更できるかの判定に使う。
 *
 * 過ぎた日の承諾を辞退へ変えられると、実際に働いた記録と
 * 食い違ってしまうため、境界を正確に扱う必要がある。
 * サーバー側（0027）も同じ判定をしている。
 */
describe('isPast', () => {
  // JST の 2026-08-12 09:00（UTC では 00:00）
  const now = new Date('2026-08-12T00:00:00Z');

  it('昨日は過ぎている', () => {
    expect(isPast('2026-08-11', now)).toBe(true);
  });

  it('当日は過ぎていない', () => {
    // 朝のうちに承諾を取り消したいことがあるため、
    // 当日はまだ変更できる扱いにする
    expect(isPast('2026-08-12', now)).toBe(false);
  });

  it('明日は過ぎていない', () => {
    expect(isPast('2026-08-13', now)).toBe(false);
  });

  it('月をまたいでも比較できる', () => {
    expect(isPast('2026-07-31', now)).toBe(true);
    expect(isPast('2026-09-01', now)).toBe(false);
  });

  it('年をまたいでも比較できる', () => {
    expect(isPast('2025-12-31', now)).toBe(true);
    expect(isPast('2027-01-01', now)).toBe(false);
  });

  it('UTC では前日でも JST の当日なら過ぎていない', () => {
    // UTC 2026-08-11 16:00 = JST 2026-08-12 01:00。
    // UTC 基準で判定すると 8/12 を「未来」と誤らないが、
    // 8/11 を「当日」と誤ってしまう。
    const lateNight = new Date('2026-08-11T16:00:00Z');
    expect(todayJst(lateNight)).toBe('2026-08-12');
    expect(isPast('2026-08-11', lateNight)).toBe(true);
    expect(isPast('2026-08-12', lateNight)).toBe(false);
  });
});
