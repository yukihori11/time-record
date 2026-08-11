import RoleGuard from '@/app/components/guards/RoleGuard';
import AppShell from '@/app/components/layout/AppNav';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard requireAdmin>
      <AppShell>{children}</AppShell>
    </RoleGuard>
  );
}
