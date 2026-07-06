"use client";

/**
 * Slim, dismissible banner shown when a source needs attention (error /
 * needs_reauth) or the Mac agent has gone quiet for 48h+. Renders nothing
 * when healthy. Dismissal is per-session (sessionStorage) — reappears on
 * the next browser session if the underlying issue is still there.
 */
import { useState } from "react";
import Link from "next/link";

const DISMISS_KEY = "staleness-banner-dismissed";

function wasDismissed(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(DISMISS_KEY) === "1";
}

export function StalenessBanner({
  stale,
  reasons,
}: {
  stale: boolean;
  reasons: string[];
}) {
  // Lazy initializer reads sessionStorage once on mount (client-only via the
  // typeof window guard) — no effect needed, so no flash and no extra render.
  const [dismissed, setDismissed] = useState(wasDismissed);

  if (!stale || dismissed) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b px-4 py-2 text-[12.5px] md:px-6"
      style={{
        background: "rgba(177,66,40,0.08)",
        borderColor: "var(--rule)",
        color: "var(--madder)",
      }}
    >
      <span className="font-medium">
        {reasons[0]}
        {reasons.length > 1 ? ` (+${reasons.length - 1} more)` : ""}
      </span>
      <Link href="/settings/sources" className="underline underline-offset-2">
        Review sources →
      </Link>
      <button
        onClick={() => {
          sessionStorage.setItem(DISMISS_KEY, "1");
          setDismissed(true);
        }}
        aria-label="Dismiss"
        className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[14px] leading-none"
        style={{ color: "var(--madder)" }}
      >
        ×
      </button>
    </div>
  );
}
