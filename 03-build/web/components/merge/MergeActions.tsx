"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function RunDedupeButton({ label = "Run dedupe" }: { label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      <button
        className="rounded-lg border-0 bg-[var(--brass)] px-[18px] py-[10px] text-[13.5px] font-semibold text-[var(--ink)] disabled:opacity-60"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await fetch("/api/merge/run", { method: "POST" });
            if (!r.ok) {
              setError(await r.text());
              return;
            }
            router.refresh();
          })
        }
      >
        {pending ? "Scanning…" : label}
      </button>
      {error && (
        <span className="text-xs text-[var(--cold-red,#9c4828)]">{error}</span>
      )}
    </div>
  );
}

export function BulkMergeButton({
  count,
  candidateIds,
}: {
  count: number;
  candidateIds: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (count === 0) return null;
  return (
    <div className="flex items-center gap-3">
      {msg && <span className="text-xs text-[var(--ink-faint)]">{msg}</span>}
      <button
        className="rounded-lg border-0 bg-[var(--brass)] px-[18px] py-[10px] text-[13.5px] font-semibold text-[var(--ink)] disabled:opacity-60"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const r = await fetch("/api/merge/bulk", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ candidateIds }),
            });
            if (!r.ok) {
              setMsg("Error: " + (await r.text()));
              return;
            }
            const j = await r.json();
            setMsg(
              `Merged ${j.applied}${j.failed ? ` · ${j.failed} failed` : ""}`,
            );
            router.refresh();
          })
        }
      >
        {pending ? "Merging…" : `Merge ${count} groups`}
      </button>
    </div>
  );
}

export function AmbiguousActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const act = (path: string) =>
    start(async () => {
      const r = await fetch(path, { method: "POST" });
      if (r.ok) router.refresh();
    });
  return (
    <div className="flex gap-2">
      <button
        disabled={pending}
        onClick={() => act(`/api/merge/${id}/approve`)}
        className="flex-1 rounded-md border border-[var(--ink)] bg-[var(--ink)] px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--stone)] disabled:opacity-50"
      >
        Approve
      </button>
      <button
        disabled={pending}
        onClick={() => act(`/api/merge/${id}/split`)}
        className="flex-1 rounded-md border border-[var(--rule)] bg-transparent px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--ink)] hover:border-[var(--cold-red,#9c4828)] hover:text-[var(--cold-red,#9c4828)] disabled:opacity-50"
      >
        Split
      </button>
    </div>
  );
}
