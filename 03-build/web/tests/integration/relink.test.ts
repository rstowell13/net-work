import { describe, it, expect, afterAll, beforeEach } from "vitest";
import {
  truncateAll,
  closeTestSql,
  getTestSql,
  createUser,
  createSource,
  createRawContact,
  createContact,
} from "./_harness";

const skip = !process.env.TEST_DATABASE_URL;

// Migrations are applied once for the whole run by globalSetup (see
// vitest.integration.config.ts + tests/integration/_global-setup.ts).
describe.skipIf(skip)("relink integration", () => {
  afterAll(async () => {
    await closeTestSql();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  it("relinkContact links a dangling thread with a mixed-case email handle to a contact with a lowercase raw email", async () => {
    const { relinkContact } = await import("@/lib/relink");
    const sql = getTestSql();

    const user = await createUser();
    const source = await createSource(user.id);
    const contact = await createContact(user.id, { displayName: "Alex Kim" });
    await createRawContact(source.id, {
      contactId: contact.id,
      name: "Alex Kim",
      emails: ["alex.kim@example.com"], // stored lowercase
    });

    const [thread] = await sql`
      INSERT INTO message_threads (handle, external_thread_id, started_at, ended_at)
      VALUES ('Alex.Kim@Example.com', 'thread-mixedcase', now(), now())
      RETURNING id
    `;

    const result = await relinkContact(contact.id);
    expect(result.messageThreads).toBe(1);

    const row = await sql`SELECT contact_id FROM message_threads WHERE id = ${thread.id}`;
    expect(row[0].contact_id).toBe(contact.id);
  });

  it("relinkAfterMerge links the same dangling thread (unified matcher)", async () => {
    const { relinkAfterMerge } = await import("@/lib/relink");
    const sql = getTestSql();

    const user = await createUser();
    const source = await createSource(user.id);
    const contact = await createContact(user.id, { displayName: "Sam Lee" });
    await createRawContact(source.id, {
      contactId: contact.id,
      name: "Sam Lee",
      emails: ["sam.lee@example.com"],
    });

    const [thread] = await sql`
      INSERT INTO message_threads (handle, external_thread_id, started_at, ended_at)
      VALUES ('SAM.LEE@EXAMPLE.COM', 'thread-mixedcase-2', now(), now())
      RETURNING id
    `;

    const result = await relinkAfterMerge(user.id);
    expect(result.totals.messageThreads).toBe(1);

    const row = await sql`SELECT contact_id FROM message_threads WHERE id = ${thread.id}`;
    expect(row[0].contact_id).toBe(contact.id);
  });

  it("excludes the user's own email from matching (self-email exclusion)", async () => {
    const { relinkContact } = await import("@/lib/relink");
    const sql = getTestSql();

    const ownerEmail = "owner@example.com";
    const user = await createUser({ email: ownerEmail });
    // A Google-connected source whose config carries the self email — this is
    // how getSelfEmails discovers "self" addresses.
    await sql`
      INSERT INTO sources (user_id, kind, account_email, status, config)
      VALUES (${user.id}, 'gmail', ${ownerEmail}, 'connected', ${sql.json({ google_email: ownerEmail })})
    `;
    const contactSource = await createSource(user.id, { kind: "mac_agent" });
    const contact = await createContact(user.id, { displayName: "Self Test" });
    // A raw record that (implausibly but per the contract) carries the self
    // email — relink must still never use it as a match key.
    await createRawContact(contactSource.id, {
      contactId: contact.id,
      name: "Self Test",
      emails: [ownerEmail],
    });

    const [thread] = await sql`
      INSERT INTO message_threads (handle, external_thread_id, started_at, ended_at)
      VALUES (${ownerEmail}, 'thread-self', now(), now())
      RETURNING id
    `;

    await relinkContact(contact.id);

    const row = await sql`SELECT contact_id FROM message_threads WHERE id = ${thread.id}`;
    expect(row[0].contact_id).toBeNull();
  });
});
