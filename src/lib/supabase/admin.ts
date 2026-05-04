/**
 * Admin Supabase client. Uses service_role — BYPASSES ALL RLS.
 *
 * NEVER expose to the browser. Use only in:
 * - Server Actions / Route Handlers that absolutely need to bypass RLS
 *   (e.g. write to ai_usage_logs from a Cron, or admin user-creation flows)
 * - One-off migration scripts
 *
 * Default to the regular `createClient()` from server.ts unless you have a
 * specific reason to skip RLS.
 */
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
