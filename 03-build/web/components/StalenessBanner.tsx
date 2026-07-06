"use client";

/**
 * Slim, dismissible banner shown when a source needs attention (error /
 * needs_reauth) or the Mac agent has gone quiet for 48h+. Renders nothing
 * when healthy. Dismissal is per-session (sessionStorage) — reappears on
 * the next browser session if the underlying issue is still there.
 */
import { useSyncExternalStore } from "react";
import Link from "next/link";

const DISMISS_KEY = "staleness-banner-dismissed";

// Tiny external store over sessionStorage. useSyncExternalStore hydrates
// with the SERVER snapshot (false → banner visible, matching the server
// HTML) and re-syncs to the client snapshot after mount — no hydration
// mismatch (reading sessionStorage in the initial state caused one), and
// no setState-in-effect.
let dismissListeners: (() => void)[] = [];
function subscribeDismiss(listener: () => void) {
  dismissListeners.push(listener);
  return () => {
    dismissListeners = dismissListeners.filter((l) => l !== listener);
  };
}
function isDismissed() {
  return sessionStorage.getItem(DISMISS_KEY) === "1";
}
function dismiss() {
  sessionStorage.setItem(DISMISS_KEY, "1");
  for (const l of dismissListeners) l();
}

export function StalenessBanner({
  stale,
  reasons,
}: {
  stale: boolean;
  reasons: string[];
}) {
  const dismissed = useSyncExternalStore(
    subscribeDismiss,
    isDismissed,
    () => false,
  );

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
        onClick={dismiss}
        aria-label="Dismiss"
        className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[14px] leading-none"
        style={{ color: "var(--madder)" }}
      >
        ×
      </button>
    </div>
  );
}
