import { describe, it, expect } from "vitest";
import {
  buildHandleMaps,
  matchAttendees,
  matchCallHandle,
  matchEmailRow,
  matchThreadHandle,
} from "@/lib/relink-match";

const maps = buildHandleMaps(
  [
    {
      contactId: "c1",
      emails: ["John.Smith@Acme.com"],
      phones: ["(415) 555-0142"],
    },
    { contactId: "c2", emails: ["mary@x.com"], phones: ["+14155550199"] },
    // Self address must never become a match key.
    { contactId: "c3", emails: ["me@self.com"], phones: null },
    // Loose raw (no contact) contributes nothing.
    { contactId: null, emails: ["loose@x.com"], phones: ["555"] },
  ],
  new Set(["me@self.com"]),
);

describe("buildHandleMaps", () => {
  it("lowercases emails and normalizes phones", () => {
    expect(maps.emailToContact.get("john.smith@acme.com")).toBe("c1");
    expect(maps.phoneToContact.get("4155550142")).toBe("c1");
  });
  it("excludes self addresses and loose raws", () => {
    expect(maps.emailToContact.has("me@self.com")).toBe(false);
    expect(maps.emailToContact.has("loose@x.com")).toBe(false);
    expect(maps.contactIds).toEqual(new Set(["c1", "c2", "c3"]));
  });
});

describe("matchThreadHandle", () => {
  it("matches an email handle case-insensitively (the 2026-07 divergence bug)", () => {
    expect(matchThreadHandle("John.Smith@ACME.com", maps)).toBe("c1");
  });
  it("matches a phone handle across formats", () => {
    expect(matchThreadHandle("+14155550142", maps)).toBe("c1");
    expect(matchThreadHandle("415-555-0199", maps)).toBe("c2");
  });
  it("returns undefined for null/unknown", () => {
    expect(matchThreadHandle(null, maps)).toBeUndefined();
    expect(matchThreadHandle("nobody@nowhere.com", maps)).toBeUndefined();
  });
});

describe("matchCallHandle", () => {
  it("matches phones only", () => {
    expect(matchCallHandle("(415) 555 0199", maps)).toBe("c2");
    expect(matchCallHandle("john.smith@acme.com", maps)).toBeUndefined();
  });
});

describe("matchEmailRow", () => {
  it("prefers from_email, falls back to recipients, case-insensitive", () => {
    expect(
      matchEmailRow({ fromEmail: "JOHN.SMITH@ACME.COM", toEmails: null }, maps),
    ).toBe("c1");
    expect(
      matchEmailRow(
        { fromEmail: "me@self.com", toEmails: ["Mary@X.com"] },
        maps,
      ),
    ).toBe("c2");
    expect(
      matchEmailRow({ fromEmail: null, toEmails: ["nobody@y.com"] }, maps),
    ).toBeUndefined();
  });
});

describe("matchAttendees", () => {
  it("matches the first known attendee, case-insensitive", () => {
    expect(matchAttendees(["ME@SELF.COM", "Mary@X.com"], maps)).toBe("c2");
    expect(matchAttendees([], maps)).toBeUndefined();
    expect(matchAttendees(null, maps)).toBeUndefined();
  });
});
