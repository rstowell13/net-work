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
          Enter your email and we&rsquo;ll send a one-time link.
        </p>

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
