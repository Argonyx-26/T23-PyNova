"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { getSupabaseBrowser, supabaseConfigured } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const configured = supabaseConfigured();

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 font-body-md text-on-surface antialiased">
      <div className="w-full max-w-md rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-8 shadow-lg">
        <div className="mb-6 flex flex-col items-center gap-3">
          <Image src="/logo.jpg" alt="JustFormi" width={160} height={160} priority className="h-12 w-auto object-contain" />
          <p className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
            {configured ? "Sign in to your portal" : "Auth requires Supabase setup"}
          </p>
        </div>

        {!configured ? (
          <div className="flex flex-col gap-4 rounded-xl bg-surface-container-low p-4 text-center">
            <p className="font-body-md text-body-md text-on-surface-variant">
              Supabase auth isn&apos;t configured yet. Add <code className="font-label-sm">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
              and <code className="font-label-sm">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to <code>.env.local</code>, then
              restart. The portals remain fully usable in demo mode meanwhile.
            </p>
            <Link
              href="/"
              className="mx-auto rounded-lg bg-primary px-4 py-2 font-label-md text-label-md font-semibold text-on-primary"
            >
              Back to portals
            </Link>
          </div>
        ) : sent ? (
          <div className="flex flex-col gap-4 rounded-xl bg-emerald-50 p-5 text-center">
            <span className="material-symbols-outlined mx-auto text-4xl text-emerald-600">mark_email_read</span>
            <p className="font-body-md text-body-md text-emerald-900">
              Magic link sent to <strong>{email}</strong>. Check your inbox and click the link to sign in.
            </p>
            <Link href="/" className="mx-auto font-label-md text-label-md font-semibold text-primary hover:underline">
              Back to portals
            </Link>
          </div>
        ) : (
          <form onSubmit={sendMagicLink} className="flex flex-col gap-4">
            <div>
              <label htmlFor="email" className="mb-1 block font-label-md text-label-md font-semibold text-on-surface">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teacher@school.edu"
                className="w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-3 py-2.5 font-body-md text-body-md text-on-surface placeholder:text-outline focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-container/40"
              />
            </div>
            {err && <p className="font-body-sm text-body-sm text-error">{err}</p>}
            <button
              type="submit"
              disabled={busy}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-container to-secondary-container py-3 font-label-md text-label-md font-bold text-on-primary-container shadow-sm transition-all hover:opacity-95 active:scale-95 disabled:opacity-60"
            >
              <span className={`material-symbols-outlined text-[18px] ${busy ? "animate-spin" : ""}`}>
                {busy ? "progress_activity" : "send"}
              </span>
              {busy ? "Sending…" : "Send magic link"}
            </button>
            <p className="text-center font-body-sm text-body-sm text-on-surface-variant">
              Passwordless — we email you a secure sign-in link.
            </p>
            <Link href="/" className="text-center font-label-sm text-label-sm font-semibold text-primary hover:underline">
              Continue in demo mode
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
