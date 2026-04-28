"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "sending" }
    | { kind: "sent" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "sending" });
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setStatus({ kind: "error", message: error.message });
    } else {
      setStatus({ kind: "sent" });
    }
  }

  async function signInWithGoogle() {
    setStatus({ kind: "sending" });
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // Force consent on first run so the user sees the right account
        // chooser; Supabase still receives the same id_token afterwards.
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      setStatus({ kind: "error", message: error.message });
    }
    // On success, the browser navigates to Google — no further state to set.
  }

  return (
    <main
      className="flex min-h-dvh items-center justify-center px-6"
      style={{ background: "var(--stone)", color: "var(--ink)" }}
    >
      <div
        className="w-full max-w-[420px] rounded-[12px] border p-10"
        style={{
          background: "var(--stone-raised)",
          borderColor: "var(--rule)",
        }}
      >
        <p
          className="mb-2 text-[11.5px] font-medium uppercase tracking-[0.14em]"
          style={{ color: "var(--ink-faint)" }}
        >
          net-work
        </p>
        <h1 className="serif-display mb-3 text-[36px] leading-none">
          Sign in.
        </h1>
        <p
          className="mb-7 text-sm leading-relaxed"
          style={{ color: "var(--ink-muted)" }}
        >
          Sign in with the Google account that owns your contacts.
        </p>

        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={status.kind === "sending"}
          className="mb-5 flex w-full items-center justify-center gap-3 rounded-[8px] border px-4 py-3 text-sm font-medium transition-colors disabled:opacity-60"
          style={{
            background: "var(--stone)",
            borderColor: "var(--rule)",
            color: "var(--ink)",
          }}
        >
          {/* Google "G" mark */}
          <svg viewBox="0 0 18 18" className="h-[18px] w-[18px]" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.836.86-3.048.86-2.344 0-4.328-1.583-5.036-3.71H.957v2.332A8.997 8.997 0 0 0 9 18z" />
            <path fill="#FBBC05" d="M3.964 10.708A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.708V4.96H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.04l3.007-2.332z" />
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.96l3.007 2.332C4.672 5.163 6.656 3.58 9 3.58z" />
          </svg>
          Continue with Google
        </button>

        <div className="mb-5 flex items-center gap-3">
          <div className="h-px flex-1" style={{ background: "var(--rule)" }} />
          <span className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--ink-faint)" }}>or email link</span>
          <div className="h-px flex-1" style={{ background: "var(--rule)" }} />
        </div>

        {status.kind === "sent" ? (
          <div
            className="rounded-[8px] border p-4 text-sm leading-relaxed"
            style={{
              background: "var(--brass-soft)",
              borderColor: "var(--brass)",
              color: "var(--brass-deep)",
            }}
          >
            Check your inbox at <strong>{email}</strong>. The link signs you in.
          </div>
        ) : (
          <form onSubmit={send} className="flex flex-col gap-3">
            <label
              className="text-xs font-medium tracking-[0.04em]"
              style={{ color: "var(--ink-muted)" }}
              htmlFor="email"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="rounded-[7px] border bg-transparent px-3 py-2.5 text-sm outline-none focus:border-[color:var(--brass)]"
              style={{ borderColor: "var(--rule)", color: "var(--ink)" }}
            />
            <button
              type="submit"
              disabled={status.kind === "sending"}
              className="mt-2 rounded-[7px] px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
              style={{ background: "var(--ink)", color: "var(--stone)" }}
            >
              {status.kind === "sending" ? "Sending…" : "Send magic link"}
            </button>
            {status.kind === "error" && (
              <p
                className="mt-1 text-xs"
                style={{ color: "var(--cold-red)" }}
              >
                {status.message}
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
