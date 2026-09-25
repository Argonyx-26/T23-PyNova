import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function supabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

export function supabaseAdminConfigured(): boolean {
  return Boolean(url && serviceKey);
}

/** Browser client — safe on client, null when env not set (demo mode). */
let browserClient: SupabaseClient | null | undefined;
export function getSupabaseBrowser(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (browserClient !== undefined) return browserClient;
  browserClient = url && anonKey ? createClient(url, anonKey) : null;
  return browserClient;
}

/** Server-side admin client (service role) — never expose to the browser. */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
