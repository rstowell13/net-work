import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/auth";
import { getPendingCandidates, getStats } from "@/lib/merge/queries";
import { avatarColorVar, initials } from "@/lib/merge/avatar-color";
import {
  RunDedupeButton,
  BulkMergeButton,
  AmbiguousActions,
} from "@/components/merge/MergeActions";

export const dynamic = "force-dynamic";

export default async function MergePage() {
  const user = await requireUser();
  const [stats, candidates] = await Promise.all([
    getStats(user.id),
    getPendingCandidates(user.id),
  ]);

  const safe = candidates.filter((c) => c.confidence !== "ambiguous");
  const ambiguous = candidates.filter((c) => c.confidence === "ambiguous");
  const safeIds = safe.map((c) => c.id);

  return (
    <AppShell active="/merge">
      <div className="mx-auto max-w-[1280px] px-4 pb-24 pt-6 md:px-14 md:pt-8">
        <section
          className="flex flex-col gap-6 border-b pb-8 md:grid md:items-end md:gap-12"
          style={{
            gridTemplateColumns: "minmax(0, 1.5fr) auto",
            borderColor: "var(--rule)",
          }}
        >
          <div>
            <p
              className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.16em]"
              style={{ color: "var(--ink-faint)" }}
            >
              Onboarding · step 2 of 3
            </p>
            <h1
              className="m-0"
              style={{
                fontFamily: "var(--font-serif, 'Source Serif 4'), Georgia, serif",
                fontStyle: "italic",
                fontWeight: 500,
                fontSize: "clamp(44px, 12vw, 88px)",
                lineHeight: 0.94,
                letterSpacing: "-0.025em",
                fontVariationSettings: "'opsz' 144",
              }}
            >
              Merge.
            </h1>
          </div>
          <div className="grid grid-cols-4 gap-3 md:flex md:gap-7">
            <Stat label="Pending" value={stats.pending} />
            <Stat label="Exact" value={stats.exact} tone="exact" />
            <Stat label="High" value={stats.high} tone="high" />
            <Stat label="Ambiguous" value={stats.ambiguous} tone="amb" />
          </div>
        </section>

        {candidates.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div
              className="mt-8 grid items-center gap-8 rounded-2xl px-7 py-6"
              style={{
                gridTemplateColumns: "minmax(0, 1fr) auto",
                background: "var(--ink)",
                color: "var(--stone)",
              }}
            >
              <div className="flex flex-col gap-1.5">
                <h2
                  className="m-0"
                  style={{
                    fontFamily:
                      "var(--font-serif, 'Source Serif 4'), Georgia, serif",
                    fontStyle: "italic",
                    fontWeight: 500,
                    fontSize: 28,
                    lineHeight: 1.05,
                    letterSpacing: "-0.018em",
                    fontVariationSettings: "'opsz' 96",
                  }}
                >
                  {safe.length > 0
                    ? `${safe.length} group${safe.length === 1 ? "" : "s"} ${safe.length === 1 ? "is" : "are"} safe to bulk-merge.`
                    : `Nothing safe to bulk-merge.`}
                </h2>
                <p
                  className="m-0 max-w-[60ch] text-[13.5px] leading-[1.5]"
                  style={{ color: "rgba(247,244,236,0.75)" }}
                >
                  All exact email matches and high-confidence phone /
                  LinkedIn / name matches.
                  {ambiguous.length > 0
                    ? ` The remaining ${ambiguous.length} ambiguous group${ambiguous.length === 1 ? "" : "s"} need a closer look — review them below.`
                    : ""}
                </p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2.5">
                <Link
                  href="/triage"
                  className="rounded-lg border bg-transparent px-3.5 py-2 text-[13px] font-medium hover:bg-[rgba(247,244,236,0.08)]"
                  style={{
                    color: "var(--stone)",
                    borderColor: "rgba(247,244,236,0.2)",
                  }}
                >
                  Skip to triage →
                </Link>
                <BulkMergeButton count={safe.length} candidateIds={safeIds} />
              </div>
            </div>

            {safe.length > 0 && (
              <Section
                title="Ready to merge"
                count={`${safe.length} group${safe.length === 1 ? "" : "s"}`}
                helper="Click any to review individually before bulk-merging."
              >
                <div className="grid grid-cols-1 gap-2">
                  {safe.map((c) => (
                    <Link
                      href={`/merge/${c.id}`}
                      key={c.id}
                      className="grid items-center gap-3 rounded-[10px] border bg-[var(--stone-raised)] px-4 py-3.5 transition-colors hover:border-[var(--brass)]"
                      style={{
                        gridTemplateColumns: "auto 1fr auto",
                        borderColor: "var(--rule)",
                      }}
                    >
                      <AvatarStack
                        members={c.members}
                        primaryName={c.primaryName}
                      />
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-[14px] font-semibold tracking-[-0.012em]">
                          {c.primaryName}
                        </span>
                        <span
                          className="truncate text-[11px]"
                          style={{ color: "var(--ink-faint)" }}
                        >
                          {c.members.length} records · {c.primarySignal}
                        </span>
                      </div>
                      <span style={{ color: "var(--ink-faint)" }}>
                        <Chevron />
                      </span>
                    </Link>
                  ))}
                </div>
              </Section>
            )}

            {ambiguous.length > 0 && (
              <Section
                title="Need a closer look"
                count={`${ambiguous.length} group${ambiguous.length === 1 ? "" : "s"}`}
                helper="Conflicting signals — review the records and decide whether they're the same person."
              >
                <div className="flex flex-col gap-4">
                  {ambiguous.map((c) => (
                    <AmbiguousCard key={c.id} c={c} />
                  ))}
                </div>
              </Section>
            )}

            <div className="mt-12">
              <RunDedupeButton label="Re-scan" />
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "exact" | "high" | "amb";
}) {
  const color =
    tone === "exact"
      ? "var(--fresh-green)"
      : tone === "high"
        ? "var(--brass-deep)"
        : tone === "amb"
          ? "var(--fading-yellow)"
          : "var(--ink)";
  return (
    <div className="flex flex-col gap-1">
      <span
        className="text-[10.5px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: "var(--ink-faint)" }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-serif, 'Source Serif 4'), Georgia, serif",
          fontStyle: "italic",
          fontWeight: 500,
          fontSize: 32,
          lineHeight: 1,
          letterSpacing: "-0.012em",
          fontVariationSettings: "'opsz' 96",
          color,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Section({
  title,
  count,
  helper,
  children,
}: {
  title: string;
  count: string;
  helper: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-14">
      <div
        className="mb-4 flex flex-wrap items-baseline justify-between gap-4 border-b pb-3"
        style={{ borderColor: "var(--rule)" }}
      >
        <div className="flex items-baseline gap-3">
          <h2
            className="m-0"
            style={{
              fontFamily:
                "var(--font-serif, 'Source Serif 4'), Georgia, serif",
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: 28,
              lineHeight: 1,
              letterSpacing: "-0.012em",
            }}
          >
            {title}
          </h2>
          <span
            className="rounded font-mono text-[12px] font-medium tabular-nums"
            style={{
              padding: "3px 8px",
              background: "var(--stone-sunken)",
              color: "var(--ink-muted)",
            }}
          >
            {count}
          </span>
        </div>
        <p
          className="max-w-[50ch] text-[13px]"
          style={{ color: "var(--ink-muted)" }}
        >
          {helper}
        </p>
      </div>
      {children}
    </section>
  );
}

function AvatarStack({
  members,
  primaryName,
}: {
  members: Array<{ id: string }>;
  primaryName: string;
}) {
  const ini = initials(primaryName);
  const shown = members.slice(0, 4);
  return (
    <div className="flex items-center">
      {shown.map((m, i) => (
        <div
          key={m.id}
          className="flex items-center justify-center rounded-full text-[11.5px] font-medium italic"
          style={{
            width: 28,
            height: 28,
            marginLeft: i === 0 ? 0 : -8,
            color: "var(--stone)",
            fontFamily:
              "var(--font-serif, 'Source Serif 4'), Georgia, serif",
            background: avatarColorVar(m.id),
            boxShadow: "0 0 0 2px var(--stone-raised)",
          }}
        >
          {ini}
        </div>
      ))}
    </div>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width={14} height={14} strokeWidth={1.5}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function AmbiguousCard({
  c,
}: {
  c: Awaited<ReturnType<typeof getPendingCandidates>>[number];
}) {
  return (
    <article
      className="rounded-xl border bg-[var(--stone-raised)] p-5"
      style={{
        borderColor: "var(--rule)",
        borderLeft: "3px solid var(--fading-yellow)",
      }}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="m-0 text-[18px] font-semibold tracking-[-0.018em]">
          {c.primaryName}
        </h3>
        <span
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.04em]"
          style={{
            background: "rgba(168,132,31,0.16)",
            color: "var(--fading-yellow)",
          }}
        >
          Ambiguous
        </span>
      </div>

      <div className="mb-3.5 flex flex-col gap-1.5">
        {c.members.map((m) => (
          <div
            key={m.id}
            className="grid items-center gap-2.5 rounded-lg border px-2.5 py-2"
            style={{
              gridTemplateColumns: "32px 1fr",
              background: "var(--stone)",
              borderColor: "var(--rule)",
            }}
          >
            <div
              className="flex items-center justify-center rounded-full text-[11px] font-medium italic"
              style={{
                width: 28,
                height: 28,
                color: "var(--stone)",
                fontFamily:
                  "var(--font-serif, 'Source Serif 4'), Georgia, serif",
                background: avatarColorVar(m.id),
              }}
            >
              {initials(m.name)}
            </div>
            <div className="flex min-w-0 flex-col gap-px">
              <span
                className="text-[9.5px] font-semibold uppercase tracking-[0.06em]"
                style={{ color: "var(--brass-deep)" }}
              >
                {m.sourceKind.replace(/_/g, " ")}
              </span>
              <span className="truncate text-[11.5px] font-medium tabular-nums">
                {m.name ?? "—"} ·{" "}
                {m.email ?? m.phone ?? m.linkedinUrl ?? "no contact"}
              </span>
            </div>
          </div>
        ))}
      </div>

      <AmbiguousActions id={c.id} />
    </article>
  );
}

function EmptyState() {
  return (
    <div className="mt-16 flex flex-col items-start gap-4">
      <p
        className="m-0 max-w-[55ch] text-[15px] leading-[1.6]"
        style={{ color: "var(--ink-muted)" }}
      >
        No merge candidates yet. Run dedupe to scan your raw contacts and group
        likely duplicates by email, phone, LinkedIn, or name.
      </p>
      <RunDedupeButton />
    </div>
  );
}
