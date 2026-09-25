import { NextRequest, NextResponse } from "next/server";
import { getSupabaseBrowser } from "@/lib/supabase";

// Supabase magic-link redirect target: exchanges the auth code for a
// session cookie via the browser client, then sends the user to their portal.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const supabase = getSupabaseBrowser();
  if (code && supabase) {
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL("/teacher", url.origin));
}
