import Link from "next/link";
import { AppShell } from "@/components/AppShell";

/**
 * Home (This Week) — empty-state ("first run, no sources connected").
 * Real Home with WeeklyPlan + cadence preview lands in Milestone 7.
 *
 * Visual contract: 02-design/mockups/home/chosen.html
 */
export default function HomePage() {
  return (
    <AppShell active="/">
      <div className="mx-auto max-w-[1100px] px-14 py-10 pb-20">
        <p
          className="mb-2 text-[11.5px] font-medium uppercase tracking-[0.14em]"
          style={{ color: "var(--ink-faint)" }}
        >
          <span
            className="mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle"
            style={{ background: "var(--brass)" }}
          />
          Welcome
        </p>
        <h1 className="serif-display mb-6 text-[44px] leading-none">
          Let&rsquo;s start with the people who matter.
        </h1>
        <p
          className="mb-10 max-w-[60ch] text-base leading-relaxed"
          style={{ color: "var(--ink-muted)" }}
        >
          You haven&rsquo;t connected any sources yet. Connect your contacts,
          email, calendar, and Mac to start triaging the people you actually
          want to keep up with.
        </p>

        <div
          className="rounded-[12px] border p-7"
          style={{
            background: "var(--stone-raised)",
            borderColor: "var(--rule)",
          }}
        >
          <h2
            className="serif-display mb-2 text-[22px] leading-tight"
            style={{ fontVariationSettings: '"opsz" 60' }}
          >
            Connect a data source.
          </h2>
          <p
            className="mb-4 max-w-[56ch] text-sm leading-relaxed"
            style={{ color: "var(--ink-muted)" }}
          >
            Google Contacts, Gmail, Google Calendar, and a LinkedIn CSV export
            connect from this app. Apple Contacts, iMessage, and call logs come
            from a small Mac-side agent you install with one command.
          </p>
          <Link
            href="/settings/sources"
            className="inline-flex items-center gap-2 rounded-[7px] px-4 py-2 text-sm font-medium transition-colors"
            style={{ background: "var(--ink)", color: "var(--stone)" }}
          >
            Open Settings → Sources
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
