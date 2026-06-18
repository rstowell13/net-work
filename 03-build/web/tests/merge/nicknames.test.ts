import { describe, it, expect } from "vitest";
import {
  canonicalFirstToken,
  nameKey,
  emailLocalName,
} from "@/lib/merge/nicknames";

describe("canonicalFirstToken", () => {
  it("collapses known nicknames to their canonical form", () => {
    expect(canonicalFirstToken("joe")).toBe("joseph");
    expect(canonicalFirstToken("joey")).toBe("joseph");
    expect(canonicalFirstToken("bob")).toBe("robert");
    expect(canonicalFirstToken("liz")).toBe("elizabeth");
  });
  it("leaves unknown tokens unchanged", () => {
    expect(canonicalFirstToken("prezuti")).toBe("prezuti");
    expect(canonicalFirstToken("xyz")).toBe("xyz");
  });
});

describe("nameKey", () => {
  it("bridges a nickname and full name with the same surname", () => {
    expect(nameKey("Joe Prezuti")).toBe(nameKey("Joseph Prezuti"));
    expect(nameKey("Joseph Prezuti")).toBe("joseph prezuti");
  });
  it("does NOT bridge across different surnames", () => {
    expect(nameKey("Joe Smith")).not.toBe(nameKey("Joseph Jones"));
  });
  it("does NOT bridge unrelated first names with the same surname", () => {
    // "Jane" and "Joe" are not nickname-equivalent.
    expect(nameKey("Jane Prezuti")).not.toBe(nameKey("Joe Prezuti"));
  });
  it("returns null for single-token or empty names", () => {
    expect(nameKey("Madonna")).toBeNull();
    expect(nameKey("")).toBeNull();
    expect(nameKey(null)).toBeNull();
  });
});

describe("emailLocalName", () => {
  it("parses a first.last local-part", () => {
    expect(emailLocalName("holden.latimer@corp.com")).toBe("holden latimer");
    expect(emailLocalName("HOLDEN.LATIMER@Corp.com")).toBe("holden latimer");
    expect(emailLocalName("holden_latimer@corp.com")).toBe("holden latimer");
  });
  it("its key lines up with the real name's key", () => {
    expect(nameKey(emailLocalName("holden.latimer@x.com"))).toBe(
      nameKey("Holden Latimer"),
    );
  });
  it("returns null for unstructured locals and short surnames", () => {
    expect(emailLocalName("holden@corp.com")).toBeNull(); // single token
    expect(emailLocalName("jpresutti@corp.com")).toBeNull(); // no separator
    expect(emailLocalName("john.li@corp.com")).toBeNull(); // surname < 3
    expect(emailLocalName("notanemail")).toBeNull();
    expect(emailLocalName(null)).toBeNull();
  });
  it("returns null for generic / automated local-parts", () => {
    expect(emailLocalName("hit-reply@linkedin.com")).toBeNull();
    expect(emailLocalName("account-services@hq.bill.com")).toBeNull();
    expect(emailLocalName("customer.care@x.com")).toBeNull();
    expect(emailLocalName("no-reply@x.com")).toBeNull();
  });
});
