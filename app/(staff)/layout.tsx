import RoleGuard from '@/app/components/guards/RoleGuard';
import AppShell from '@/app/components/layout/AppNav';

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard>
      <AppShell>{children}</AppShell>
    </RoleGuard>
  );
}
