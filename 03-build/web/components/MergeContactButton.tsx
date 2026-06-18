"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Hit {
  id: string;
  displayName: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
}

/**
 * Manual "Merge duplicate…" control for a contact page. Search for another saved
 * contact, choose which one to keep, and merge — for duplicates the automatic
 * scan can't detect (totally different name AND email). Reuses the global search
 * endpoint and the same safe merge as the dedup queue.
 */
export function MergeContactButton({
  currentId,
  currentName,
}: {
  currentId: string;
  currentName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Hit | null>(null);
  const [keep, setKeep] = useState<"current" | "other">("current");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setOpen(false);
    setQ("");
    setHits([]);
    setSelected(null);
    setKeep("current");
    setError(null);
  }

  async function runSearch(term: string) {
    setQ(term);
    setSelected(null);
    if (term.trim().length < 2) {
      setHits([]);
      return;
    }
    setSearching(true);
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
      if (r.ok) {
        const j = await r.json();
        setHits((j.contacts ?? []).filter((c: Hit) => c.id !== currentId));
      }
    } finally {
      setSearching(false);
    }
  }

  function doMerge() {
    if (!selected) return;
    start(async () => {
      setError(null);
      const r = await fetch(`/api/contacts/${currentId}/merge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ otherId: selected.id, keep }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error ?? "Merge failed");
        return;
      }
      const j = await r.json();
      router.push(`/contacts/${j.contactId}`);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border px-3.5 py-2 text-[13px] font-medium"
        style={{ borderColor: "var(--rule)", color: "var(--ink)" }}
      >
        Merge duplicate…
      </button>
    );
  }

  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--rule)", background: "var(--stone-raised)" }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-semibold">
          Merge another contact into this one
        </span>
        <button
          onClick={reset}
          className="text-[12px]"
          style={{ color: "var(--ink-muted)" }}
        >
          Cancel
        </button>
      </div>

      <input
        autoFocus
        value={q}
        onChange={(e) => runSearch(e.target.value)}
        placeholder="Search by name, email, or phone…"
        className="w-full rounded-md border px-3 py-2 text-[13px]"
        style={{ borderColor: "var(--rule)", background: "var(--stone)" }}
      />

      {!selected && (
        <div className="mt-2 flex flex-col gap-1">
          {searching && (
            <span className="text-[12px]" style={{ color: "var(--ink-faint)" }}>
              Searching…
            </span>
          )}
          {!searching && q.trim().length >= 2 && hits.length === 0 && (
            <span className="text-[12px]" style={{ color: "var(--ink-faint)" }}>
              No other contacts found.
            </span>
          )}
          {hits.map((h) => (
            <button
              key={h.id}
              onClick={() => setSelected(h)}
              className="flex flex-col items-start rounded-md border px-3 py-2 text-left hover:border-[var(--brass)]"
              style={{ borderColor: "var(--rule)" }}
            >
              <span className="text-[13px] font-medium">{h.displayName}</span>
              <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
                {h.primaryEmail ?? h.primaryPhone ?? "—"}
              </span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-[13px]" style={{ color: "var(--ink-muted)" }}>
            Merge <strong>{selected.displayName}</strong> and{" "}
            <strong>{currentName}</strong> into one contact. Choose which to keep:
          </p>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="radio"
                name="keep"
                checked={keep === "current"}
                onChange={() => setKeep("current")}
              />
              Keep <strong>{currentName}</strong> (this page)
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="radio"
                name="keep"
                checked={keep === "other"}
                onChange={() => setKeep("other")}
              />
              Keep <strong>{selected.displayName}</strong>
            </label>
          </div>
          <p className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
            All records, tags, notes, and history move to the kept contact. The
            other is removed.
          </p>
          {error && (
            <span
              className="text-[12px]"
              style={{ color: "var(--cold-red,#9c4828)" }}
            >
              {error}
            </span>
          )}
          <div className="flex gap-2">
            <button
              disabled={pending}
              onClick={doMerge}
              className="rounded-md border-0 bg-[var(--ink)] px-3.5 py-2 text-[13px] font-semibold text-[var(--stone)] disabled:opacity-50"
            >
              {pending ? "Merging…" : "Merge contacts"}
            </button>
            <button
              disabled={pending}
              onClick={() => setSelected(null)}
              className="rounded-md border px-3.5 py-2 text-[13px]"
              style={{ borderColor: "var(--rule)" }}
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
