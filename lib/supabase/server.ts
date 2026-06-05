import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { hasPublicSupabaseEnv, requiredEnv } from '@/lib/env';

export async function createSupabaseServerClient() {
  if (!hasPublicSupabaseEnv()) return null;

  const cookieStore = await cookies();

  return createServerClient(requiredEnv('NEXT_PUBLIC_SUPABASE_URL'), requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot always set cookies; middleware/route handlers refresh sessions.
        }
      }
    }
  });
}
