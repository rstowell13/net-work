import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { AppShell } from "@/components/AppShell";
import { Avatar } from "@/components/Avatar";
import { FreshnessRing } from "@/components/FreshnessRing";
import {
  AddFollowUpForm,
  AddNoteForm,
  FollowUpToggle,
  RegenerateSummaryButton,
} from "@/components/ContactActions";
import { AddToWeekButton } from "@/components/AddToWeekButton";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { getDiary, getRelationshipInputs } from "@/lib/diary";
import { getOrGenerateRelationshipSummary } from "@/lib/llm/summary";
import { computeFreshness, bandColor, bandLabel } from "@/lib/scoring/freshness";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const [contact] = await db
    .select()
    .from(schema.contacts)
    .where(
      and(
        eq(schema.contacts.id, id),
        eq(schema.contacts.userId, user.id),
        isNull(schema.contacts.deletedAt),
      ),
    )
    .limit(1);
  if (!contact) notFound();

  const [
    rawMembers,
    diary,
    followUps,
    relInputs,
    mergeCandidate,
  ] = await Promise.all([
    db
      .select({
        id: schema.rawContacts.id,
        emails: schema.rawContacts.emails,
        phones: schema.rawContacts.phones,
        linkedinUrl: schema.rawContacts.linkedinUrl,
        sourceKind: schema.sources.kind,
      })
      .from(schema.rawContacts)
      .innerJoin(
        schema.sources,
        eq(schema.sources.id, schema.rawContacts.sourceId),
      )
      .where(eq(schema.rawContacts.contactId, id)),
    getDiary(id),
    db
      .select()
      .from(schema.followUps)
      .where(
        and(
          eq(schema.followUps.contactId, id),
          isNull(schema.followUps.deletedAt),
        ),
      )
      .orderBy(schema.followUps.createdAt),
    getRelationshipInputs(id),
    db
      .select()
      .from(schema.mergeCandidates)
      .where(eq(schema.mergeCandidates.resultingContactId, id))
      .orderBy(desc(schema.mergeCandidates.resolvedAt))
      .limit(1),
  ]);

  // Last seen + interactions for freshness
  const lastSeen = diary[0]?.when ?? null;
  // eslint-disable-next-line react-hooks/purity
  const cutoff = Date.now() - 365 * 86400_000;
  const interactions365 = diary.filter(
    (d) => d.when.getTime() >= cutoff && d.channel !== "note",
  ).length;
  const freshness = computeFreshness({
    lastSeenAt: lastSeen,
    interactions365,
  });

  // Generate relationship summary lazily — cached by inputs hash.
  // Never let an LLM failure (rate limit, timeout, network) crash the page.
  let summary: Awaited<ReturnType<typeof getOrGenerateRelationshipSummary>> = null;
  let summaryError: string | null = null;
  try {
    summary = await getOrGenerateRelationshipSummary(id, {
      contactName: contact.displayName,
      category: contact.category,
      ...relInputs,
    });
  } catch (e) {
    summaryError = (e as Error).message ?? "Summary generation failed";
  }

  const openFollowUps = followUps.filter((f) => f.status === "open");

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const daysSince = lastSeen
    ? Math.floor((now - lastSeen.getTime()) / 86400_000)
    : null;

  return (
    <AppShell active="/contacts">
      <div className="mx-auto max-w-[1080px] px-4 pb-24 pt-6 md:px-14 md:pt-8">
        <nav
          className="mb-8 flex items-center gap-1.5 text-[12px] font-medium"
          style={{ color: "var(--ink-faint)" }}
        >
          <Link href="/contacts" style={{ color: "var(--ink-muted)" }}>
            Contacts
          </Link>
          <span style={{ color: "var(--rule)" }}>/</span>
          <span>{contact.displayName}</span>
        </nav>

        {/* Desktop header — original layout, untouched */}
        <section
          className="hidden border-b pb-9 md:grid md:items-end md:gap-14"
          style={{
            gridTemplateColumns: "minmax(0, 1.5fr) auto",
            borderColor: "var(--rule)",
          }}
        >
          <div className="flex flex-col gap-4">
            <div
              className="flex flex-wrap items-center gap-2.5 text-[12.5px] tabular-nums"
              style={{ color: "var(--ink-faint)" }}
            >
              {contact.category && (
                <>
                  <span
                    className="rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em]"
                    style={{
                      background: "var(--ink)",
                      color: "var(--stone)",
                    }}
                  >
                    {contact.category}
                  </span>
                  <Dot />
                </>
              )}
              {daysSince !== null && (
                <>
                  <span>last seen {daysSince}d ago</span>
                  <Dot />
                </>
              )}
              <span>
                {diary.length} entr{diary.length === 1 ? "y" : "ies"}
              </span>
            </div>
            <div className="flex items-center gap-6">
              <Avatar
                id={contact.id}
                name={contact.displayName}
                photoUrl={contact.photoUrl}
                size="xl"
              />
              <h1
                className="m-0 min-w-0 break-words"
                style={{
                  fontFamily:
                    "var(--font-serif, 'Source Serif 4'), Georgia, serif",
                  fontStyle: "italic",
                  fontWeight: 500,
                  fontSize: "clamp(36px, 9vw, 96px)",
                  lineHeight: 0.95,
                  letterSpacing: "-0.03em",
                  fontVariationSettings: "'opsz' 144",
                }}
              >
                {contact.displayName}
              </h1>
            </div>
          </div>
          <div className="flex flex-col items-center gap-3">
            <FreshnessRing result={freshness} size="lg" />
            <div className="flex flex-col items-center gap-1">
              <span
                className="text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: bandColor(freshness.band) }}
              >
                {bandLabel(freshness.band)}
              </span>
              <span
                className="text-[11px]"
                style={{ color: "var(--ink-faint)" }}
              >
                {interactions365} interaction
                {interactions365 === 1 ? "" : "s"} · last 365d
              </span>
            </div>
          </div>
        </section>

        {/* Mobile header — avatar + name + large ring */}
        <section
          className="border-b pb-7 md:hidden"
          style={{ borderColor: "var(--rule)" }}
        >
          <div
            className="flex flex-wrap items-center gap-2.5 text-[12px] tabular-nums"
            style={{ color: "var(--ink-faint)" }}
          >
            {contact.category && (
              <>
                <span
                  className="rounded px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.04em]"
                  style={{
                    background: "var(--ink)",
                    color: "var(--stone)",
                  }}
                >
                  {contact.category}
                </span>
                <Dot />
              </>
            )}
            {daysSince !== null && (
              <>
                <span>last seen {daysSince}d ago</span>
                <Dot />
              </>
            )}
            <span>
              {diary.length} entr{diary.length === 1 ? "y" : "ies"}
            </span>
          </div>
          <div className="mt-5 flex items-center gap-4">
            <Avatar
              id={contact.id}
              name={contact.displayName}
              photoUrl={contact.photoUrl}
              size="lg"
            />
            <h1
              className="m-0 min-w-0 flex-1 break-words"
              style={{
                fontFamily:
                  "var(--font-serif, 'Source Serif 4'), Georgia, serif",
                fontStyle: "italic",
                fontWeight: 500,
                fontSize: "clamp(32px, 9vw, 56px)",
                lineHeight: 0.95,
                letterSpacing: "-0.03em",
                fontVariationSettings: "'opsz' 144",
              }}
            >
              {contact.displayName}
            </h1>
          </div>
          <div className="mt-6 flex flex-col items-center gap-2">
            <FreshnessRing result={freshness} size="lg" />
            <span
              className="text-[11px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: bandColor(freshness.band) }}
            >
              {bandLabel(freshness.band)}
            </span>
            <span
              className="text-[11px]"
              style={{ color: "var(--ink-faint)" }}
            >
              {interactions365} interaction
              {interactions365 === 1 ? "" : "s"} · last 365d
            </span>
          </div>
        </section>

        <div
          className="flex flex-wrap items-center justify-between gap-4 border-b py-5"
          style={{ borderColor: "var(--rule)" }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <AddToWeekButton contactId={contact.id} />
            {contact.primaryPhone && (
              <ActionLink href={`tel:${contact.primaryPhone}`}>Call</ActionLink>
            )}
            {contact.primaryPhone && (
              <ActionLink href={`sms:${contact.primaryPhone}`}>Text</ActionLink>
            )}
            {contact.primaryEmail && (
              <ActionLink href={`mailto:${contact.primaryEmail}`}>
                Email
              </ActionLink>
            )}
            {contact.linkedinUrl && (
              <ActionLink href={contact.linkedinUrl}>LinkedIn</ActionLink>
            )}
          </div>
        </div>

        <section
          className="border-b py-8"
          style={{ borderColor: "var(--rule)" }}
        >
          <BlockHeader
            title="Relationship summary"
            right={
              summary
                ? `cached · ${formatRelative(summary.generatedAt, now)}`
                : "not yet generated"
            }
          />
          {summary ? (
            <>
              <p
                className="m-0 max-w-[64ch] text-[17px] leading-[1.65]"
                style={{ color: "var(--ink)" }}
              >
                {summary.body}
              </p>
              <div
                className="mt-3 flex items-center gap-2 text-[11.5px] tabular-nums"
                style={{ color: "var(--ink-faint)" }}
              >
                <span>
                  {summary.cached ? "cached" : "fresh"} · {summary.model}
                </span>
                <span>·</span>
                <RegenerateSummaryButton contactId={contact.id} />
              </div>
            </>
          ) : (
            <SummaryUnavailable contactId={contact.id} error={summaryError} />
          )}
        </section>

        <section
          className="border-b py-8"
          style={{ borderColor: "var(--rule)" }}
        >
          <BlockHeader
            title="Open follow-ups"
            right={`${openFollowUps.length} open`}
          />
          {openFollowUps.length === 0 ? (
            <p
              className="m-0 text-[13.5px]"
              style={{ color: "var(--ink-muted)" }}
            >
              No open follow-ups.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {openFollowUps.map((f) => (
                <div
                  key={f.id}
                  className="grid items-center gap-3.5 rounded-[10px] border bg-[var(--stone-raised)] px-4 py-3.5"
                  style={{
                    gridTemplateColumns: "22px 1fr auto",
                    borderColor: "var(--rule)",
                  }}
                >
                  <FollowUpToggle id={f.id} status={f.status} />
                  <div>
                    <p className="m-0 text-[14px] leading-[1.4]">{f.text}</p>
                    <p
                      className="m-0 mt-1 text-[11.5px] tabular-nums"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      Open {Math.floor((now - f.createdAt.getTime()) / 86400_000)} days
                    </p>
                  </div>
                  <span />
                </div>
              ))}
            </div>
          )}
          <AddFollowUpForm contactId={contact.id} />
        </section>

        <section
          className="border-b py-8"
          style={{ borderColor: "var(--rule)" }}
        >
          <BlockHeader
            title="Diary"
            right={
              diary.length > 0
                ? `${diary.length} entries · newest first`
                : "no diary entries"
            }
          />
          {diary.length === 0 ? (
            <p
              className="m-0 text-[13.5px]"
              style={{ color: "var(--ink-muted)" }}
            >
              No messages, emails, calls, or events linked to this contact yet.
              Diary populates after the post-merge backfill runs.
            </p>
          ) : (
            <div className="flex flex-col">
              {diary.slice(0, 30).map((entry, i) => (
                <article
                  key={entry.id}
                  className="grid gap-6 border-t py-4 first:border-t-0 first:pt-0"
                  style={{
                    gridTemplateColumns: "110px 1fr",
                    borderColor: "var(--rule)",
                  }}
                >
                  <DiaryTime date={entry.when} prevDate={diary[i - 1]?.when} />
                  <div>
                    <span
                      className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]"
                      style={{ color: channelColor(entry.channel) }}
                    >
                      {entry.title}
                    </span>
                    {entry.summary && (
                      <p
                        className="m-0 max-w-[70ch] text-[14.5px] leading-[1.55]"
                        style={{ color: "var(--ink)" }}
                      >
                        {entry.summary}
                      </p>
                    )}
                    {entry.meta && (
                      <p
                        className="m-0 mt-1.5 text-[11.5px] tabular-nums"
                        style={{ color: "var(--ink-faint)" }}
                      >
                        {entry.meta}
                      </p>
                    )}
                  </div>
                </article>
              ))}
              {diary.length > 30 && (
                <p
                  className="mt-4 text-[12px] tabular-nums"
                  style={{ color: "var(--ink-faint)" }}
                >
                  +{diary.length - 30} older entries
                </p>
              )}
            </div>
          )}
          <div className="mt-6">
            <p
              className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: "var(--ink-faint)" }}
            >
              Add a note
            </p>
            <AddNoteForm contactId={contact.id} />
          </div>
        </section>

        <section className="py-8">
          <BlockHeader title="Sources & merge history" />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <MetaBlock title="Source records">
              {rawMembers.length === 0 ? (
                <span style={{ color: "var(--ink-faint)" }}>
                  No raw records linked.
                </span>
              ) : (
                rawMembers.map((r, i) => (
                  <div key={r.id}>
                    <strong style={{ color: "var(--ink)", fontWeight: 600 }}>
                      {r.sourceKind.replace(/_/g, " ")}
                    </strong>
                    {" · "}
                    {r.emails?.[0] ?? r.phones?.[0] ?? r.linkedinUrl ?? "—"}
                    {i < rawMembers.length - 1 ? <br /> : null}
                  </div>
                ))
              )}
            </MetaBlock>
            <MetaBlock title="Merge history">
              {mergeCandidate[0] ? (
                <>
                  Merged from {mergeCandidate[0].rawContactIds.length} source
                  records on{" "}
                  {(mergeCandidate[0].resolvedAt ?? new Date()).toLocaleDateString(undefined, {
                    month: "short",
                    day: "2-digit",
                    year: "numeric",
                  })}{" "}
                  · {mergeCandidate[0].confidence} confidence
                </>
              ) : (
                <>Single-source contact — no merge history.</>
              )}
            </MetaBlock>
            <MetaBlock title="Cadence override">
              Default · uses your global cadence rules.
            </MetaBlock>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function Dot() {
  return (
    <span
      style={{
        width: 3,
        height: 3,
        borderRadius: "50%",
        background: "var(--ink-faint)",
        display: "inline-block",
      }}
    />
  );
}

