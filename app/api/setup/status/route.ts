import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function configured(names: string[]) {
  return names.every((name) => Boolean(process.env[name]));
}

const requiredTables = [
  'profiles',
  'customers',
  'vehicles',
  'booking_requests',
  'queue_items',
  'appointments',
  'notification_events',
  'audit_events',
  'shop_hours',
  'blocked_times'
];

export async function GET() {
  const supabasePublicConfigured = configured(['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']);
  const supabaseAdminConfigured = configured(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  const brevoConfigured = configured(['BREVO_API_KEY', 'BREVO_FROM_EMAIL']);
  const twilioConfigured = configured(['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM']);

  let databaseReachable = false;
  let migrationApplied = false;
  let databaseError = '';
  const existingTables: string[] = [];
  const missingTables: string[] = [];
  let ownerProfileExists = false;
  let ownerProfileRole: string | null = null;

  if (supabaseAdminConfigured) {
    try {
      const admin = getSupabaseAdmin();
      for (const table of requiredTables) {
        const { error } = await admin.from(table).select('id').limit(1);
        if (error) {
          missingTables.push(table);
          databaseError ||= error.message;
        } else {
          existingTables.push(table);
        }
      }
      databaseReachable = existingTables.length > 0;
      migrationApplied = missingTables.length === 0;

      if (migrationApplied && process.env.OWNER_EMAIL) {
        const { data: ownerProfile } = await admin
          .from('profiles')
          .select('role')
          .ilike('email', process.env.OWNER_EMAIL)
          .maybeSingle();
        ownerProfileExists = Boolean(ownerProfile);
        ownerProfileRole = ownerProfile?.role ?? null;
      }
    } catch (error) {
      databaseError = error instanceof Error ? error.message : 'Could not connect to Supabase';
    }
  }

  const readyForLogin =
    supabasePublicConfigured && supabaseAdminConfigured && migrationApplied && Boolean(process.env.OWNER_EMAIL) && ownerProfileExists;
  const readyForMessaging = brevoConfigured || twilioConfigured;

  return NextResponse.json({
    ok: readyForLogin,
    supabase: {
      publicKeysConfigured: supabasePublicConfigured,
      serviceRoleConfigured: supabaseAdminConfigured,
      databaseReachable,
      migrationApplied,
      existingTables,
      missingTables,
      error: databaseError || null
    },
    auth: {
      ownerEmailConfigured: Boolean(process.env.OWNER_EMAIL),
      ownerProfileExists,
      ownerProfileRole,
      readyForLogin
    },
    notifications: {
      brevoConfigured,
      twilioConfigured,
      readyForMessaging
    },
    nextStep: readyForLogin
      ? 'Create or sign in with the owner account, then test /dashboard.'
      : missingTables.length
        ? `Apply the Supabase migration. Missing tables: ${missingTables.join(', ')}.`
        : !ownerProfileExists
          ? 'Create the Supabase Auth owner user using OWNER_EMAIL.'
        : 'Add Supabase env vars, apply the migration, and set OWNER_EMAIL.'
  });
}
