import { describe, it, expect } from "vitest";
import {
  normalizeEmail,
  normalizePhone,
  normalizeName,
  normalizeLinkedIn,
} from "@/lib/merge/normalize";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });
  it("rejects non-email", () => {
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});

describe("normalizePhone", () => {
  it("E.164 from 10-digit US", () => {
    expect(normalizePhone("(415) 555-0142")).toBe("+14155550142");
  });
  it("E.164 from 11-digit with leading 1", () => {
    expect(normalizePhone("1-415-555-0142")).toBe("+14155550142");
  });
  it("preserves explicit +", () => {
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
  });
  it("rejects too-short", () => {
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});

describe("normalizeName", () => {
  it("collapses whitespace and lowercases", () => {
    expect(normalizeName("  Sarah   Kauffman  ")).toBe("sarah kauffman");
  });
});

describe("normalizeLinkedIn", () => {
  it("canonicalizes /in/ profile", () => {
    expect(normalizeLinkedIn("https://www.linkedin.com/in/sarahk/")).toBe(
      "linkedin.com/in/sarahk",
    );
    expect(normalizeLinkedIn("http://linkedin.com/in/sarahk?utm=x")).toBe(
      "linkedin.com/in/sarahk",
    );
  });
});
