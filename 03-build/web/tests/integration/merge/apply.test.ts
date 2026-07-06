import { describe, it, expect, afterAll, beforeEach } from "vitest";
import {
  truncateAll,
  closeTestSql,
  getTestSql,
  createUser,
  createSource,
  createRawContact,
  createContact,
  createMergeCandidate,
  getContact,
  getMergeCandidate,
} from "../_harness";

const skip = !process.env.TEST_DATABASE_URL;

// Migrations are applied once for the whole run by globalSetup (see
// vitest.integration.config.ts + tests/integration/_global-setup.ts).
describe.skipIf(skip)("merge/apply integration", () => {
  afterAll(async () => {
    await closeTestSql();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  it("candidate of loose raws creates a contact, links raws, marks approved", async () => {
    const { applyCandidate } = await import("@/lib/merge/apply");

    const user = await createUser();
    // Two different source kinds so pickBest's SOURCE_PRIORITY deterministically
    // prefers "Jane Doe" (apple_contacts outranks mac_agent) regardless of
    // insertion-order timestamps.
    const appleSource = await createSource(user.id, { kind: "apple_contacts" });
    const macSource = await createSource(user.id, { kind: "mac_agent" });
    const raw1 = await createRawContact(appleSource.id, {
      name: "Jane Doe",
      emails: ["jane@example.com"],
    });
    const raw2 = await createRawContact(macSource.id, {
      name: "Jane D.",
      emails: ["jane@example.com"],
    });
    const candidate = await createMergeCandidate(user.id, [raw1.id, raw2.id]);

    const result = await applyCandidate(user.id, candidate.id, {
      relink: false,
    });

    expect(result.contactId).toBeTruthy();
    const contact = await getContact(result.contactId);
    expect(contact?.display_name).toBe("Jane Doe");
    expect(contact?.deleted_at).toBeNull();

    const sql = getTestSql();
    const linked = await sql`
      SELECT id, contact_id FROM raw_contacts WHERE id IN (${raw1.id}, ${raw2.id})
    `;
    expect(linked.every((r) => r.contact_id === result.contactId)).toBe(true);

    const cand = await getMergeCandidate(candidate.id);
    expect(cand?.status).toBe("approved");
    expect(cand?.resulting_contact_id).toBe(result.contactId);
  });

  it("candidate spanning 2 saved contacts picks a survivor, soft-deletes the loser, and moves tags/notes/follow-ups/diary", async () => {
    const { applyCandidate } = await import("@/lib/merge/apply");
    const sql = getTestSql();

    const user = await createUser();
    const source = await createSource(user.id);

    // Older contact should win survivor-rank (createdAt tiebreak) — insert it
    // first so its created_at sorts earlier.
    const survivorContact = await createContact(user.id, {
      displayName: "Bob Smith",
    });
    const loserContact = await createContact(user.id, {
      displayName: "Bobby S",
    });

    const rawSurvivor = await createRawContact(source.id, {
      contactId: survivorContact.id,
      name: "Bob Smith",
      emails: ["bob@example.com"],
    });
    const rawLoser = await createRawContact(source.id, {
      contactId: loserContact.id,
      name: "Bobby S",
      emails: ["bob@example.com"],
    });

    // Curated content on the loser that must move to the survivor.
    const [tag] = await sql`
      INSERT INTO tags (user_id, name) VALUES (${user.id}, 'vip') RETURNING id
    `;
    await sql`INSERT INTO contact_tags (contact_id, tag_id) VALUES (${loserContact.id}, ${tag.id})`;
    const [note] = await sql`
      INSERT INTO notes (contact_id, body) VALUES (${loserContact.id}, 'met at conference') RETURNING id
    `;
    const [followUp] = await sql`
      INSERT INTO follow_ups (contact_id, text) VALUES (${loserContact.id}, 'send follow-up email') RETURNING id
    `;

    // Diary row (message thread) on the loser that must move too.
    const [thread] = await sql`
      INSERT INTO message_threads (contact_id, handle, external_thread_id, started_at, ended_at)
      VALUES (${loserContact.id}, '+15551234567', 'thread-ext-1', now(), now())
      RETURNING id
    `;

    const candidate = await createMergeCandidate(user.id, [
      rawSurvivor.id,
      rawLoser.id,
    ]);

    const result = await applyCandidate(user.id, candidate.id, {
      relink: false,
    });

    // Survivor is whichever contact pickSurvivor chose; confirm the OTHER
    // contact was soft-deleted and its content moved onto the result.
    const survivorRow = await getContact(result.contactId);
    expect(survivorRow?.deleted_at).toBeNull();

    const otherId =
      result.contactId === survivorContact.id
        ? loserContact.id
        : survivorContact.id;
    const otherRow = await getContact(otherId);
    expect(otherRow?.deleted_at).not.toBeNull();

    const movedTags = await sql`
      SELECT * FROM contact_tags WHERE contact_id = ${result.contactId}
    `;
    expect(movedTags.some((t) => t.tag_id === tag.id)).toBe(true);

    const movedNote = await sql`SELECT * FROM notes WHERE id = ${note.id}`;
    expect(movedNote[0].contact_id).toBe(result.contactId);

    const movedFollowUp = await sql`
      SELECT * FROM follow_ups WHERE id = ${followUp.id}
    `;
    expect(movedFollowUp[0].contact_id).toBe(result.contactId);

    const movedThread = await sql`
      SELECT * FROM message_threads WHERE id = ${thread.id}
    `;
    expect(movedThread[0].contact_id).toBe(result.contactId);
  });

  it("double-apply of the same candidate throws candidate_already_resolved and does not create a duplicate contact", async () => {
    const { applyCandidate } = await import("@/lib/merge/apply");
    const sql = getTestSql();

    const user = await createUser();
    const source = await createSource(user.id);
    const raw1 = await createRawContact(source.id, { name: "Concurrent A" });
    const raw2 = await createRawContact(source.id, { name: "Concurrent B" });
    const candidate = await createMergeCandidate(user.id, [raw1.id, raw2.id]);

    const first = await applyCandidate(user.id, candidate.id, {
      relink: false,
    });
    expect(first.contactId).toBeTruthy();

    // Simulate a TOCTOU race: force the candidate back to "pending" so the
    // in-memory `candidate.status !== "pending"` guard in applyCandidate
    // doesn't short-circuit before we exercise the DB-level atomic claim in
    // createContactFromMembers/mergeIntoSurvivor.
    await sql`UPDATE merge_candidates SET status = 'pending' WHERE id = ${candidate.id}`;

    // Re-fetching applyCandidate will now see "pending" again and attempt the
    // atomic claim a second time — which must fail because the underlying
    // resolved state (resulting_contact_id already set, raws already linked)
    // means a second create would duplicate the contact. The guard we're
    // actually testing is the UPDATE ... WHERE status = 'pending' claim
    // inside the transaction; to trigger it directly (the realistic race)
    // we call applyCandidate concurrently instead.
    await sql`UPDATE merge_candidates SET status = 'pending', resulting_contact_id = NULL, resolved_at = NULL WHERE id = ${candidate.id}`;

    const [r1, r2] = await Promise.allSettled([
      applyCandidate(user.id, candidate.id, { relink: false }),
      applyCandidate(user.id, candidate.id, { relink: false }),
    ]);

    const fulfilled = [r1, r2].filter((r) => r.status === "fulfilled");
    const rejected = [r1, r2].filter((r) => r.status === "rejected");
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toBe(
      "candidate_already_resolved",
    );

    const contacts = await sql`
      SELECT id FROM contacts WHERE user_id = ${user.id} AND deleted_at IS NULL
    `;
    expect(contacts.length).toBe(1);
  });

  it("splitCandidate marks status split", async () => {
    const { splitCandidate } = await import("@/lib/merge/apply");

    const user = await createUser();
    const source = await createSource(user.id);
    const raw1 = await createRawContact(source.id, { name: "Split A" });
    const raw2 = await createRawContact(source.id, { name: "Split B" });
    const candidate = await createMergeCandidate(user.id, [raw1.id, raw2.id]);

    await splitCandidate(user.id, candidate.id);

    const cand = await getMergeCandidate(candidate.id);
    expect(cand?.status).toBe("split");
    expect(cand?.resolved_at).not.toBeNull();
  });

  it("a re-run of runDedupe does not resurrect a split pair", async () => {
    const { splitCandidate } = await import("@/lib/merge/apply");
    const { runDedupe } = await import("@/lib/merge/dedupe");

    const user = await createUser();
    const source = await createSource(user.id);
    // Same name + email → would normally group as an exact/high-confidence
    // duplicate pair.
    const raw1 = await createRawContact(source.id, {
      name: "Same Person",
      emails: ["same@example.com"],
    });
    const raw2 = await createRawContact(source.id, {
      name: "Same Person",
      emails: ["same@example.com"],
    });

    const firstScan = await runDedupe(user.id);
    expect(firstScan.candidatesCreated).toBeGreaterThan(0);

    const sql = getTestSql();
    const [candidateRow] = await sql`
      SELECT id FROM merge_candidates WHERE user_id = ${user.id} LIMIT 1
    `;
    await splitCandidate(user.id, candidateRow.id);

    // Re-scan: the exact same pair must not resurface as a new pending
    // candidate (pair suppression via suppressionPairs in grouping.ts).
    const secondScan = await runDedupe(user.id);
    expect(secondScan.candidatesCreated).toBe(0);

    const pending = await sql`
      SELECT id FROM merge_candidates
      WHERE user_id = ${user.id} AND status = 'pending'
    `;
    expect(pending.length).toBe(0);

    void raw1;
    void raw2;
  });
});
