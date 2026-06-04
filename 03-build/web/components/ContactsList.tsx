"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { FreshnessRing } from "@/components/FreshnessRing";
import { TagChip } from "@/components/TagChip";
import { TagPicker } from "@/components/TagPicker";
import type { ContactListRow } from "@/lib/contacts/queries";
import type { Tag } from "@/lib/tags/types";

type Cat = "personal" | "business" | "both" | null;

interface SerializedRow extends Omit<ContactListRow, "lastSeenAt"> {
  lastSeenISO: string | null;
}

export function ContactsList({
  rows,
  allTags,
}: {
  rows: SerializedRow[];
  allTags: Tag[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<"recency" | "name" | "fresh">("recency");
  const [now] = useState<number>(() => Date.now());
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [tagMenu, setTagMenu] = useState<null | "add" | "remove">(null);

  const sorted = useMemo(() => {
    const copy = [...rows];
    if (sort === "name") {
      copy.sort((a, b) => a.displayName.localeCompare(b.displayName));
    } else if (sort === "fresh") {
      copy.sort((a, b) => b.freshness.score - a.freshness.score);
    } else {
      copy.sort((a, b) => {
        const at = a.lastSeenISO ? Date.parse(a.lastSeenISO) : 0;
        const bt = b.lastSeenISO ? Date.parse(b.lastSeenISO) : 0;
        return bt - at;
      });
    }
    return copy;
  }, [rows, sort]);

  const toggle = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const clearSel = () => setSelected(new Set());

  const bulk = (
    action: "keep" | "skip" | "set_category",
    category?: Cat,
  ) =>
    start(async () => {
      const r = await fetch("/api/contacts/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactIds: [...selected],
          action,
          category,
        }),
      });
      if (r.ok) {
        const j = await r.json();
        setMsg(`Updated ${j.updated}`);
        clearSel();
        router.refresh();
      } else {
        setMsg("Error");
      }
    });

  const bulkTag = (action: "add_tag" | "remove_tag", tagId: string) => {
    setTagMenu(null);
    start(async () => {
      const r = await fetch("/api/contacts/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactIds: [...selected], action, tagId }),
      });
      if (r.ok) {
        const j = await r.json();
        setMsg(`Updated ${j.updated}`);
        clearSel();
        router.refresh();
      } else {
        setMsg("Error");
      }
    });
  };

  const createAndBulkAdd = (name: string) => {
    setTagMenu(null);
    start(async () => {
      const cr = await fetch("/api/tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!cr.ok) return setMsg("Error");
      const tag = await cr.json();
      const r = await fetch("/api/contacts/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactIds: [...selected],
          action: "add_tag",
          tagId: tag.id,
        }),
      });
      if (r.ok) {
        const j = await r.json();
        setMsg(`Updated ${j.updated}`);
        clearSel();
        router.refresh();
      } else {
        setMsg("Error");
      }
    });
  };

  const allSelected =
    sorted.length > 0 && sorted.every((r) => selected.has(r.id));
  const someSelected = selected.size > 0;
  const toggleAll = () =>
    setSelected(someSelected ? new Set() : new Set(sorted.map((r) => r.id)));

  return (
    <>
      <div
        className="flex flex-wrap items-center gap-2 border-b py-3.5"
        style={{ borderColor: "var(--rule)" }}
      >
        <button
          type="button"
          onClick={toggleAll}
          aria-label={someSelected ? "Unselect all" : "Select all"}
          className="-my-1.5 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center md:hidden"
        >
          <span
            className="flex h-[18px] w-[18px] items-center justify-center rounded-sm border-[1.5px]"
            style={{
              background: someSelected ? "var(--ink)" : "transparent",
              borderColor: someSelected ? "var(--ink)" : "var(--rule)",
            }}
          >
            {allSelected ? (
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
                <path
                  d="M3 8.5l3.5 3.5L13 5"
                  stroke="var(--stone)"
                  strokeWidth={2.5}
                />
              </svg>
            ) : someSelected ? (
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
                <path
                  d="M4 8h8"
                  stroke="var(--stone)"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                />
              </svg>
            ) : null}
          </span>
        </button>
        <span
          className="text-[13px] font-medium tabular-nums"
          style={{ color: "var(--ink-muted)" }}
        >
          <strong style={{ color: "var(--ink)", fontWeight: 600 }}>
            {selected.size}
          </strong>{" "}
          selected
        </span>
        <button
          disabled={pending || selected.size === 0}
          onClick={() => bulk("keep")}
          className={tbBtnDark}
        >
          Keep
        </button>
        <button
          disabled={pending || selected.size === 0}
          onClick={() => bulk("skip")}
          className={tbBtn}
        >
          Skip
        </button>
        <select
          disabled={pending || selected.size === 0}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            bulk("set_category", v === "uncategorized" ? null : (v as Cat));
            e.target.value = "";
          }}
          className={tbBtn}
          defaultValue=""
        >
          <option value="" disabled>
            Re-categorize…
          </option>
          <option value="personal">Personal</option>
          <option value="business">Business</option>
          <option value="both">Both</option>
          <option value="uncategorized">Uncategorized</option>
        </select>
        <div className="relative">
          <button
            type="button"
            disabled={pending || selected.size === 0}
            onClick={() => setTagMenu((m) => (m === "add" ? null : "add"))}
            className={tbBtn}
          >
            Add tag…
          </button>
          {tagMenu === "add" && selected.size > 0 && (
            <div
              className="absolute left-0 top-full z-30 mt-1 w-64 rounded-md border bg-[var(--stone-raised)] p-2 shadow-lg"
              style={{ borderColor: "var(--rule)" }}
            >
              <TagPicker
                tags={allTags}
                onPick={(t) => bulkTag("add_tag", t.id)}
                onCreate={createAndBulkAdd}
                autoFocus
              />
            </div>
          )}
        </div>
        <div className="relative">
          <button
            type="button"
            disabled={pending || selected.size === 0}
            onClick={() => setTagMenu((m) => (m === "remove" ? null : "remove"))}
            className={tbBtn}
          >
            Remove tag…
          </button>
          {tagMenu === "remove" && selected.size > 0 && (
            <div
              className="absolute left-0 top-full z-30 mt-1 w-64 rounded-md border bg-[var(--stone-raised)] p-2 shadow-lg"
              style={{ borderColor: "var(--rule)" }}
            >
              <TagPicker
                tags={allTags}
                allowCreate={false}
                excludeSelected={false}
                placeholder="Remove a tag…"
                onPick={(t) => bulkTag("remove_tag", t.id)}
                onCreate={() => {}}
                autoFocus
              />
            </div>
          )}
        </div>
        {msg && (
          <span
            className="text-[12px]"
            style={{ color: "var(--ink-muted)" }}
          >
            {msg}
          </span>
        )}
        <div className="flex-1" />
        <select
          className={tbBtn}
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
        >
          <option value="recency">Sort: Last contacted</option>
          <option value="name">Sort: Name A→Z</option>
          <option value="fresh">Sort: Freshness</option>
        </select>
      </div>

      {sorted.length === 0 ? (
        <p
          className="px-3 py-8 text-[13px]"
          style={{ color: "var(--ink-muted)" }}
        >
          No contacts match these filters yet.
        </p>
      ) : (
        <>
        <div className="md:hidden">
          {sorted.map((row) => {
            const isSel = selected.has(row.id);
            const last = row.lastSeenISO ? new Date(row.lastSeenISO) : null;
            const days =
              last && now
                ? Math.floor((now - last.getTime()) / 86400_000)
                : null;
            const isCold = days !== null && days >= 180;
            return (
              <div
                key={row.id}
                className="flex items-center gap-3 border-b px-3 py-4 transition-colors active:bg-[var(--stone-raised)]"
                style={{
                  background: isSel ? "var(--brass-soft)" : undefined,
                  borderColor: "var(--rule)",
                }}
              >
                <button
                  type="button"
                  onClick={() => toggle(row.id)}
                  className="-m-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center"
                  aria-label="select"
                >
                  <span
                    className="flex h-4 w-4 items-center justify-center rounded-sm border-[1.5px]"
                    style={{
                      background: isSel ? "var(--ink)" : "transparent",
                      borderColor: isSel ? "var(--ink)" : "var(--rule)",
                    }}
                  >
                    {isSel && (
                      <svg viewBox="0 0 16 16" width="11" height="11" fill="none">
                        <path
                          d="M3 8.5l3.5 3.5L13 5"
                          stroke="var(--stone)"
                          strokeWidth={2.5}
                        />
                      </svg>
                    )}
                  </span>
                </button>
                <Link
                  href={`/contacts/${row.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <Avatar
                    id={row.id}
                    name={row.displayName}
                    photoUrl={row.photoUrl}
                    size="lg"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-[17px] font-semibold tracking-[-0.018em]">
                      {row.displayName}
                    </span>
                    <span
                      className="truncate text-[12px] tabular-nums"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      {row.primaryEmail ?? row.primaryPhone ?? "—"}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {row.category ? (
                        <span
                          className="rounded px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.04em]"
                          style={catChipStyle(row.category)}
                        >
                          {row.category}
                        </span>
                      ) : null}
                      {row.tags.slice(0, 3).map((t) => (
                        <TagChip key={t.id} name={t.name} color={t.color} />
                      ))}
                      {row.tags.length > 3 && (
                        <span
                          className="text-[10.5px]"
                          style={{ color: "var(--ink-faint)" }}
                        >
                          +{row.tags.length - 3}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex w-16 shrink-0 flex-col items-center gap-1">
                    <FreshnessRing result={row.freshness} size="md" />
                    <span
                      className="text-[11px] tabular-nums"
                      style={{
                        color: isCold ? "var(--cold-red)" : "var(--ink-muted)",
                        fontWeight: isCold ? 600 : undefined,
                      }}
                    >
                      {days === null ? "—" : `${days}d`}
                    </span>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
        <div className="hidden md:block">
        <header
          className="grid h-9 items-center gap-[18px] border-b px-3 text-[11px] font-semibold uppercase tracking-[0.12em]"
          style={{
            gridTemplateColumns:
              "24px 44px minmax(180px, 2fr) 100px minmax(120px, 1.5fr) 100px 110px",
            borderColor: "var(--rule)",
            color: "var(--ink-faint)",
          }}
        >
          <button
            type="button"
            onClick={toggleAll}
            className="flex w-full cursor-pointer items-center justify-center self-stretch"
            aria-label={someSelected ? "Unselect all" : "Select all"}
          >
            <span
              className="flex h-4 w-4 items-center justify-center rounded-sm border-[1.5px]"
              style={{
                background: someSelected ? "var(--ink)" : "transparent",
                borderColor: someSelected ? "var(--ink)" : "var(--rule)",
              }}
            >
              {allSelected ? (
                <svg viewBox="0 0 16 16" width="11" height="11" fill="none">
                  <path
                    d="M3 8.5l3.5 3.5L13 5"
                    stroke="var(--stone)"
                    strokeWidth={2.5}
                  />
                </svg>
              ) : someSelected ? (
                <svg viewBox="0 0 16 16" width="11" height="11" fill="none">
                  <path
                    d="M4 8h8"
                    stroke="var(--stone)"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                </svg>
              ) : null}
            </span>
          </button>
          <div />
          <div>Name</div>
          <div>Category</div>
          <div>Tags</div>
          <div className="text-center">Fresh</div>
          <div className="text-right">Last seen</div>
        </header>
        {sorted.map((row) => {
          const isSel = selected.has(row.id);
          const last = row.lastSeenISO ? new Date(row.lastSeenISO) : null;
          const days =
            last && now
              ? Math.floor((now - last.getTime()) / 86400_000)
              : null;
          return (
            <div
              key={row.id}
              className="grid items-center gap-[18px] border-b px-3 transition-colors hover:bg-[var(--stone-raised)]"
              style={{
                gridTemplateColumns: "24px 1fr",
                background: isSel ? "var(--brass-soft)" : undefined,
                borderColor: "var(--rule)",
              }}
            >
              <button
                type="button"
                onClick={() => toggle(row.id)}
                className="flex w-full cursor-pointer items-center justify-center self-stretch"
                aria-label="select"
              >
                <span
                  className="flex h-4 w-4 items-center justify-center rounded-sm border-[1.5px]"
                  style={{
                    background: isSel ? "var(--ink)" : "transparent",
                    borderColor: isSel ? "var(--ink)" : "var(--rule)",
                  }}
                >
                  {isSel && (
                    <svg viewBox="0 0 16 16" width="11" height="11" fill="none">
                      <path
                        d="M3 8.5l3.5 3.5L13 5"
                        stroke="var(--stone)"
                        strokeWidth={2.5}
                      />
                    </svg>
                  )}
                </span>
              </button>
              <Link
                href={`/contacts/${row.id}`}
                className="grid cursor-pointer items-center gap-[18px] py-3.5"
                style={{
                  gridTemplateColumns:
                    "44px minmax(180px, 2fr) 100px minmax(120px, 1.5fr) 100px 110px",
                }}
              >
                <Avatar
                  id={row.id}
                  name={row.displayName}
                  photoUrl={row.photoUrl}
                  size="md"
                />
                <div className="flex min-w-0 flex-col gap-0.5 overflow-hidden">
                  <span className="truncate text-[16px] font-semibold tracking-[-0.018em]">
                    {row.displayName}
                  </span>
                  <span
                    className="truncate text-[11.5px] tabular-nums"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    {row.primaryEmail ?? row.primaryPhone ?? "—"}
                  </span>
                </div>
                <div>
                  {row.category ? (
                    <span
                      className="rounded px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.04em]"
                      style={catChipStyle(row.category)}
                    >
                      {row.category}
                    </span>
                  ) : (
                    <span
                      className="text-[11px]"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      —
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 overflow-hidden">
                  {row.tags.slice(0, 2).map((t) => (
                    <TagChip key={t.id} name={t.name} color={t.color} />
                  ))}
                  {row.tags.length > 2 && (
                    <span
                      className="text-[10.5px]"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      +{row.tags.length - 2}
                    </span>
                  )}
                </div>
                <div className="flex justify-center">
                  <FreshnessRing result={row.freshness} size="sm" />
                </div>
                <div
                  className="text-right text-[12.5px] tabular-nums"
                  style={{
                    color:
                      days !== null && days >= 180
                        ? "var(--cold-red)"
                        : "var(--ink-muted)",
                    fontWeight: days !== null && days >= 180 ? 600 : undefined,
                  }}
                >
                  {days === null ? "—" : `${days}d`}
                </div>
              </Link>
            </div>
          );
        })}
        </div>
        </>
      )}
    </>
  );
}

const tbBtn =
  "rounded-md border bg-[var(--stone-raised)] px-3 py-1.5 text-[12.5px] font-medium hover:border-[var(--brass)] disabled:opacity-50";
const tbBtnDark =
  "rounded-md border border-[var(--ink)] bg-[var(--ink)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--stone)] disabled:opacity-50 hover:bg-[#2a241c]";

function catChipStyle(cat: "personal" | "business" | "both"): React.CSSProperties {
  switch (cat) {
    case "personal":
      return { background: "var(--brass-soft)", color: "var(--brass-deep)" };
    case "business":
      return {
        background: "rgba(62,94,90,0.12)",
        color: "var(--av-5)",
      };
    case "both":
      return {
        background: "rgba(74,94,44,0.12)",
        color: "var(--av-10)",
      };
  }
}
