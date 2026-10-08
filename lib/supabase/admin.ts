import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. It bypasses RLS, so it is only for requests that have no
 * signed-in employee and are authenticated another way (verified channel webhooks).
 * Never import this from a client component or use it for ordinary CRM requests.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