function BlockHeader({ title, right }: { title: string; right?: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between">
      <h2
        className="m-0"
        style={{
          fontFamily: "var(--font-serif, 'Source Serif 4'), Georgia, serif",
          fontStyle: "italic",
          fontWeight: 500,
          fontSize: 24,
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

function ActionLink({
  href,
  children,
  primary,
}: {
  href: string;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noreferrer" : undefined}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-md border px-4 py-2 text-[14px] font-medium hover:border-[var(--brass)] md:min-h-0 md:px-3.5 md:py-2 md:text-[13px]"
      style={{
        background: primary ? "var(--ink)" : "var(--stone-raised)",
        color: primary ? "var(--stone)" : "var(--ink)",
        borderColor: primary ? "var(--ink)" : "var(--rule)",
      }}
    >
      {children}
    </a>
  );
}

function MetaBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p
        className="m-0 text-[10.5px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: "var(--ink-faint)" }}
      >
        {title}
      </p>
      <div
        className="m-0 text-[13px] leading-[1.55] tabular-nums"
        style={{ color: "var(--ink-muted)" }}
      >
        {children}
      </div>
    </div>
  );
}

function DiaryTime({
  date,
  prevDate,
}: {
  date: Date;
  prevDate?: Date;
}) {
  const showYear =
    !prevDate || prevDate.getFullYear() !== date.getFullYear();
  const m = date.toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
  });
  const t = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <div
      className="text-[11.5px] tabular-nums"
      style={{ color: "var(--ink-faint)", paddingTop: 2 }}
    >
      {showYear && (
        <span
          className="mb-0.5 block text-[13px] font-semibold"
          style={{ color: "var(--ink)" }}
        >
          {date.getFullYear()}
        </span>
      )}
      {m}
      <br />
      {t}
    </div>
  );
}

