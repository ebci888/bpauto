import { redirect } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type StaffRole = 'owner' | 'mechanic' | 'staff';

export async function getCurrentStaff() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const admin = getSupabaseAdmin();
  const ownerEmail = process.env.OWNER_EMAIL?.toLowerCase();
  const role: StaffRole = ownerEmail && user.email?.toLowerCase() === ownerEmail ? 'owner' : 'staff';

  await admin.from('profiles').upsert(
    {
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name ?? '',
      role
    },
    { onConflict: 'id' }
  );

  const { data: profile } = await admin.from('profiles').select('*').eq('id', user.id).single();
  return { user, profile };
}

export async function requireStaff() {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/dashboard/login');
  return staff;
}
