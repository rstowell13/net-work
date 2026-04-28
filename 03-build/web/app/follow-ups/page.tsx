import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { AppShell } from "@/components/AppShell";
import { Avatar } from "@/components/Avatar";
import { FollowUpToggle } from "@/components/ContactActions";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function FollowUpsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const status =
    (["open", "done", "snoozed"] as const).find((s) => s === sp.status) ??
    "open";

  const rows = await db
    .select({
      id: schema.followUps.id,
      text: schema.followUps.text,
      status: schema.followUps.status,
      createdAt: schema.followUps.createdAt,
      contactId: schema.followUps.contactId,
      contactName: schema.contacts.displayName,
      photoUrl: schema.contacts.photoUrl,
    })
    .from(schema.followUps)
    .innerJoin(
      schema.contacts,
      eq(schema.contacts.id, schema.followUps.contactId),
    )
    .where(
      and(
        eq(schema.contacts.userId, user.id),
        eq(schema.followUps.status, status),
        isNull(schema.followUps.deletedAt),
      ),
    )
    .orderBy(asc(schema.followUps.createdAt));

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  return (
    <AppShell active="/follow-ups">
      <div className="mx-auto max-w-[900px] px-4 pb-24 pt-6 md:px-14 md:pt-8">
        <h1
          className="m-0 mb-3"
          style={{
            fontFamily: "var(--font-serif, 'Source Serif 4'), Georgia, serif",
            fontStyle: "italic",
            fontWeight: 500,
            fontSize: 56,
            lineHeight: 1,
            letterSpacing: "-0.022em",
          }}
        >
          Follow-ups.
        </h1>
        <div
          className="mb-8 flex flex-wrap items-center gap-2 border-b pb-4"
          style={{ borderColor: "var(--rule)" }}
        >
          <FilterTab href="/follow-ups" label="Open" active={status === "open"} />
          <FilterTab
            href="/follow-ups?status=done"
            label="Done"
            active={status === "done"}
          />
          <FilterTab
            href="/follow-ups?status=snoozed"
            label="Snoozed"
            active={status === "snoozed"}
          />
        </div>

        {rows.length === 0 ? (
          <p
            className="m-0 text-[14px]"
            style={{ color: "var(--ink-muted)" }}
          >
            No {status} follow-ups.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((r) => {
              const days = Math.floor(
                (now - r.createdAt.getTime()) / 86400_000,
              );
              const overdue = status === "open" && days >= 30;
              return (
                <div
                  key={r.id}
                  className="grid items-center gap-4 rounded-xl border bg-[var(--stone-raised)] px-4 py-3.5"
                  style={{
                    gridTemplateColumns: "22px 40px 1fr auto",
                    borderColor: overdue ? "var(--cold-red)" : "var(--rule)",
                  }}
                >
                  <FollowUpToggle id={r.id} status={r.status} />
                  <Avatar
                    id={r.contactId}
                    name={r.contactName}
                    photoUrl={r.photoUrl}
                    size="md"
                  />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p
                      className="m-0 text-[14px] leading-[1.4]"
                      style={{
                        textDecoration:
                          status === "done" ? "line-through" : undefined,
                        color: status === "done" ? "var(--ink-faint)" : "var(--ink)",
                      }}
                    >
                      {r.text}
                    </p>
                    <Link
                      href={`/contacts/${r.contactId}`}
                      className="text-[11.5px] hover:underline"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      {r.contactName} · open {days} day{days === 1 ? "" : "s"}
                    </Link>
                  </div>
                  {overdue && (
                    <span
                      className="rounded-full border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em]"
                      style={{
                        color: "var(--cold-red)",
                        borderColor: "var(--cold-red)",
                      }}
                    >
                      overdue
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function FilterTab({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-1.5 text-[13px] font-medium"
      style={{
        background: active ? "var(--brass-soft)" : "transparent",
        color: active ? "var(--brass-deep)" : "var(--ink-muted)",
      }}
    >
      {label}
    </Link>
  );
}
