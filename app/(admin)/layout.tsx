import RoleGuard from '@/app/components/guards/RoleGuard';
import BottomNav from '@/app/components/layout/BottomNav';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard requireAdmin>
      <div className="min-h-dvh bg-slate-50 pb-20">{children}</div>
      <BottomNav />
    </RoleGuard>
  );
}
