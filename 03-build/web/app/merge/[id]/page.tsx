import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { AppShell } from "@/components/AppShell";
import { Avatar } from "@/components/Avatar";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { pickSurvivor } from "@/lib/merge/survivor";
import { AmbiguousActions } from "@/components/merge/MergeActions";
import { PartitionEditor } from "@/components/merge/PartitionEditor";

export const dynamic = "force-dynamic";

export default async function MergeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const [candidate] = await db
    .select()
    .from(schema.mergeCandidates)
    .where(
      and(
        eq(schema.mergeCandidates.id, id),
        eq(schema.mergeCandidates.userId, user.id),
      ),
    )
    .limit(1);
  if (!candidate) notFound();

  const members = await db
    .select({
      id: schema.rawContacts.id,
      name: schema.rawContacts.name,
      emails: schema.rawContacts.emails,
      phones: schema.rawContacts.phones,
      linkedinUrl: schema.rawContacts.linkedinUrl,
      avatarUrl: schema.rawContacts.avatarUrl,
      updatedAt: schema.rawContacts.updatedAt,
      sourceKind: schema.sources.kind,
      contactId: schema.rawContacts.contactId,
      savedName: schema.contacts.displayName,
    })
    .from(schema.rawContacts)
    .innerJoin(
      schema.sources,
      eq(schema.sources.id, schema.rawContacts.sourceId),
    )
    .leftJoin(
      schema.contacts,
      eq(schema.contacts.id, schema.rawContacts.contactId),
    )
    .where(inArray(schema.rawContacts.id, candidate.rawContactIds));

  // Which saved contacts does this candidate span, and which will survive?
  const existingContactIds = [
    ...new Set(members.map((m) => m.contactId).filter((x): x is string => !!x)),
  ];
  const picked =
    existingContactIds.length > 0
      ? await pickSurvivor(user.id, existingContactIds)
      : null;
  const survivorId = picked?.survivorId ?? null;
  const survivorName =
    members.find((m) => m.contactId === survivorId)?.savedName ?? null;

  const primaryName =
    survivorName ??
    members.find((m) => m.name && m.name.trim().length > 0)?.name ??
    "Unknown";

  // Props for the "split into separate people" editor.
  const involvedContacts = [
    ...new Map(
      members
        .filter((m) => m.contactId)
        .map((m) => [
          m.contactId as string,
          { id: m.contactId as string, name: m.savedName ?? "Unknown" },
        ]),
    ).values(),
  ];
  const partitionRecords = members.map((m) => ({
    id: m.id,
    name: m.name,
    sourceKind: m.sourceKind,
    email: m.emails?.[0] ?? null,
    phone: m.phones?.[0] ?? null,
    contactId: m.contactId,
    savedName: m.savedName,
  }));

  return (
    <AppShell active="/merge">
      <div className="mx-auto max-w-[960px] px-4 pb-24 pt-6 md:px-14 md:pt-8">
        <Link
          href="/merge"
          className="text-[12px] font-medium"
          style={{ color: "var(--ink-muted)" }}
        >
          ← All merge candidates
        </Link>

        <div className="mt-3 flex items-baseline justify-between gap-4">
          <h1
            className="m-0"
            style={{
              fontFamily: "var(--font-serif, 'Source Serif 4'), Georgia, serif",
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: 56,
              lineHeight: 1,
              letterSpacing: "-0.022em",
              fontVariationSettings: "'opsz' 96",
            }}
          >
            {primaryName}
          </h1>
          <span
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.04em]"
            style={{
              background:
                candidate.confidence === "exact"
                  ? "rgba(90,122,58,0.16)"
                  : candidate.confidence === "high"
                    ? "rgba(135,101,34,0.16)"
                    : "rgba(168,132,31,0.16)",
              color:
                candidate.confidence === "exact"
                  ? "var(--fresh-green)"
                  : candidate.confidence === "high"
                    ? "var(--brass-deep)"
                    : "var(--fading-yellow)",
            }}
          >
            {candidate.confidence}
          </span>
        </div>

        <p
          className="mt-2 text-[13px]"
          style={{ color: "var(--ink-muted)" }}
        >
          {members.length} records · status: {candidate.status}
        </p>

        {existingContactIds.length >= 2 && survivorName && (
          <p
            className="mt-1 text-[13px] font-medium"
            style={{ color: "var(--brass-deep)" }}
          >
            Approving merges {existingContactIds.length} saved contacts into{" "}
            {survivorName} and removes {existingContactIds.length - 1} duplicate
            {existingContactIds.length - 1 === 1 ? "" : "s"}.
          </p>
        )}
        {existingContactIds.length === 1 && survivorName && (
          <p
            className="mt-1 text-[13px] font-medium"
            style={{ color: "var(--brass-deep)" }}
          >
            Approving adds these records to {survivorName}.
          </p>
        )}

        <div className="mt-8 overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr style={{ color: "var(--ink-faint)" }}>
                <th className="border-b py-2 pr-4 text-left font-medium uppercase tracking-[0.06em] text-[10.5px]" style={{ borderColor: "var(--rule)" }}>
                  Field
                </th>
                {members.map((m) => (
                  <th
                    key={m.id}
                    className="border-b py-2 pr-4 text-left font-medium uppercase tracking-[0.06em] text-[10.5px]"
                    style={{ borderColor: "var(--rule)", color: "var(--brass-deep)" }}
                  >
                    {m.sourceKind.replace(/_/g, " ")}
                    {m.savedName && (
                      <span
                        className="mt-0.5 block normal-case tracking-normal text-[10px] font-normal"
                        style={{
                          color:
                            m.contactId === survivorId
                              ? "var(--fresh-green)"
                              : "var(--ink-faint)",
                        }}
                      >
                        {m.contactId === survivorId ? "keep · " : "saved · "}
                        {m.savedName}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-3 pr-4 font-semibold" style={{ borderBottom: "1px solid var(--rule)" }}>
                  Avatar
                </td>
                {members.map((m) => (
                  <td key={m.id} className="py-3 pr-4" style={{ borderBottom: "1px solid var(--rule)" }}>
                    <Avatar id={m.id} name={m.name} photoUrl={m.avatarUrl} size="sm" />
                  </td>
                ))}
              </tr>
              <Row label="Name" values={members.map((m) => m.name ?? "—")} />
              <Row
                label="Email"
                values={members.map((m) => m.emails?.join(", ") ?? "—")}
              />
              <Row
                label="Phone"
                values={members.map((m) => m.phones?.join(", ") ?? "—")}
              />
              <Row
                label="LinkedIn"
                values={members.map((m) => m.linkedinUrl ?? "—")}
              />
              <Row
                label="Updated"
                values={members.map((m) => m.updatedAt.toISOString().slice(0, 10))}
              />
            </tbody>
          </table>
        </div>

        {candidate.status === "pending" ? (
          <div className="mt-8 flex flex-col gap-4">
            <div className="max-w-md">
              <AmbiguousActions id={candidate.id} />
            </div>
            {members.length >= 2 && (
              <PartitionEditor
                candidateId={candidate.id}
                records={partitionRecords}
                involvedContacts={involvedContacts}
              />
            )}
          </div>
        ) : (
          <p className="mt-8 text-[13px]" style={{ color: "var(--ink-muted)" }}>
            This candidate is already {candidate.status}.
            {candidate.resultingContactId && (
              <>
                {" "}
                <Link
                  href={`/contacts/${candidate.resultingContactId}`}
                  className="underline"
                >
                  View merged contact →
                </Link>
              </>
            )}
          </p>
        )}
      </div>
    </AppShell>
  );
}

function Row({ label, values }: { label: string; values: string[] }) {
  const distinct = new Set(values.filter((v) => v && v !== "—"));
  const conflict = distinct.size > 1;
  return (
    <tr>
      <td
        className="py-3 pr-4 font-semibold"
        style={{ borderBottom: "1px solid var(--rule)" }}
      >
        {label}
        {conflict && (
          <span
            className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]"
            style={{
              background: "rgba(168,132,31,0.16)",
              color: "var(--fading-yellow)",
            }}
          >
            conflict
          </span>
        )}
      </td>
      {values.map((v, i) => (
        <td
          key={i}
          className="py-3 pr-4 align-top"
          style={{
            borderBottom: "1px solid var(--rule)",
            background: conflict
              ? "rgba(168,132,31,0.06)"
              : "transparent",
          }}
        >
          <span className="break-words">{v || "—"}</span>
        </td>
      ))}
    </tr>
  );
}
