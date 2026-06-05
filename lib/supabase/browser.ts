import { createBrowserClient } from '@supabase/ssr';
import { hasPublicSupabaseEnv, requiredEnv } from '@/lib/env';

export function createSupabaseBrowserClient() {
  if (!hasPublicSupabaseEnv()) return null;

  return createBrowserClient(requiredEnv('NEXT_PUBLIC_SUPABASE_URL'), requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'));
}
