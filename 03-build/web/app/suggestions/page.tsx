import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { SuggestionsFlow } from "@/components/SuggestionsFlow";
import { requireUser } from "@/lib/auth";
import { getCandidates } from "@/lib/suggestions/candidates";

export const dynamic = "force-dynamic";

export default async function SuggestionsPage() {
  const user = await requireUser();
  const { candidates, cadence } = await getCandidates(user.id, 20);

  return (
    <AppShell active="/">
      <div className="mx-auto max-w-[760px] px-4 pb-24 pt-6 md:px-14 md:pb-16 md:pt-8">
        <p
          className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em]"
          style={{ color: "var(--ink-faint)" }}
        >
          Plan this week
        </p>
        <h1
          className="m-0 mb-2"
          style={{
            fontFamily: "var(--font-serif, 'Source Serif 4'), Georgia, serif",
            fontStyle: "italic",
            fontWeight: 500,
            fontSize: "clamp(40px, 6vw, 64px)",
            lineHeight: 0.98,
            letterSpacing: "-0.022em",
          }}
        >
          Suggestions.
        </h1>
        <p
          className="m-0 mb-8 max-w-[60ch] text-[14px]"
          style={{ color: "var(--ink-muted)" }}
        >
          Pick {cadence.targetPerWeek} people to reach out to this week. Skip
          to defer until next Sunday;{" "}
          <em>never suggest</em> permanently quiets a contact.{" "}
          <Link
            href="/settings/cadence"
            style={{ color: "var(--brass-deep)", fontWeight: 500 }}
          >
            Cadence settings →
          </Link>
        </p>
        {candidates.length === 0 ? (
          <EmptyState />
        ) : (
          <SuggestionsFlow
            candidates={candidates}
            cadence={cadence}
          />
        )}
      </div>
    </AppShell>
  );
}

function EmptyState() {
  return (
    <p
      className="m-0 max-w-[60ch] text-[14px] leading-[1.6]"
      style={{ color: "var(--ink-muted)" }}
    >
      No candidates right now — either everyone in your kept pool was contacted
      recently (within your cadence&rsquo;s min-days threshold) or your kept
      pool is empty. Triage more contacts or relax your cadence settings.
    </p>
  );
}
