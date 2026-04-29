"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { FreshnessRing } from "@/components/FreshnessRing";
import type { ContactListRow } from "@/lib/contacts/queries";

type Cat = "personal" | "business" | "both" | null;

interface SerializedRow extends Omit<ContactListRow, "lastSeenAt"> {
  lastSeenISO: string | null;
}

export function ContactsList({ rows }: { rows: SerializedRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<"recency" | "name" | "fresh">("recency");
  const [now] = useState<number>(() => Date.now());
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

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

  return (
    <>
      <div
        className="flex flex-wrap items-center gap-2 border-b py-3.5"
        style={{ borderColor: "var(--rule)" }}
      >
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
              <Link
                key={row.id}
                href={`/contacts/${row.id}`}
                className="flex items-center gap-3 border-b px-3 py-4 transition-colors active:bg-[var(--stone-raised)]"
                style={{
                  background: isSel ? "var(--brass-soft)" : undefined,
                  borderColor: "var(--rule)",
                }}
              >
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggle(row.id);
                  }}
                  className="-m-2 flex h-9 w-9 shrink-0 items-center justify-center p-2"
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
                  <div
                    className="flex items-center gap-2 truncate text-[12px] tabular-nums"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    <span className="truncate">
                      {row.primaryEmail ?? row.primaryPhone ?? "—"}
                    </span>
                    <span aria-hidden style={{ opacity: 0.5 }}>·</span>
                    <span
                      className="shrink-0"
                      style={{
                        color: isCold ? "var(--cold-red)" : undefined,
                        fontWeight: isCold ? 600 : undefined,
                      }}
                    >
                      {days === null ? "—" : `${days}d`}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {row.category ? (
                      <span
                        className="rounded px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.04em]"
                        style={catChipStyle(row.category)}
                      >
                        {row.category}
                      </span>
                    ) : null}
                    {row.sources.slice(0, 2).map((s) => (
                      <span
                        key={s}
                        className="whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] font-medium"
                        style={{
                          background: "var(--stone-sunken)",
                          color: "var(--ink-muted)",
                        }}
                      >
                        {s.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="shrink-0">
                  <FreshnessRing result={row.freshness} size="md" />
                </div>
              </Link>
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
          <div />
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
            <Link
              key={row.id}
              href={`/contacts/${row.id}`}
              className="grid cursor-pointer items-center gap-[18px] border-b px-3 py-3.5 transition-colors hover:bg-[var(--stone-raised)]"
              style={{
                gridTemplateColumns:
                  "24px 44px minmax(180px, 2fr) 100px minmax(120px, 1.5fr) 100px 110px",
                background: isSel ? "var(--brass-soft)" : undefined,
                borderColor: "var(--rule)",
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(row.id);
                }}
                className="flex h-4 w-4 items-center justify-center rounded-sm border-[1.5px]"
                style={{
                  background: isSel ? "var(--ink)" : "transparent",
                  borderColor: isSel ? "var(--ink)" : "var(--rule)",
                }}
                aria-label="select"
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
              </button>
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
              <div className="flex gap-1 overflow-hidden">
                {row.sources.slice(0, 2).map((s) => (
                  <span
                    key={s}
                    className="whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] font-medium"
                    style={{
                      background: "var(--stone-sunken)",
                      color: "var(--ink-muted)",
                    }}
                  >
                    {s.replace(/_/g, " ")}
                  </span>
                ))}
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
