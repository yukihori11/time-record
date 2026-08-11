import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from './contexts/AuthContext';

export const metadata: Metadata = {
  title: '民泊 勤怠管理',
  description: '民泊スタッフの勤怠・給与・シフト・予約管理',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '勤怠管理',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // maximumScale は制限しない（拡大できないとアクセシビリティを損なう）
  themeColor: '#ffffff',
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body className="antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
