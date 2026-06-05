import { requireStaff } from '@/lib/auth';
import { getDashboardData } from '@/lib/shop';
import { DashboardShell } from '@/components/DashboardShell';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const staff = await requireStaff();
  const data = await getDashboardData();

  return <DashboardShell initialData={data} staffEmail={staff.user.email || ''} staffRole={staff.profile?.role || 'staff'} />;
}
