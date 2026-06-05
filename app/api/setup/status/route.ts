import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getNotificationSetupStatus } from '@/lib/notifications';

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
  'special_hours',
  'blocked_times',
  'booking_submission_events'
];

export async function GET() {
  const supabasePublicConfigured = configured(['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']);
  const supabaseAdminConfigured = configured(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  const notificationSetup = getNotificationSetupStatus();

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
  const readyForMessaging = notificationSetup.brevo.ready || notificationSetup.twilio.ready;
  const turnstileSiteKeyConfigured = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  const turnstileSecretConfigured = Boolean(process.env.TURNSTILE_SECRET_KEY);
  const turnstileRequired = process.env.TURNSTILE_REQUIRED === 'true';

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
      brevoConfigured: notificationSetup.brevo.ready,
      twilioConfigured: notificationSetup.twilio.ready,
      readyForMessaging
    },
    antiSpam: {
      bookingSpamShieldEnabled: migrationApplied && existingTables.includes('booking_submission_events'),
      turnstileSiteKeyConfigured,
      turnstileSecretConfigured,
      turnstileRequired,
      readyForRequiredTurnstile: !turnstileRequired || (turnstileSiteKeyConfigured && turnstileSecretConfigured)
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
