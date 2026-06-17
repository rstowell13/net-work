import { AppShell } from "@/components/AppShell";
import { TriageCard } from "@/components/TriageCard";
import { requireUser } from "@/lib/auth";
import { getNextTriageContact, getStatusCounts } from "@/lib/contacts/queries";
import { mergeRecentInteractions } from "@/lib/contacts/recent";

export const dynamic = "force-dynamic";

function daysAgoLabel(d: Date | null, now: number): string {
  if (!d) return "—";
  const days = Math.floor((now - d.getTime()) / 86400_000);
  if (days < 1) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export default async function TriagePage() {
  const user = await requireUser();
  const [next, counts] = await Promise.all([
    getNextTriageContact(user.id),
    getStatusCounts(user.id),
  ]);
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  return (
    <AppShell active="/triage">
      <div className="mx-auto max-w-[760px] px-4 pb-24 pt-6 md:px-14 md:pb-16 md:pt-8">
        {!next ? (
          <EmptyState />
        ) : (
          <TriageCard
            contact={{
              id: next.contact.id,
              displayName: next.contact.displayName,
              photoUrl: next.contact.photoUrl,
              primaryEmail: next.contact.primaryEmail,
              primaryPhone: next.contact.primaryPhone,
            }}
            freshness={next.freshness}
            sources={next.sources}
            lastSeenLabel={
              next.lastSeenAt ? daysAgoLabel(next.lastSeenAt, now) : "Never"
            }
            signals={{
              threads: next.counts.threads,
              calls: next.counts.calls,
            }}
            recent={mergeRecentInteractions(next.recent)}
            progress={{
              triaged: counts.kept + counts.skipped,
              total: counts.all,
            }}
          />
        )}
      </div>
    </AppShell>
  );
}

function EmptyState() {
  return (
    <div className="py-16">
      <h1
        className="m-0 mb-4"
        style={{
          fontFamily: "var(--font-serif, 'Source Serif 4'), Georgia, serif",
          fontStyle: "italic",
          fontWeight: 500,
          fontSize: 56,
          lineHeight: 1,
          letterSpacing: "-0.022em",
        }}
      >
        All caught up.
      </h1>
      <p className="text-[15px]" style={{ color: "var(--ink-muted)" }}>
        Nothing left to triage. New contacts will appear here as you ingest more
        data or merge new groups.
      </p>
    </div>
  );
}
