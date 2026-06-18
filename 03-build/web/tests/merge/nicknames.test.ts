import { describe, it, expect } from "vitest";
import {
  canonicalFirstToken,
  nameKey,
  initialKey,
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

describe("initialKey", () => {
  it("uses first initial + surname, collapsing nicknames and middle names", () => {
    expect(initialKey("Joe Prezuti")).toBe("j prezuti");
    expect(initialKey("Joseph Prezuti")).toBe("j prezuti");
    expect(initialKey("Joseph Allen Prezuti")).toBe("j prezuti");
  });
  it("groups same-initial look-alikes (caller routes these to review tier)", () => {
    expect(initialKey("Jane Prezuti")).toBe(initialKey("Joe Prezuti"));
  });
  it("skips one-character surnames and single tokens", () => {
    expect(initialKey("John O")).toBeNull();
    expect(initialKey("Cher")).toBeNull();
    expect(initialKey(null)).toBeNull();
  });
});

describe("emailLocalName", () => {
  it("parses first.last and f.last locals", () => {
    expect(emailLocalName("holden.latimer@corp.com")).toBe("holden latimer");
    expect(emailLocalName("h.latimer@corp.com")).toBe("h latimer");
    expect(emailLocalName("HOLDEN.LATIMER@Corp.com")).toBe("holden latimer");
    expect(emailLocalName("holden_latimer@corp.com")).toBe("holden latimer");
  });
  it("derived keys line up with a real name's keys", () => {
    expect(nameKey(emailLocalName("holden.latimer@x.com"))).toBe(
      nameKey("Holden Latimer"),
    );
    expect(initialKey(emailLocalName("h.latimer@x.com"))).toBe(
      initialKey("Holden Latimer"),
    );
  });
  it("returns null for unstructured locals and short surnames", () => {
    expect(emailLocalName("holden@corp.com")).toBeNull(); // single token
    expect(emailLocalName("jpresutti@corp.com")).toBeNull(); // no separator
    expect(emailLocalName("john.li@corp.com")).toBeNull(); // surname < 3
    expect(emailLocalName("notanemail")).toBeNull();
    expect(emailLocalName(null)).toBeNull();
  });
});
