/**
 * Legacy single-client entry. Prefer:
 *   - `@/lib/supabase/client` in Client Components
 *   - `@/lib/supabase/server` in Server Components / Route Handlers
 */
export { createClient as createBrowserSupabase } from "./supabase/client";
