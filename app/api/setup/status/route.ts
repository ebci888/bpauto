import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function configured(names: string[]) {
  return names.every((name) => Boolean(process.env[name]));
}

export async function GET() {
  const supabasePublicConfigured = configured(['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']);
  const supabaseAdminConfigured = configured(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  const brevoConfigured = configured(['BREVO_API_KEY', 'BREVO_FROM_EMAIL']);
  const twilioConfigured = configured(['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM']);

  let databaseReachable = false;
  let migrationApplied = false;
  let databaseError = '';

  if (supabaseAdminConfigured) {
    try {
      const admin = getSupabaseAdmin();
      const { error } = await admin.from('profiles').select('id', { count: 'exact', head: true });
      databaseReachable = !error;
      migrationApplied = !error;
      databaseError = error?.message ?? '';
    } catch (error) {
      databaseError = error instanceof Error ? error.message : 'Could not connect to Supabase';
    }
  }

  const readyForLogin = supabasePublicConfigured && supabaseAdminConfigured && migrationApplied && Boolean(process.env.OWNER_EMAIL);
  const readyForMessaging = brevoConfigured || twilioConfigured;

  return NextResponse.json({
    ok: readyForLogin,
    supabase: {
      publicKeysConfigured: supabasePublicConfigured,
      serviceRoleConfigured: supabaseAdminConfigured,
      databaseReachable,
      migrationApplied,
      error: databaseError || null
    },
    auth: {
      ownerEmailConfigured: Boolean(process.env.OWNER_EMAIL),
      readyForLogin
    },
    notifications: {
      brevoConfigured,
      twilioConfigured,
      readyForMessaging
    },
    nextStep: readyForLogin
      ? 'Create or sign in with the owner account, then test /dashboard.'
      : 'Add Supabase env vars, apply the migration, and set OWNER_EMAIL.'
  });
}
