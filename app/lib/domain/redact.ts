/**
 * ログに出す前に秘密情報を伏せる。
 *
 * パスワードやトークンが Vercel のログに残ると、
 * ログの閲覧権限だけでアカウントを乗っ取れてしまう。
 *
 * サーバー専用モジュールから切り出しているのは、
 * この判定をテストで検証できるようにするため。
 */

/** 値を伏せるキー。部分一致で判定する。 */
const SECRET_KEYS = [
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'tokenhash',
  'p256dh',
  'auth',
  'secret',
  'apikey',
  'cookie',
];

const MAX_DEPTH = 4;
const MAX_ARRAY = 20;
const MAX_STRING = 300;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[深すぎ]';
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    // 長い配列をそのまま出すとログが読めなくなる
    if (value.length > MAX_ARRAY) return `[${value.length}件]`;
    return value.map((v) => redact(v, depth + 1));
  }

  if (value instanceof Date) return value.toISOString();

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const lower = k.toLowerCase();
      if (SECRET_KEYS.some((s) => lower.includes(s))) {
        out[k] = '[伏字]';
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }

  if (typeof value === 'string' && value.length > MAX_STRING) {
    return `${value.slice(0, MAX_STRING)}…(${value.length}文字)`;
  }

  return value;
}