function channelColor(c: string): string {
  switch (c) {
    case "imessage":
    case "sms":
      return "var(--av-2)";
    case "call":
      return "var(--av-5)";
    case "email":
      return "var(--av-9)";
    case "event":
      return "var(--av-3)";
    case "note":
    default:
      return "var(--ink-muted)";
  }
}

function formatRelative(d: Date, now: number): string {
  const days = Math.floor((now - d.getTime()) / 86400_000);
  if (days === 0) return "just now";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function SummaryUnavailable({
  contactId,
  error,
}: {
  contactId: string;
  error?: string | null;
}) {
  return (
    <div
      className="rounded-md border p-4 text-[13px] leading-[1.5]"
      style={{
        borderColor: "var(--rule)",
        background: "var(--stone-raised)",
        color: "var(--ink-muted)",
      }}
    >
      {error ? (
        <p className="m-0">
          Summary generation failed:{" "}
          <code style={{ color: "var(--cold-red)" }}>{error}</code>. Try
          regenerating; if it keeps failing, check the OpenRouter status or
          the API key.
        </p>
      ) : (
        <p className="m-0">
          Relationship summary requires{" "}
          <code style={{ color: "var(--brass-deep)" }}>OPENROUTER_API_KEY</code>{" "}
          to be set in your Vercel environment. Once configured, click
          regenerate below.
        </p>
      )}
      <div className="mt-2">
        <RegenerateSummaryButton contactId={contactId} />
      </div>
    </div>
  );
}
