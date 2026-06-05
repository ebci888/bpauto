import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requiredEnv } from '@/lib/env';

let adminClient: SupabaseClient<any> | null = null;

export function getSupabaseAdmin() {
  if (!adminClient) {
    adminClient = createClient<any>(requiredEnv('NEXT_PUBLIC_SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }
  return adminClient;
}
