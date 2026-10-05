import type { NextConfig } from "next";

/**
 * 全ページ・全 API に付けるセキュリティヘッダー。
 *
 * - 他のサイトの中に埋め込ませない（ボタンを押させる攻撃を防ぐ）
 * - 種類の決めつけ・遷移元 URL の漏れを防ぐ
 * - 使っていない端末の機能（位置情報・カメラ・マイク）を止める
 *
 * スクリプトを絞る CSP は Next.js のインラインスクリプトと衝突しやすいため入れていない。
 * 位置情報などを使う機能を足すときは Permissions-Policy を見直すこと。
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
