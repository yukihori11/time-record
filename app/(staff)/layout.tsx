import RoleGuard from '@/app/components/guards/RoleGuard';
import BottomNav from '@/app/components/layout/BottomNav';

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard>
      <div className="min-h-dvh bg-slate-50 pb-20">{children}</div>
      <BottomNav />
    </RoleGuard>
  );
}
