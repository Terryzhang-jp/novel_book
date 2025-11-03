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

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing Supabase admin environment variables');
}

/**
 * Admin client with service_role key
 * ⚠️ Bypasses RLS - use with caution!
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});
