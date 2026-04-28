import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ContactsList } from "@/components/ContactsList";
import { requireUser } from "@/lib/auth";
import {
  listContacts,
  getStatusCounts,
  getCategoryCounts,
  type ContactListFilters,
} from "@/lib/contacts/queries";

export const dynamic = "force-dynamic";

type Search = {
  status?: string;
  category?: string;
  recency?: string;
};

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const filters: ContactListFilters = {
    status:
      (["to_triage", "kept", "skipped", "all"] as const).find(
        (s) => s === sp.status,
      ) ?? "kept",
    category: (
      ["personal", "business", "both", "uncategorized"] as const
    ).find((c) => c === sp.category),
    recency:
      (["0_30", "30_90", "90_365", "365_plus"] as const).find(
        (r) => r === sp.recency,
      ) ?? null,
  };

  const [rows, statusCounts, catCounts] = await Promise.all([
    listContacts(user.id, filters, 500),
    getStatusCounts(user.id),
    getCategoryCounts(user.id),
  ]);

  const serialized = rows.map((r) => ({
    ...r,
    lastSeenISO: r.lastSeenAt ? r.lastSeenAt.toISOString() : null,
  }));

  return (
    <AppShell active="/contacts">
      <div className="md:grid md:grid-cols-[240px_1fr]">
        <details
          className="border-b md:contents"
          style={{ borderColor: "var(--rule)" }}
        >
          <summary
            className="flex cursor-pointer items-center justify-between px-4 py-3 text-[13px] font-semibold uppercase tracking-[0.08em] md:hidden"
            style={{ color: "var(--ink-muted)" }}
          >
            Filters
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </summary>
          <aside
            className="border-t px-4 pb-6 pt-4 md:sticky md:top-[60px] md:h-[calc(100dvh-60px)] md:overflow-y-auto md:border-r md:border-t-0 md:px-6 md:pb-16 md:pt-8"
            style={{ borderColor: "var(--rule)" }}
          >
          <FilterBlock title="Status">
            <FilterLink
              label="Kept"
              count={statusCounts.kept}
              active={filters.status === "kept"}
              href={hrefFor(sp, { status: "kept" })}
            />
            <FilterLink
              label="To triage"
              count={statusCounts.to_triage}
              active={filters.status === "to_triage"}
              href={hrefFor(sp, { status: "to_triage" })}
            />
            <FilterLink
              label="Skipped"
              count={statusCounts.skipped}
              active={filters.status === "skipped"}
              href={hrefFor(sp, { status: "skipped" })}
            />
            <FilterLink
              label="All"
              count={statusCounts.all}
              active={filters.status === "all"}
              href={hrefFor(sp, { status: "all" })}
            />
          </FilterBlock>

          <FilterBlock title="Category">
            <FilterLink
              label="Personal"
              count={catCounts.personal}
              active={filters.category === "personal"}
              href={hrefFor(sp, { category: "personal" })}
            />
            <FilterLink
              label="Business"
              count={catCounts.business}
              active={filters.category === "business"}
              href={hrefFor(sp, { category: "business" })}
            />
            <FilterLink
              label="Both"
              count={catCounts.both}
              active={filters.category === "both"}
              href={hrefFor(sp, { category: "both" })}
            />
            <FilterLink
              label="Uncategorized"
              count={catCounts.uncategorized}
              active={filters.category === "uncategorized"}
              href={hrefFor(sp, { category: "uncategorized" })}
            />
            {filters.category && (
              <FilterLink
                label="Clear"
                count={null}
                active={false}
                href={hrefFor(sp, { category: undefined })}
              />
            )}
          </FilterBlock>

          <FilterBlock title="Recency">
            <FilterLink
              label="< 30 days"
              active={filters.recency === "0_30"}
              count={null}
              href={hrefFor(sp, { recency: "0_30" })}
            />
            <FilterLink
              label="30 – 90 days"
              active={filters.recency === "30_90"}
              count={null}
              href={hrefFor(sp, { recency: "30_90" })}
            />
            <FilterLink
              label="90 – 365 days"
              active={filters.recency === "90_365"}
              count={null}
              href={hrefFor(sp, { recency: "90_365" })}
            />
            <FilterLink
              label="365+ days"
              active={filters.recency === "365_plus"}
              count={null}
              href={hrefFor(sp, { recency: "365_plus" })}
            />
            {filters.recency && (
              <FilterLink
                label="Clear"
                count={null}
                active={false}
                href={hrefFor(sp, { recency: undefined })}
              />
            )}
          </FilterBlock>
          </aside>
        </details>

        <main className="px-4 pb-24 pt-6 md:px-10 md:pb-16 md:pt-8">
          <div className="mb-2 flex items-baseline justify-between">
            <h1
              className="m-0"
              style={{
                fontFamily:
                  "var(--font-serif, 'Source Serif 4'), Georgia, serif",
                fontStyle: "italic",
                fontWeight: 500,
                fontSize: 36,
                lineHeight: 1,
                letterSpacing: "-0.02em",
                fontVariationSettings: "'opsz' 96",
              }}
            >
              Contacts
            </h1>
            <p
              className="text-[12.5px] tabular-nums"
              style={{ color: "var(--ink-faint)" }}
            >
              {rows.length} shown · status: {filters.status}
              {filters.category ? ` · ${filters.category}` : ""}
            </p>
          </div>
          <ContactsList rows={serialized} />
        </main>
      </div>
    </AppShell>
  );
}

function FilterBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-7">
      <p
        className="m-0 mb-3 text-[11px] font-semibold uppercase tracking-[0.16em]"
        style={{ color: "var(--ink-faint)" }}
      >
        {title}
      </p>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function FilterLink({
  label,
  count,
  active,
  href,
}: {
  label: string;
  count: number | null;
  active: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-md px-2 py-1.5 text-[13.5px] font-medium hover:bg-[var(--stone-raised)] hover:text-[var(--ink)]"
      style={{
        background: active ? "var(--brass-soft)" : undefined,
        color: active ? "var(--brass-deep)" : "var(--ink-muted)",
        fontWeight: active ? 600 : 500,
      }}
    >
      <span>{label}</span>
      {count !== null && (
        <span
          className="text-[11.5px] tabular-nums"
          style={{
            color: active ? "var(--brass-deep)" : "var(--ink-faint)",
          }}
        >
          {count}
        </span>
      )}
    </Link>
  );
}

function hrefFor(
  current: Search,
  patch: Partial<Search>,
): string {
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...current, ...patch })) {
    if (v) merged[k] = v;
  }
  const qs = new URLSearchParams(merged).toString();
  return `/contacts${qs ? `?${qs}` : ""}`;
}
