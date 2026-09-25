"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser, supabaseConfigured } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

/** Compact auth widget for portal headers. Renders nothing when Supabase is off. */
export default function AuthMenu() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const configured = supabaseConfigured();

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!configured) return null;

  if (!ready) return <div className="h-8 w-24 animate-pulse rounded-lg bg-surface-container-low" />;

  if (!user) {
    return (
      <Link
        href="/login"
        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 font-label-md text-label-md font-semibold text-on-primary shadow-sm transition-opacity hover:opacity-90"
      >
        <span className="material-symbols-outlined text-[16px]">login</span>
        <span>Sign in</span>
      </Link>
    );
  }

  const label = user.email?.split("@")[0] ?? "user";
  return (
    <div className="flex items-center gap-2">
      <div className="hidden text-right sm:block">
        <p className="font-label-md text-label-md leading-tight text-on-surface">{label}</p>
        <p className="font-label-sm text-label-sm text-on-surface-variant">Signed in</p>
      </div>
      <button
        onClick={async () => {
          await getSupabaseBrowser()?.auth.signOut();
        }}
        title={user.email ?? ""}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-primary font-label-md text-label-md font-bold text-on-primary shadow-sm"
      >
        {label.slice(0, 2).toUpperCase()}
      </button>
    </div>
  );
}
