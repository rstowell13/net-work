import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AddNoteForm } from "@/components/ContactActions";
import { AddToWeekButton } from "@/components/AddToWeekButton";
import { RefreshThreadSummaries } from "@/components/RefreshThreadSummaries";
import { ContactTags } from "@/components/ContactTags";
import { requireUser } from "@/lib/auth";
import { getTagsForContact, listTags } from "@/lib/tags/queries";
import { getContactDetail, getFreshnessForContactIds } from "@/lib/contacts/queries";
import { getDiary } from "@/lib/diary";
import { dedupePhonesForDisplay } from "@/lib/phone-format";
import { normalizePhone } from "@/lib/merge/normalize";
import {
  ActionLink,
  BlockHeader,
  ContactInfoSection,
  DiaryEntries,
  FollowUpsSection,
  PageHeader,
  SourcesSection,
  SummaryPanel,
  SummaryPanelSkeleton,
} from "./sections";

export const dynamic = "force-dynamic";
// Only the SummaryPanel's LLM call (streamed via Suspense) can run long —
// the page shell itself no longer awaits OpenRouter. Kept for that child.
export const maxDuration = 60;

export default async function ContactDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ groups?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { groups } = await searchParams;
  const includeGroups = groups === "1";

  const detail = await getContactDetail(user.id, id);
  if (!detail) notFound();
  const { contact, rawMembers, followUps, mergeCandidate } = detail;

  const [diaryResult, contactTags, allTags] = await Promise.all([
    getDiary(id, { includeGroups }),
    getTagsForContact(id),
    listTags(user.id),
  ]);

  const diary = diaryResult.entries;
  const groupThreadCount = diaryResult.groupThreadCount;

  // Freshness comes from the SAME aggregate helper the contacts list and
  // triage use (getFreshnessForContactIds → aggregateLastSeen +
  // aggregateInteractions365, group messages excluded) — before the 2026-07
  // unification this page computed its own thread-level, 50-capped,
  // calendar-inclusive version and could show a different ring than the list
  // for the same person.
  const freshnessEntry = (await getFreshnessForContactIds([id])).get(id);
  const lastSeen = freshnessEntry?.lastSeenAt ?? null;
  const freshness = freshnessEntry?.freshness ?? {
    score: 0,
    band: "unknown" as const,
    daysSince: null,
    interactions365: 0,
  };
  const interactions365 = freshness.interactions365;

  const openFollowUps = followUps.filter((f) => f.status === "open");

  // Single source of truth: the distinct union of every email / phone / LinkedIn
  // across all of this contact's source records (Apple, Google, Gmail, etc.).
  const allEmails = [
    ...new Set(
      rawMembers.flatMap((r) => (r.emails ?? []).map((e) => e.toLowerCase())),
    ),
  ];
  const allPhones = dedupePhonesForDisplay(
    rawMembers.flatMap((r) => r.phones ?? []),
  );
  // E.164 target for the Call/Text links — reliable regardless of stored format.
  const primaryTel = contact.primaryPhone
    ? normalizePhone(contact.primaryPhone) ?? contact.primaryPhone
    : null;
  const allLinkedIn = [
    ...new Set(
      rawMembers
        .map((r) => r.linkedinUrl)
        .filter((u): u is string => !!u),
    ),
  ];

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

        <PageHeader
          contact={contact}
          daysSince={daysSince}
          diaryCount={diary.length}
          freshness={freshness}
          interactions365={interactions365}
        />

        <div
          className="flex flex-wrap items-center gap-2.5 border-b py-4"
          style={{ borderColor: "var(--rule)" }}
        >
          <span
            className="text-[10.5px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: "var(--ink-faint)" }}
          >
            Tags
          </span>
          <ContactTags
            contactId={contact.id}
            initial={contactTags}
            allTags={allTags}
          />
        </div>

        <div
          className="flex flex-wrap items-center justify-between gap-4 border-b py-5"
          style={{ borderColor: "var(--rule)" }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <AddToWeekButton contactId={contact.id} />
            {primaryTel && (
              <ActionLink href={`tel:${primaryTel}`}>Call</ActionLink>
            )}
            {primaryTel && (
              <ActionLink href={`sms:${primaryTel}`}>Text</ActionLink>
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

        {(allEmails.length > 0 ||
          allPhones.length > 0 ||
          allLinkedIn.length > 0) && (
          <section
            className="border-b py-8"
            style={{ borderColor: "var(--rule)" }}
          >
            <ContactInfoSection
              allEmails={allEmails}
              allPhones={allPhones}
              allLinkedIn={allLinkedIn}
            />
          </section>
        )}

        <section
          className="border-b py-8"
          style={{ borderColor: "var(--rule)" }}
        >
          <Suspense fallback={<SummaryPanelSkeleton />}>
            <SummaryPanel
              contactId={contact.id}
              contactName={contact.displayName}
              category={contact.category}
            />
          </Suspense>
        </section>

        <section
          className="border-b py-8"
          style={{ borderColor: "var(--rule)" }}
        >
          <FollowUpsSection
            contactId={contact.id}
            openFollowUps={openFollowUps}
            now={now}
          />
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
          {(groupThreadCount > 0 || includeGroups) && (
            <div className="mb-4">
              <Link
                href={
                  includeGroups
                    ? `/contacts/${contact.id}`
                    : `/contacts/${contact.id}?groups=1`
                }
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium transition-colors"
                style={{
                  background: includeGroups
                    ? "var(--brass-soft)"
                    : "var(--stone-raised)",
                  color: includeGroups
                    ? "var(--brass-deep)"
                    : "var(--ink-muted)",
                }}
              >
                {includeGroups
                  ? "Hide group texts"
                  : `Show group texts (${groupThreadCount})`}
              </Link>
            </div>
          )}
          <RefreshThreadSummaries contactId={contact.id} />
          <DiaryEntries diary={diary} />
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
          <SourcesSection
            contactId={contact.id}
            contactName={contact.displayName}
            rawMembers={rawMembers}
            mergeCandidate={mergeCandidate}
          />
        </section>
      </div>
    </AppShell>
  );
}
