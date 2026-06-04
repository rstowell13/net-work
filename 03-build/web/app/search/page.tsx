import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Avatar } from "@/components/Avatar";
import { TagChip } from "@/components/TagChip";
import { requireUser } from "@/lib/auth";
import { searchAll, type MentionSource } from "@/lib/search/queries";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<MentionSource, string> = {
  note: "Note",
  email: "Email",
  message: "Message",
  summary: "Summary",
  event: "Event",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const { q = "" } = await searchParams;
  const query = q.trim();
  const results =
    query.length >= 2
      ? await searchAll(user.id, query, { contacts: 25, tags: 25, mentions: 40 })
      : { contacts: [], tags: [], mentions: [] };
  const total =
    results.contacts.length + results.tags.length + results.mentions.length;

  return (
    <AppShell active="/search">
      <main className="px-4 pb-24 pt-6 md:px-10 md:pb-16 md:pt-8">
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <h1 className="serif-display m-0 text-[32px] leading-none md:text-[36px]">
            {query ? <>Results for &ldquo;{query}&rdquo;</> : "Search"}
          </h1>
          {query.length >= 2 && (
            <p
              className="shrink-0 text-[12.5px] tabular-nums"
              style={{ color: "var(--ink-faint)" }}
            >
              {total} {total === 1 ? "result" : "results"}
            </p>
          )}
        </div>

        {query.length < 2 ? (
          <Hint>Type at least 2 characters to search.</Hint>
        ) : total === 0 ? (
          <Hint>No matches for &ldquo;{query}&rdquo;. Try a different spelling or term.</Hint>
        ) : (
          <div className="flex max-w-2xl flex-col gap-8">
            {results.contacts.length > 0 && (
              <Section title="People">
                {results.contacts.map((c) => (
                  <Link key={c.id} href={`/contacts/${c.id}`} className="block">
                    <RowShell>
                      <Avatar id={c.id} name={c.displayName} photoUrl={c.photoUrl} size="md" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px]" style={{ color: "var(--ink)" }}>
                          {c.displayName}
                        </span>
                        {c.primaryEmail && (
                          <span className="block truncate text-[12.5px]" style={{ color: "var(--ink-faint)" }}>
                            {c.primaryEmail}
                          </span>
                        )}
                      </span>
                    </RowShell>
                  </Link>
                ))}
              </Section>
            )}

            {results.tags.length > 0 && (
              <Section title="Tags">
                {results.tags.map((t) => (
                  <Link key={t.id} href={`/contacts?tags=${t.id}`} className="block">
                    <RowShell>
                      <TagChip name={t.name} color={t.color} size="md" />
                      <span className="flex-1 text-right text-[12.5px] tabular-nums" style={{ color: "var(--ink-faint)" }}>
                        {t.contactCount} {t.contactCount === 1 ? "contact" : "contacts"}
                      </span>
                    </RowShell>
                  </Link>
                ))}
              </Section>
            )}

            {results.mentions.length > 0 && (
              <Section title="Mentions">
                {results.mentions.map((m) => (
                  <Link key={m.contactId} href={`/contacts/${m.contactId}`} className="block">
                    <RowShell>
                      <Avatar id={m.contactId} name={m.displayName} photoUrl={m.photoUrl} size="md" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[15px]" style={{ color: "var(--ink)" }}>
                            {m.displayName}
                          </span>
                          {m.matchCount > 1 && (
                            <span className="shrink-0 text-[11.5px]" style={{ color: "var(--ink-faint)" }}>
                              {m.matchCount} matches
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-[12.5px]" style={{ color: "var(--ink-muted)" }}>
                          {m.snippet}
                        </span>
                      </span>
                      <span
                        className="shrink-0 self-start rounded px-1.5 py-0.5 text-[10.5px] font-medium"
                        style={{ background: "var(--stone-sunken)", color: "var(--ink-muted)" }}
                      >
                        {SOURCE_LABEL[m.source]}
                      </span>
                    </RowShell>
                  </Link>
                ))}
              </Section>
            )}
          </div>
        )}
      </main>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2
        className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em]"
        style={{ color: "var(--ink-faint)" }}
      >
        {title}
      </h2>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

function RowShell({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="flex items-center gap-3 rounded-lg px-2.5 py-2.5 hover:bg-[var(--stone-raised)]"
    >
      {children}
    </span>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-10 text-center text-[14px]" style={{ color: "var(--ink-faint)" }}>
      {children}
    </p>
  );
}
