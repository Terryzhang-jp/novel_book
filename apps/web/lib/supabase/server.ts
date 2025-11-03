/**
 * Supabase Client for Server-Side (API Routes)
 *
 * Used in API routes and Server Components.
 * Uses anon key - protected by Row Level Security (RLS)
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

/**
 * Create a Supabase client for server-side operations
 * This respects Row Level Security policies
 */
export function createServerClient() {
  return createClient(supabaseUrl, supabaseAnonKey);
}

export const supabase = createServerClient();
