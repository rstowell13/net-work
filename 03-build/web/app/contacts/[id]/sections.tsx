/**
 * Page-local presentational helpers + the streaming relationship-summary
 * panel for app/contacts/[id]/page.tsx. Split out of the page file (P9,
 * contact-page refactor) — extracted verbatim from the page's former inline
 * helper components; no visual changes.
 */
import {
  AddFollowUpForm,
  FollowUpToggle,
  RegenerateSummaryButton,
} from "@/components/ContactActions";
import { Avatar } from "@/components/Avatar";
import { FreshnessRing } from "@/components/FreshnessRing";
import { DiaryThreadOpener } from "@/components/DiaryThreadOpener";
import { MergeContactButton } from "@/components/MergeContactButton";
import {
  getRelationshipInputs,
  getRelationshipStalenessInputs,
  type DiaryEntry,
} from "@/lib/diary";
import {
  getCachedRelationshipSummary,
  generateRelationshipSummary,
} from "@/lib/llm/summary";
import { daysAgoShort } from "@/lib/format-time";
import { bandColor, bandLabel, type FreshnessResult } from "@/lib/scoring/freshness";
import { formatPhoneDisplay, type DisplayPhone } from "@/lib/phone-format";
import { schema } from "@/lib/db";
import type { ContactRawMember } from "@/lib/contacts/queries";

