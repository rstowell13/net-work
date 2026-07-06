import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PageContainer } from "@/components/PageContainer";
import { TriageCard } from "@/components/TriageCard";
import { requireUser } from "@/lib/auth";
import { getNextTriageContact, getStatusCounts } from "@/lib/contacts/queries";
import { mergeRecentInteractions } from "@/lib/contacts/recent";
import { daysAgoLabel } from "@/lib/format-time";

export const dynamic = "force-dynamic";

export default async function TriagePage() {
  const user = await requireUser();
  const [queue, counts] = await Promise.all([
    getNextTriageContact(user.id),
    getStatusCounts(user.id),
  ]);
  const next = queue.next;
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  return (
    <AppShell active="/triage">
      <PageContainer>
        {!next ? (
          <EmptyState hiddenCount={queue.hiddenCount} />
        ) : (
          <TriageCard
            key={next.contact.id}
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
              total: counts.kept + counts.skipped + queue.eligibleRemaining,
            }}
          />
        )}
      </PageContainer>
    </AppShell>
  );
}

function EmptyState({ hiddenCount }: { hiddenCount: number }) {
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
      {hiddenCount > 0 ? (
        <p className="text-[15px]" style={{ color: "var(--ink-muted)" }}>
          {hiddenCount.toLocaleString()} low-signal contact
          {hiddenCount === 1 ? " is" : "s are"} hidden by your triage filter.
          Loosen it in{" "}
          <Link
            href="/settings/triage"
            className="underline"
            style={{ color: "var(--brass)" }}
          >
            Settings → Triage
          </Link>{" "}
          to see them.
        </p>
      ) : (
        <p className="text-[15px]" style={{ color: "var(--ink-muted)" }}>
          Nothing left to triage. New contacts will appear here as you ingest
          more data or merge new groups.
        </p>
      )}
    </div>
  );
}
