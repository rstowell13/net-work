import { describe, it, expect } from "vitest";
import {
  groupDuplicates,
  groupKey,
  type DedupeRawInput,
} from "@/lib/merge/grouping";

const r = (
  over: Partial<DedupeRawInput> & { id: string },
): DedupeRawInput => ({
  sourceId: "s",
  contactId: null,
  name: null,
  emails: null,
  phones: null,
  linkedinUrl: null,
  ...over,
});

describe("groupDuplicates", () => {
  it("surfaces the Prezuti case: 3 saved contacts (nickname + different emails)", () => {
    const groups = groupDuplicates([
      r({ id: "joe", contactId: "cA", name: "Joe Prezuti", phones: ["(415) 555-0001"] }),
      r({ id: "jos1", contactId: "cB", name: "Joseph Prezuti", emails: ["joseph@company1.com"] }),
      r({ id: "jos2", contactId: "cC", name: "Joseph Prezuti", emails: ["joseph@company2.com"] }),
    ]);
    expect(groups).toHaveLength(1);
    expect(new Set(groups[0].rawContactIds)).toEqual(
      new Set(["joe", "jos1", "jos2"]),
    );
    expect(groups[0].confidence).toBe("ambiguous");
    expect(groups[0].signals.sharedNameKey).toBe("joseph prezuti");
  });

  it("downgrades a name-only match between two saved contacts to ambiguous", () => {
    const groups = groupDuplicates([
      r({ id: "a", contactId: "cA", name: "Joseph Prezuti", emails: ["joseph@company1.com"] }),
      r({ id: "b", contactId: "cB", name: "Joseph Prezuti", emails: ["joseph@company2.com"] }),
    ]);
    expect(groups).toHaveLength(1);
    // Exact same name would be "high", but two distinct saved contacts with only
    // a name in common must be reviewed, never auto-merged.
    expect(groups[0].confidence).toBe("ambiguous");
    expect(groups[0].signals.sharedName).toBe("joseph prezuti");
  });

  it("does not treat an intra-contact duplicate email as a cross-contact match", () => {
    const groups = groupDuplicates([
      // Contact A carries the same email on two of its own source records.
      r({ id: "a1", contactId: "cA", name: "Joseph Presutti", emails: ["jp@nexfab.com"] }),
      r({ id: "a2", contactId: "cA", name: "Joseph Presutti", emails: ["jp@nexfab.com"] }),
      // Contact B: same name, a DIFFERENT email — only the name links them.
      r({ id: "b1", contactId: "cB", name: "Joseph Presutti", emails: ["jp@k2.com"] }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].confidence).toBe("ambiguous");
  });

  it("keeps an email genuinely shared across two saved contacts as exact", () => {
    const groups = groupDuplicates([
      r({ id: "a", contactId: "cA", name: "Jo Smith", emails: ["jo@x.com"] }),
      r({ id: "b", contactId: "cB", name: "Josephine Smith", emails: ["jo@x.com"] }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].confidence).toBe("exact");
  });

  it("links a no-name contact to a named one via the name in their email", () => {
    const groups = groupDuplicates([
      r({ id: "named", contactId: "cA", name: "Holden Latimer" }),
      r({ id: "email", contactId: "cB", name: null, emails: ["holden.latimer@corp.com"] }),
    ]);
    expect(groups).toHaveLength(1);
    expect(new Set(groups[0].rawContactIds)).toEqual(new Set(["named", "email"]));
    expect(groups[0].confidence).toBe("ambiguous");
  });

  it("does not bridge an unstructured email local-part", () => {
    // "holden@" and "latimer@" are single tokens — no surname to anchor on.
    const groups = groupDuplicates([
      r({ id: "a", contactId: "cA", name: null, emails: ["holden@a.com"] }),
      r({ id: "b", contactId: "cB", name: null, emails: ["latimer@b.com"] }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it("ignores a group that is just one saved contact's own records", () => {
    const groups = groupDuplicates([
      r({ id: "a", contactId: "cA", name: "Joseph Prezuti", emails: ["x@y.com"] }),
      r({ id: "b", contactId: "cA", name: "Joseph Prezuti", phones: ["(415) 555-0001"] }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it("still groups loose records sharing an email as exact (create-new path)", () => {
    const groups = groupDuplicates([
      r({ id: "a", name: "Sarah K", emails: ["sarah@x.com"] }),
      r({ id: "b", name: "Sarah Kauffman", emails: ["SARAH@x.com"] }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].confidence).toBe("exact");
  });

  it("never matches on the user's own email address", () => {
    const groups = groupDuplicates(
      [
        r({ id: "a", name: "Random One", emails: ["me@self.com"] }),
        r({ id: "b", name: "Random Two", emails: ["me@self.com"] }),
      ],
      new Set(["me@self.com"]),
    );
    expect(groups).toHaveLength(0);
  });

  it("bridges a nickname between loose records with no shared identifier", () => {
    const groups = groupDuplicates([
      r({ id: "a", name: "Joe Prezuti", emails: ["joe@a.com"] }),
      r({ id: "b", name: "Joseph Prezuti", emails: ["joseph@b.com"] }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].confidence).toBe("ambiguous");
    expect(groups[0].signals.sharedNameKey).toBe("joseph prezuti");
  });

  it("does NOT group different entities sharing a generic last word", () => {
    // These previously "matched" only via the removed first-initial+surname key
    // (a news / c card). Now they don't group at all.
    const groups = groupDuplicates([
      r({ id: "apple", contactId: "a", name: "Apple News", emails: ["newsdigest@insideapple.apple.com"] }),
      r({ id: "ana", contactId: "b", name: "ANA News & Offers", emails: ["ana_news@mail.ana.co.jp"] }),
      r({ id: "chase", contactId: "c", name: "Chase World of Hyatt Visa Card", emails: ["chasevisacard@message.card.visa.com"] }),
      r({ id: "citi", contactId: "d", name: "Citi Strata Elite Card", emails: ["citicards@info3.citi.com"] }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it("does NOT glob same-initial same-surname people; surfaces only the exact pair", () => {
    const groups = groupDuplicates([
      // Two distinct saved contacts that genuinely share an email.
      r({ id: "claire1", contactId: "a", name: "Claire Stowell", emails: ["cstowell@byu.net"] }),
      r({ id: "claire2", contactId: "b", name: "Claire Stowell", emails: ["cstowell@byu.net"] }),
      // Different people who merely share the "C. Stowell" shape.
      r({ id: "candice", contactId: "c", name: "Candice Stowell", emails: ["mikecandi@mac.com"] }),
      r({ id: "clara", contactId: "d", name: "Clara Stowell", emails: ["clairegstowell@gmail.com"] }),
    ]);
    expect(groups).toHaveLength(1);
    expect(new Set(groups[0].rawContactIds)).toEqual(
      new Set(["claire1", "claire2"]),
    );
    expect(groups[0].confidence).toBe("exact");
  });

  it("does NOT group two automated emails that parse to the same pseudo-name", () => {
    // hit-reply@ is generic; neither side is a real "Hit Reply" contact.
    const groups = groupDuplicates([
      r({ id: "a", contactId: "x", name: "Colby Wolford", emails: ["hit-reply@linkedin.com"] }),
      r({ id: "b", contactId: "y", name: "Andrew Lloyd", emails: ["hit-reply@dotloop.com"] }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it("suppresses a group the user already split (split stays split)", () => {
    const rows = [
      r({ id: "a", contactId: "cA", name: "Joseph Presutti", emails: ["jp@nexfab.com"] }),
      r({ id: "b", contactId: "cB", name: "Joseph Presutti", emails: ["jp@k2.com"] }),
    ];
    expect(groupDuplicates(rows)).toHaveLength(1); // would normally resurface
    const suppressed = new Set([groupKey(["a", "b"])]);
    expect(groupDuplicates(rows, new Set(), suppressed)).toHaveLength(0);
  });

  it("still surfaces other groups when an unrelated one is suppressed", () => {
    const rows = [
      r({ id: "a", name: "Joe Prezuti", emails: ["x@y.com"] }),
      r({ id: "b", name: "Joe Prezuti", emails: ["x@y.com"] }),
    ];
    const suppressed = new Set([groupKey(["c", "d"])]); // a different group
    expect(groupDuplicates(rows, new Set(), suppressed)).toHaveLength(1);
  });
});
