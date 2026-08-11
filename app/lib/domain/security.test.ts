import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// 権限チェックの書き忘れを機械的に検出する。
// レビューで見落としても、テストが落ちれば気づける。

const APP_DIR = join(process.cwd(), 'app');

function findFiles(dir: string, filename: string): string[] {
  const results: string[] = [];

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...findFiles(full, filename));
    } else if (entry === filename) {
      results.push(full);
    }
  }

  return results;
}

const routeFiles = findFiles(join(APP_DIR, 'api'), 'route.ts');

describe('API の権限チェック', () => {
  it('管理者向けルートは必ず requireAdmin を呼ぶ', () => {
    const adminRoutes = routeFiles.filter((f) =>
      f.includes(`${join('api', 'admin')}`)
    );

    expect(adminRoutes.length).toBeGreaterThan(0);

    const missing = adminRoutes.filter(
      (f) => !readFileSync(f, 'utf8').includes('requireAdmin')
    );

    expect(missing).toEqual([]);
  });

  it('認証不要なルート以外は必ず認証を要求する', () => {
    // 未認証で叩ける必要があるルート。
    // まだログインできない人（招待された直後・パスワードを忘れた人）が
    // 通るため、認証を要求してはいけない。
    const publicRoutes = [
      'auth/login',
      'auth/logout',
      'auth/forgot-password',
      'auth/reset-password',
      'auth/verify-invite',
    ];

    const guarded = routeFiles.filter(
      (f) => !publicRoutes.some((p) => f.includes(p.replace('/', '/')))
    );

    const missing = guarded.filter((f) => {
      const src = readFileSync(f, 'utf8');
      return !src.includes('requireUser') && !src.includes('requireAdmin');
    });

    expect(missing).toEqual([]);
  });
});

describe('クライアントへの情報漏洩', () => {
  const clientDirs = [
    join(APP_DIR, 'components'),
    join(APP_DIR, 'hooks'),
    join(APP_DIR, 'contexts'),
  ];

  function collectSources(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        files.push(...collectSources(full));
      } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
        files.push(full);
      }
    }
    return files;
  }

  it('クライアントコードは Supabase を直接使わない', () => {
    const offenders: string[] = [];

    for (const dir of clientDirs) {
      for (const file of collectSources(dir)) {
        const src = readFileSync(file, 'utf8');
        if (src.includes('@supabase/')) {
          offenders.push(file);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('Supabase の接続情報が NEXT_PUBLIC_ で公開されていない', () => {
    const envFiles = ['.env.local', '.env.example'];

    for (const name of envFiles) {
      let content: string;
      try {
        content = readFileSync(join(process.cwd(), name), 'utf8');
      } catch {
        continue;
      }

      expect(content).not.toMatch(/NEXT_PUBLIC_SUPABASE/);
    }
  });
});
