"use client";

/**
 * "Sync & rebuild" — calls /api/rebuild in a loop (each call does one bounded
 * chunk) until the pipeline reports done, streaming progress inline. One click
 * pulls all history, merges, enriches, and links correspondence.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

type Pass = {
  phase: "syncing" | "done";
  done: boolean;
  detail: string;
  syncedThreads?: number;
  stats?: {
    merged?: number;
    contactsCreated?: number;
    contactsEnriched?: number;
    emailThreadsLinked?: number;
  };
};

export function RebuildButton() {
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const router = useRouter();

  async function run() {
    setRunning(true);
    setError(false);
    setStatus("Starting…");
    let totalThreads = 0;
    try {
      // Backstop iteration cap — the loop normally ends when a pass is `done`.
      for (let i = 0; i < 300; i++) {
        const res = await fetch("/api/rebuild", { method: "POST" });
        if (!res.ok) {
          setError(true);
          setStatus(`Error (${res.status}) — try again`);
          return;
        }
        const pass = (await res.json()) as Pass;
        if (pass.done) {
          const s = pass.stats ?? {};
          setStatus(
            `Done — ${s.merged ?? 0} merged · ${s.contactsCreated ?? 0} new contacts · ${s.emailThreadsLinked ?? 0} email threads linked`,
          );
          break;
        }
        totalThreads += pass.syncedThreads ?? 0;
        setStatus(`${pass.detail} · ${totalThreads} synced so far…`);
      }
    } catch (e) {
      setError(true);
      setStatus(`Error — ${(e as Error).message}`);
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={run}
        disabled={running}
        className="rounded-[8px] px-4 py-[9px] text-[13.5px] font-semibold transition-colors disabled:opacity-60"
        style={{ background: "var(--ink)", color: "var(--stone)" }}
      >
        {running ? "Working…" : "Sync & rebuild"}
      </button>
      {status && (
        <span
          className="text-[12px] tabular-nums"
          style={{ color: error ? "var(--madder)" : "var(--ink-muted)" }}
        >
          {status}
        </span>
      )}
    </div>
  );
}
