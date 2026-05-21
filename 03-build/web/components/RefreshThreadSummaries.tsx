"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function RefreshThreadSummaries({ contactId }: { contactId: string }) {
  const router = useRouter();
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    let cancelled = false;
    (async () => {
      // Loop: each POST processes a capped batch. Keep going until either
      // the server reports no remaining work, nothing was updated, or we hit
      // a safety cap to avoid runaway loops.
      let didAnyUpdate = false;
      for (let i = 0; i < 50 && !cancelled; i++) {
        try {
          const r = await fetch(
            `/api/contacts/${contactId}/refresh-thread-summaries`,
            { method: "POST" },
          );
          if (cancelled || !r.ok) break;
          const j = (await r.json().catch(() => ({}))) as {
            updated?: number;
            remaining?: number;
          };
          if (j.updated && j.updated > 0) didAnyUpdate = true;
          if (!j.remaining || j.remaining === 0) break;
          if (!j.updated) break; // batch made no progress; stop
        } catch {
          break;
        }
      }
      if (didAnyUpdate && !cancelled) router.refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [contactId, router]);
  return null;
}
