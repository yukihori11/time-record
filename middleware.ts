import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// セッションの更新と未認証アクセスのブロック。
//
// Supabase の Cookie は有効期限が短いため、ここでリフレッシュする。
// これをやらないと、しばらく開いていたタブで打刻が失敗する。

const PUBLIC_PATHS = [
  '/login',
  '/forgot-password',
  // パスワード再設定。まだログインできない人が通るので認証を求めない
  '/reset-password',
  '/auth/callback',
  '/api/auth/login',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { pathname } = request.nextUrl;

  // API ルートは各ハンドラが requireUser / requireAdmin で認証する。
  // ここでも getUser() を呼ぶと Supabase の認証サーバーへの往復が
  // リクエストごとに二重に発生し、体感速度をはっきり損なう。
  // セッションの更新はページ遷移時に行われるので、それで足りる。
  if (pathname.startsWith('/api/')) {
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
  }

  // 環境変数が無いと createServerClient が例外を投げ、
  // middleware ごとクラッシュして全ページが 500 になる。
  // 設定漏れに気づけるよう、ログを残して素通しする。
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      '[middleware] SUPABASE_URL / SUPABASE_ANON_KEY が未設定です。' +
        'Vercel の Environment Variables を確認してください。'
    );
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, {
              ...options,
              httpOnly: true,
              sameSite: 'lax',
              secure: process.env.NODE_ENV === 'production',
              path: '/',
            });
          }
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // パスワード再設定のリンクを取りこぼさない。
  //
  // Supabase の Redirect URLs の設定によっては、指定した
  // リンク先が無視されて Site URL（トップ）に飛ばされる。
  // その状態でここが未認証としてログイン画面へ送ると、
  // 認証用の code が失われてパスワードを設定できなくなる。
  //
  // code が付いていたら、認証を待たずに交換処理へ回す。
  const code = request.nextUrl.searchParams.get('code');
  if (code && pathname === '/') {
    const next = request.nextUrl.searchParams.get('next') ?? '/reset-password';
    const callback = new URL('/auth/callback', request.url);
    callback.searchParams.set('code', code);
    callback.searchParams.set('next', next);
    return NextResponse.redirect(callback);
  }

  // トップは未認証でも通す。
  //
  // ハッシュ（#access_token=...）はサーバーに届かないため、
  // ここでログイン画面へ送るとリンクの情報が失われる。
  // 画面側で判定し、認証情報が無ければログインへ送る。
  if (!user && !isPublic(pathname) && pathname !== '/') {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ログイン済みでログイン画面に来たらトップへ
  if (user && (pathname === '/login' || pathname === '/forgot-password')) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // クリックジャッキング等の基本的な防御
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}

export const config = {
  matcher: [
    // 静的ファイルと画像を除く全てのパス。
    //
    // sw.js を除外しないと Service Worker の取得が
    // ログイン画面へリダイレクトされ、登録できずに
    // プッシュ通知が一切動かなくなる。
    '/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest|sw\\.js|icon\\.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
