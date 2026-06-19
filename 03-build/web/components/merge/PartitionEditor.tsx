"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export interface PartitionRecord {
  id: string;
  name: string | null;
  sourceKind: string;
  email: string | null;
  phone: string | null;
  contactId: string | null;
  savedName: string | null;
}
export interface InvolvedContact {
  id: string;
  name: string;
}

interface Bucket {
  key: string;
  name: string;
  keepContactId: string; // "" = new contact
}

const SKIP = "skip";

/**
 * Sort a merge group's records across multiple people. Each column is one
 * person; drag a record between columns (or use its "Move to" menu on touch).
 * Columns become separate contacts on save. Records left in "Leave as-is" stay
 * on their current contact. See partitionCandidate in lib/merge/apply.ts.
 */
export function PartitionEditor({
  candidateId,
  records,
  involvedContacts,
}: {
  candidateId: string;
  records: PartitionRecord[];
  involvedContacts: InvolvedContact[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  // Seed the two columns with the most common saved names in the group.
  const seeds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of records) {
      const n = (r.savedName ?? r.name ?? "").trim();
      if (n) counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
    return [top[0] ?? "Person 1", top[1] ?? "Person 2"];
  }, [records]);

  const [buckets, setBuckets] = useState<Bucket[]>([
    { key: "b1", name: seeds[0], keepContactId: "" },
    { key: "b2", name: seeds[1], keepContactId: "" },
  ]);
  // Everything starts in the first column; the user pulls records out.
  const [assign, setAssign] = useState<Record<string, string>>(() =>
    Object.fromEntries(records.map((r) => [r.id, "b1"])),
  );

  const place = (rawId: string, dest: string) =>
    setAssign((a) => ({ ...a, [rawId]: dest }));
  const rename = (key: string, name: string) =>
    setBuckets((b) => b.map((x) => (x.key === key ? { ...x, name } : x)));
  const setKeep = (key: string, keepContactId: string) =>
    setBuckets((b) =>
      b.map((x) => (x.key === key ? { ...x, keepContactId } : x)),
    );
  const addPerson = () =>
    setBuckets((b) => [
      ...b,
      { key: `b${b.length + 1}_${Date.now()}`, name: `Person ${b.length + 1}`, keepContactId: "" },
    ]);

  const columns: Bucket[] = [
    ...buckets,
    { key: SKIP, name: "Leave as-is", keepContactId: "" },
  ];
  const recordsIn = (key: string) =>
    records.filter((r) => (assign[r.id] ?? "b1") === key);

  function submit() {
    start(async () => {
      setMsg(null);
      const payload = buckets
        .map((b) => ({
          keepContactId: b.keepContactId || null,
          name: b.keepContactId ? undefined : b.name.trim() || undefined,
          rawIds: recordsIn(b.key).map((r) => r.id),
        }))
        .filter((b) => b.rawIds.length > 0);
      if (payload.length === 0) {
        setMsg("Assign records to at least one person.");
        return;
      }
      const r = await fetch(`/api/merge/${candidateId}/partition`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ buckets: payload }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setMsg("Error: " + (j.error ?? "failed"));
        return;
      }
      const j = await r.json();
      setMsg(`Created ${j.contactIds.length} separate contact(s).`);
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
        Split into separate people…
      </button>
    );
  }

  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--rule)", background: "var(--stone-raised)" }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold">
          Sort records into separate people
        </span>
        <button
          onClick={() => setOpen(false)}
          className="text-[12px]"
          style={{ color: "var(--ink-muted)" }}
        >
          Cancel
        </button>
      </div>
      <p className="mb-3 text-[12px]" style={{ color: "var(--ink-muted)" }}>
        Drag a record to another column, or use its “Move to” menu. Each column
        becomes its own contact. Records left in “Leave as-is” aren’t touched.
      </p>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((col) => {
          const isSkip = col.key === SKIP;
          const items = recordsIn(col.key);
          return (
            <div
              key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const id = e.dataTransfer.getData("text/plain");
                if (id) place(id, col.key);
              }}
              className="flex w-[230px] flex-shrink-0 flex-col gap-2 rounded-lg border p-2.5"
              style={{
                borderColor: "var(--rule)",
                background: isSkip ? "var(--stone-sunken)" : "var(--stone)",
              }}
            >
              <div className="flex flex-col gap-1.5">
                {isSkip ? (
                  <span
                    className="text-[12px] font-semibold"
                    style={{ color: "var(--ink-muted)" }}
                  >
                    Leave as-is ({items.length})
                  </span>
                ) : (
                  <>
                    <input
                      value={col.name}
                      onChange={(e) => rename(col.key, e.target.value)}
                      placeholder="Name"
                      className="w-full rounded border bg-transparent px-2 py-1 text-[13px] font-semibold"
                      style={{ borderColor: "var(--rule)" }}
                    />
                    {involvedContacts.length > 0 && (
                      <select
                        value={col.keepContactId}
                        onChange={(e) => setKeep(col.key, e.target.value)}
                        className="w-full rounded border bg-transparent px-2 py-1 text-[11px]"
                        style={{ borderColor: "var(--rule)", color: "var(--ink-muted)" }}
                      >
                        <option value="">→ New contact</option>
                        {involvedContacts.map((c) => (
                          <option key={c.id} value={c.id}>
                            Keep “{c.name}”
                          </option>
                        ))}
                      </select>
                    )}
                    <span
                      className="text-[10.5px]"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      {items.length} record{items.length === 1 ? "" : "s"}
                    </span>
                  </>
                )}
              </div>

              {items.map((r) => (
                <div
                  key={r.id}
                  draggable
                  onDragStart={(e) =>
                    e.dataTransfer.setData("text/plain", r.id)
                  }
                  className="cursor-grab rounded-md border bg-[var(--stone-raised)] px-2.5 py-2"
                  style={{ borderColor: "var(--rule)" }}
                >
                  <div
                    className="text-[9.5px] font-semibold uppercase tracking-[0.06em]"
                    style={{ color: "var(--brass-deep)" }}
                  >
                    {r.sourceKind.replace(/_/g, " ")}
                  </div>
                  <div className="truncate text-[12px] font-medium">
                    {r.name ?? "—"}
                  </div>
                  <div
                    className="truncate text-[11px] tabular-nums"
                    style={{ color: "var(--ink-muted)" }}
                  >
                    {r.email ?? r.phone ?? "no contact info"}
                  </div>
                  <select
                    value={assign[r.id] ?? "b1"}
                    onChange={(e) => place(r.id, e.target.value)}
                    className="mt-1.5 w-full rounded border bg-transparent px-1.5 py-1 text-[11px]"
                    style={{ borderColor: "var(--rule)" }}
                    aria-label="Move record to"
                  >
                    {buckets.map((b) => (
                      <option key={b.key} value={b.key}>
                        {b.name || "Person"}
                      </option>
                    ))}
                    <option value={SKIP}>Leave as-is</option>
                  </select>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        <button
          onClick={addPerson}
          className="rounded-md border px-3 py-1.5 text-[12.5px] font-medium"
          style={{ borderColor: "var(--rule)", color: "var(--ink)" }}
        >
          + Add person
        </button>
        <button
          onClick={submit}
          disabled={pending}
          className="rounded-md border-0 bg-[var(--ink)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--stone)] disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save split"}
        </button>
        {msg && (
          <span className="text-[12px]" style={{ color: "var(--ink-muted)" }}>
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}
