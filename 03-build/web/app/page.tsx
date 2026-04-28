import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Avatar } from "@/components/Avatar";
import { PlanCard } from "@/components/HomePlan";
import { requireUser } from "@/lib/auth";
import { getHomeData } from "@/lib/home";
import { getCandidates } from "@/lib/suggestions/candidates";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();
  const home = await getHomeData(user.id);

  if (home.totalContacts === 0) {
    return <FirstRun />;
  }

  if (!home.hasPlan || home.total === 0) {
    return <NoPlanState home={home} userId={user.id} />;
  }

  return (
    <AppShell active="/">
      <div className="mx-auto max-w-[1100px] px-14 pb-24 pt-8">
        <p
          className="mb-3 flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: "var(--ink-faint)" }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--brass)" }}
          />
          {home.weekRange} ·{" "}
          {home.daysRemaining > 0
            ? `${home.daysRemaining} day${home.daysRemaining === 1 ? "" : "s"} remain${home.daysRemaining === 1 ? "s" : ""}`
            : "wraps tonight"}
        </p>

        <section className="mb-10">
          <h1
            className="m-0"
            style={{
              fontFamily:
                "var(--font-serif, 'Source Serif 4'), Georgia, serif",
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: "clamp(56px, 8vw, 96px)",
              lineHeight: 0.92,
              letterSpacing: "-0.03em",
              fontVariationSettings: "'opsz' 144",
            }}
          >
            This week,
            <br />
            <span style={{ color: "var(--brass-deep)" }}>
              {wordNumber(home.total)}
            </span>{" "}
            people.
          </h1>

          <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-4">
            <MetaBlock
              h="Reached"
              n={home.reached}
              of={`of ${home.total}`}
            />
            <MetaBlock
              h="Connected"
              n={home.connected}
              of={`of ${home.total}`}
            />
            <MetaBlock
              h="Open follow-ups"
              n={home.openFollowUps}
              of={
                home.overdueFollowUps > 0
                  ? `· ${home.overdueFollowUps} overdue`
                  : ""
              }
            />
            <MetaBlock
              h="Triaged"
              n={home.triagedCount}
              of={`/ ${home.totalContacts}`}
            />
          </div>
        </section>

        <SectionHead
          title="Your plan"
          right="commit Sunday · expires Saturday 23:59"
        />
        <div className="flex flex-col gap-3">
          {home.items.map((item) => (
            <PlanCard key={item.itemId} item={item} />
          ))}
        </div>

        {(home.attention.triageQueue > 0 ||
          home.attention.mergeSuggestions > 0) && (
          <>
            <SectionHead
              title="Needs your attention"
              right={`${
                (home.attention.triageQueue > 0 ? 1 : 0) +
                (home.attention.mergeSuggestions > 0 ? 1 : 0)
              } items`}
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {home.attention.triageQueue > 0 && (
                <AttCard
                  title="Triage queue"
                  body={
                    <>
                      <strong>
                        {home.attention.triageQueue} new contact
                        {home.attention.triageQueue === 1 ? "" : "s"}
                      </strong>{" "}
                      waiting to be triaged.
                    </>
                  }
                  href="/triage"
                  cta="Triage them →"
                />
              )}
              {home.attention.mergeSuggestions > 0 && (
                <AttCard
                  title="Merge suggestions"
                  body={
                    <>
                      <strong>
                        {home.attention.mergeSuggestions} group
                        {home.attention.mergeSuggestions === 1 ? "" : "s"}
                      </strong>{" "}
                      ready for review.
                    </>
                  }
                  href="/merge"
                  cta="Open merge →"
                />
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

async function NoPlanState({
  home,
  userId,
}: {
  home: Awaited<ReturnType<typeof getHomeData>>;
  userId: string;
}) {
  const { candidates, cadence } = await getCandidates(userId, 5);
  return (
    <AppShell active="/">
      <div className="mx-auto max-w-[1100px] px-14 pb-24 pt-8">
        <p
          className="mb-3 flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: "var(--ink-faint)" }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--brass)" }}
          />
          {home.weekRange} · no plan committed
        </p>

        <h1
          className="m-0"
          style={{
            fontFamily: "var(--font-serif, 'Source Serif 4'), Georgia, serif",
            fontStyle: "italic",
            fontWeight: 500,
            fontSize: "clamp(56px, 8vw, 96px)",
            lineHeight: 0.92,
            letterSpacing: "-0.03em",
            fontVariationSettings: "'opsz' 144",
          }}
        >
          Plan this week.
        </h1>
        <p
          className="m-0 mt-4 max-w-[60ch] text-[15px] leading-[1.6]"
          style={{ color: "var(--ink-muted)" }}
        >
          {candidates.length} contacts are surfacing for your cadence
          (target: {cadence.targetPerWeek}/week,{" "}
          {cadence.personalPct}% personal).{" "}
          Step through them and pick {cadence.targetPerWeek} to reach out
          to.
        </p>
        <Link
          href="/suggestions"
          className="mt-6 inline-flex items-center gap-2 rounded-lg px-5 py-3 text-[14px] font-semibold"
          style={{ background: "var(--ink)", color: "var(--stone)" }}
        >
          Plan this week →
        </Link>

        {candidates.length > 0 && (
          <section className="mt-12">
            <p
              className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: "var(--ink-faint)" }}
            >
              Candidate preview
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {candidates.slice(0, 8).map((c) => (
                <Link
                  key={c.contactId}
                  href={`/contacts/${c.contactId}`}
                  title={`${c.displayName} · ${c.reason}`}
                >
                  <Avatar
                    id={c.contactId}
                    name={c.displayName}
                    photoUrl={c.photoUrl}
                    size="md"
                  />
                </Link>
              ))}
              {candidates.length > 8 && (
                <span
                  className="text-[12px] tabular-nums"
                  style={{ color: "var(--ink-faint)" }}
                >
                  +{candidates.length - 8} more
                </span>
              )}
            </div>
          </section>
        )}

        {(home.attention.triageQueue > 0 ||
          home.attention.mergeSuggestions > 0) && (
          <>
            <SectionHead title="Needs your attention" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {home.attention.triageQueue > 0 && (
                <AttCard
                  title="Triage queue"
                  body={
                    <>
                      <strong>
                        {home.attention.triageQueue}
                      </strong>{" "}
                      contacts to triage.
                    </>
                  }
                  href="/triage"
                  cta="Triage them →"
                />
              )}
              {home.attention.mergeSuggestions > 0 && (
                <AttCard
                  title="Merge suggestions"
                  body={
                    <>
                      <strong>
                        {home.attention.mergeSuggestions}
                      </strong>{" "}
                      group
                      {home.attention.mergeSuggestions === 1 ? "" : "s"}{" "}
                      ready.
                    </>
                  }
                  href="/merge"
                  cta="Open merge →"
                />
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function FirstRun() {
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
        <h1
          className="mb-6 m-0"
          style={{
            fontFamily: "var(--font-serif, 'Source Serif 4'), Georgia, serif",
            fontStyle: "italic",
            fontWeight: 500,
            fontSize: 44,
            lineHeight: 1,
            letterSpacing: "-0.022em",
          }}
        >
          Let&rsquo;s start with the people who matter.
        </h1>
        <p
          className="mb-10 max-w-[60ch] text-base leading-relaxed"
          style={{ color: "var(--ink-muted)" }}
        >
          Connect your contacts, email, calendar, and Mac agent to start
          triaging the people you actually want to keep up with.
        </p>
        <Link
          href="/settings/sources"
          className="inline-flex items-center gap-2 rounded-[7px] px-4 py-2 text-sm font-medium"
          style={{ background: "var(--ink)", color: "var(--stone)" }}
        >
          Open Settings → Sources
        </Link>
      </div>
    </AppShell>
  );
}

function MetaBlock({
  h,
  n,
  of,
}: {
  h: string;
  n: number;
  of: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className="text-[10.5px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: "var(--ink-faint)" }}
      >
        {h}
      </span>
      <span className="flex items-baseline gap-2">
        <span
          style={{
            fontFamily:
              "var(--font-serif, 'Source Serif 4'), Georgia, serif",
            fontStyle: "italic",
            fontWeight: 500,
            fontSize: 36,
            lineHeight: 1,
            letterSpacing: "-0.018em",
            fontVariationSettings: "'opsz' 96",
          }}
        >
          {n}
        </span>
        <span
          className="text-[12px] tabular-nums"
          style={{ color: "var(--ink-faint)" }}
        >
          {of}
        </span>
      </span>
    </div>
  );
}

function SectionHead({
  title,
  right,
}: {
  title: string;
  right?: string;
}) {
  return (
    <div
      className="mb-4 mt-12 flex items-baseline justify-between border-b pb-3"
      style={{ borderColor: "var(--rule)" }}
    >
      <h2
        className="m-0"
        style={{
          fontFamily: "var(--font-serif, 'Source Serif 4'), Georgia, serif",
          fontStyle: "italic",
          fontWeight: 500,
          fontSize: 28,
          letterSpacing: "-0.012em",
          fontVariationSettings: "'opsz' 60",
        }}
      >
        {title}
      </h2>
      {right && (
        <span
          className="text-[11.5px] tabular-nums"
          style={{ color: "var(--ink-faint)" }}
        >
          {right}
        </span>
      )}
    </div>
  );
}

function AttCard({
  title,
  body,
  href,
  cta,
}: {
  title: string;
  body: React.ReactNode;
  href: string;
  cta: string;
}) {
  return (
    <div
      className="flex flex-col gap-2 rounded-xl border bg-[var(--stone-raised)] p-5"
      style={{ borderColor: "var(--rule)" }}
    >
      <p
        className="m-0 text-[10.5px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: "var(--ink-faint)" }}
      >
        {title}
      </p>
      <p
        className="m-0 text-[13.5px] leading-[1.5]"
        style={{ color: "var(--ink-muted)" }}
      >
        {body}
      </p>
      <Link
        href={href}
        className="text-[13px] font-medium"
        style={{ color: "var(--brass-deep)" }}
      >
        {cta}
      </Link>
    </div>
  );
}

function wordNumber(n: number): string {
  const words = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
  ];
  return words[n] ?? String(n);
}
