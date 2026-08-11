import { describe, expect, it } from 'vitest';
import { redact } from './redact';

describe('ログの伏字', () => {
  it('パスワードを伏せる', () => {
    expect(redact({ email: 'a@b.com', password: 'secret123' })).toEqual({
      email: 'a@b.com',
      password: '[伏字]',
    });
  });

  it('トークン類をすべて伏せる', () => {
    const r = redact({
      accessToken: 'x',
      refreshToken: 'y',
      tokenHash: 'z',
      token_hash: 'w',
    }) as Record<string, unknown>;

    expect(Object.values(r).every((v) => v === '[伏字]')).toBe(true);
  });

  it('プッシュ通知の鍵を伏せる', () => {
    const r = redact({ p256dh: 'key', auth: 'secret' }) as Record<
      string,
      unknown
    >;
    expect(r.p256dh).toBe('[伏字]');
    expect(r.auth).toBe('[伏字]');
  });

  it('大文字小文字を問わず判定する', () => {
    const r = redact({ Password: 'x', ACCESS_TOKEN: 'y' }) as Record<
      string,
      unknown
    >;
    expect(r.Password).toBe('[伏字]');
    expect(r.ACCESS_TOKEN).toBe('[伏字]');
  });

  it('入れ子の中も伏せる', () => {
    expect(redact({ body: { user: { password: 'x' } } })).toEqual({
      body: { user: { password: '[伏字]' } },
    });
  });

  it('配列の中も伏せる', () => {
    expect(redact([{ password: 'x' }, { password: 'y' }])).toEqual([
      { password: '[伏字]' },
      { password: '[伏字]' },
    ]);
  });

  it('長い配列は件数だけにする', () => {
    expect(redact(new Array(50).fill(1))).toBe('[50件]');
  });

  it('長い文字列は切り詰める', () => {
    const long = 'a'.repeat(500);
    const result = redact(long) as string;
    expect(result.length).toBeLessThan(400);
    expect(result).toContain('500文字');
  });

  it('深すぎる入れ子で止まる', () => {
    const deep = { a: { b: { c: { d: { e: { f: 'x' } } } } } };
    expect(JSON.stringify(redact(deep))).toContain('深すぎ');
  });

  it('通常の値はそのまま残す', () => {
    expect(redact({ userId: 'u1', count: 3, ok: true })).toEqual({
      userId: 'u1',
      count: 3,
      ok: true,
    });
  });

  it('null と undefined を壊さない', () => {
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
  });

  it('Date は文字列にする', () => {
    const d = new Date('2026-08-15T10:00:00Z');
    expect(redact(d)).toBe('2026-08-15T10:00:00.000Z');
  });
});