export function Dot() {
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

export function BlockHeader({ title, right }: { title: string; right?: string }) {
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

export function ActionLink({
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

export function MetaBlock({
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

export function DiaryTime({
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

export function channelColor(c: string): string {
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

export function SummaryUnavailable({
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

/**
 * Streamed inside <Suspense> so the page shell (header, tags, contact info,
 * diary, etc.) paints immediately without waiting on OpenRouter. Cache check
 * is cheap (one aggregate query, no bodies); full message/email bodies are
 * only hydrated on a cache miss.
 */
export async function SummaryPanel({
  contactId,
  contactName,
  category,
}: {
  contactId: string;
  contactName: string;
  category: string | null;
}) {
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  let summary: Awaited<ReturnType<typeof getCachedRelationshipSummary>> = null;
  let summaryError: string | null = null;
  try {
    const stalenessKey = await getRelationshipStalenessInputs(contactId);
    summary = await getCachedRelationshipSummary(contactId, stalenessKey);
    if (!summary) {
      const inputs = await getRelationshipInputs(contactId);
      summary = await generateRelationshipSummary(
        contactId,
        { contactName, category, ...inputs },
        stalenessKey,
      );
    }
  } catch (e) {
    summaryError = (e as Error).message ?? "Summary generation failed";
  }

  return (
    <>
      <BlockHeader
        title="Relationship summary"
        right={
          summary
            ? `cached · ${daysAgoShort(summary.generatedAt, now)}`
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
            <RegenerateSummaryButton contactId={contactId} />
          </div>
        </>
      ) : (
        <SummaryUnavailable contactId={contactId} error={summaryError} />
      )}
    </>
  );
}

/** Suspense fallback — same BlockHeader shell, no summary text yet. */
export function SummaryPanelSkeleton() {
  return (
    <>
      <BlockHeader title="Relationship summary" right="loading…" />
      <div
        className="h-[52px] max-w-[64ch] animate-pulse rounded"
        style={{ background: "var(--stone-raised)" }}
      />
    </>
  );
}

/**
 * Desktop + mobile header pair (avatar, serif name, category/last-seen/entry
 * meta row, freshness ring). Two hand-tuned CSS-breakpoint layouts, not the
 * shared <ContactHeader> from P8 — that component's sizing (96px avatar
 * column, smaller name clamp) is TriageCard/SuggestionsFlow's canonical
 * variant and differs from this page's, so adopting it would change the
 * contact-detail page's visuals. Extracted verbatim instead.
 */
export function PageHeader({
  contact,
  daysSince,
  diaryCount,
  freshness,
  interactions365,
}: {
  contact: typeof schema.contacts.$inferSelect;
  daysSince: number | null;
  diaryCount: number;
  freshness: FreshnessResult;
  interactions365: number;
}) {
  return (
    <>
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
              {diaryCount} entr{diaryCount === 1 ? "y" : "ies"}
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
            {diaryCount} entr{diaryCount === 1 ? "y" : "ies"}
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
    </>
  );
}

/** Diary section body: empty state, or the entry list (capped at 30, with an
 * "N older entries" footer) — extracted verbatim from the page. */
export function DiaryEntries({ diary }: { diary: DiaryEntry[] }) {
  if (diary.length === 0) {
    return (
      <p className="m-0 text-[13.5px]" style={{ color: "var(--ink-muted)" }}>
        No messages, emails, calls, or events linked to this contact yet.
        Diary populates after the post-merge backfill runs.
      </p>
    );
  }
  return (
    <div className="flex flex-col">
      {diary.slice(0, 30).map((entry, i) => {
        const openerKind =
          entry.raw?.kind === "thread"
            ? ("message" as const)
            : entry.raw?.kind === "email"
            ? ("email" as const)
            : null;
        const inner = (
          <div>
            <span
              className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]"
              style={{ color: channelColor(entry.channel) }}
            >
              {entry.isGroup && (
                <span
                  className="rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.06em]"
                  style={{
                    background: "var(--ink-muted)",
                    color: "var(--stone)",
                  }}
                >
                  Group
                </span>
              )}
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
        );
        return (
          <article
            key={entry.id}
            className="grid gap-6 border-t py-4 first:border-t-0 first:pt-0"
            style={{
              gridTemplateColumns: "110px 1fr",
              borderColor: "var(--rule)",
            }}
          >
            <DiaryTime date={entry.when} prevDate={diary[i - 1]?.when} />
            {openerKind && entry.raw ? (
              <DiaryThreadOpener
                kind={openerKind}
                refId={entry.raw.refId}
                title={entry.title}
              >
                {inner}
              </DiaryThreadOpener>
            ) : (
              inner
            )}
          </article>
        );
      })}
      {diary.length > 30 && (
        <p className="mt-4 text-[12px] tabular-nums" style={{ color: "var(--ink-faint)" }}>
          +{diary.length - 30} older entries
        </p>
      )}
    </div>
  );
}

/** "Contact info" section: emails / phones / LinkedIn meta blocks. Hidden by
 * the caller entirely when all three lists are empty. */
export function ContactInfoSection({
  allEmails,
  allPhones,
  allLinkedIn,
}: {
  allEmails: string[];
  allPhones: DisplayPhone[];
  allLinkedIn: string[];
}) {
  return (
    <>
      <BlockHeader
        title="Contact info"
        right={`${allEmails.length} email${
          allEmails.length === 1 ? "" : "s"
        } · ${allPhones.length} phone${allPhones.length === 1 ? "" : "s"}`}
      />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <MetaBlock title="Emails">
          {allEmails.length === 0 ? (
            <span style={{ color: "var(--ink-faint)" }}>—</span>
          ) : (
            allEmails.map((e) => (
              <div key={e}>
                <a
                  href={`mailto:${e}`}
                  className="hover:underline"
                  style={{ color: "var(--ink)" }}
                >
                  {e}
                </a>
              </div>
            ))
          )}
        </MetaBlock>
        <MetaBlock title="Phones">
          {allPhones.length === 0 ? (
            <span style={{ color: "var(--ink-faint)" }}>—</span>
          ) : (
            allPhones.map((p) => (
              <div key={p.href}>
                <a
                  href={`tel:${p.href}`}
                  className="hover:underline"
                  style={{ color: "var(--ink)" }}
                >
                  {p.display}
                </a>
              </div>
            ))
          )}
        </MetaBlock>
        <MetaBlock title="LinkedIn">
          {allLinkedIn.length === 0 ? (
            <span style={{ color: "var(--ink-faint)" }}>—</span>
          ) : (
            allLinkedIn.map((u) => (
              <div key={u}>
                <a
                  href={u}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                  style={{ color: "var(--ink)" }}
                >
                  {u.replace(/^https?:\/\/(www\.)?/, "")}
                </a>
              </div>
            ))
          )}
        </MetaBlock>
      </div>
    </>
  );
}

/** "Open follow-ups" section body (list + add-form) — extracted verbatim. */
export function FollowUpsSection({
  contactId,
  openFollowUps,
  now,
}: {
  contactId: string;
  openFollowUps: (typeof schema.followUps.$inferSelect)[];
  now: number;
}) {
  return (
    <>
      <BlockHeader
        title="Open follow-ups"
        right={`${openFollowUps.length} open`}
      />
      {openFollowUps.length === 0 ? (
        <p className="m-0 text-[13.5px]" style={{ color: "var(--ink-muted)" }}>
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
      <AddFollowUpForm contactId={contactId} />
    </>
  );
}

/** "Sources & merge history" section — extracted verbatim. */
export function SourcesSection({
  contactId,
  contactName,
  rawMembers,
  mergeCandidate,
}: {
  contactId: string;
  contactName: string;
  rawMembers: ContactRawMember[];
  mergeCandidate: typeof schema.mergeCandidates.$inferSelect | null;
}) {
  return (
    <>
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
                {r.emails?.[0] ??
                  (r.phones?.[0] ? formatPhoneDisplay(r.phones[0]) : null) ??
                  r.linkedinUrl ??
                  "—"}
                {i < rawMembers.length - 1 ? <br /> : null}
              </div>
            ))
          )}
        </MetaBlock>
        <MetaBlock title="Merge history">
          {mergeCandidate ? (
            <>
              Merged from {mergeCandidate.rawContactIds.length} source
              records on{" "}
              {(mergeCandidate.resolvedAt ?? new Date()).toLocaleDateString(
                undefined,
                { month: "short", day: "2-digit", year: "numeric" },
              )}{" "}
              · {mergeCandidate.confidence} confidence
            </>
          ) : (
            <>Single-source contact — no merge history.</>
          )}
        </MetaBlock>
        <MetaBlock title="Cadence override">
          Default · uses your global cadence rules.
        </MetaBlock>
      </div>
      <div className="mt-6">
        <MergeContactButton currentId={contactId} currentName={contactName} />
      </div>
    </>
  );
}
