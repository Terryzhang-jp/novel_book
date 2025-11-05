/**
 * Supabase Admin Client
 *
 * Uses service_role key - BYPASSES Row Level Security (RLS)
 * ⚠️ ONLY use in server-side code (API routes)
 * ⚠️ NEVER expose this client to the browser
 *
 * Use cases:
 * - Administrative operations
 * - Bypassing RLS when necessary
 * - System-level operations
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseAdminInstance: SupabaseClient | null = null;

/**
 * Get Supabase admin client (lazy initialization)
 * ⚠️ Bypasses RLS - use with caution!
 */
function getSupabaseAdmin(): SupabaseClient {
  if (supabaseAdminInstance) {
    return supabaseAdminInstance;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing Supabase admin environment variables');
  }

  supabaseAdminInstance = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return supabaseAdminInstance;
}

/**
 * Admin client with service_role key
 * ⚠️ Bypasses RLS - use with caution!
 */
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(target, prop) {
    const client = getSupabaseAdmin();
    const value = client[prop as keyof SupabaseClient];
    return typeof value === 'function' ? value.bind(client) : value;
  }
});
