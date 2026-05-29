import { describe, it, expect } from "vitest";
import {
  parseAddressEntries,
  parseAddresses,
} from "@/lib/sync/parse-addresses";

describe("parseAddressEntries", () => {
  it("extracts quoted display name + address", () => {
    expect(parseAddressEntries('"Jane Smith" <jane@x.com>')).toEqual([
      { name: "Jane Smith", email: "jane@x.com" },
    ]);
  });

  it("extracts unquoted display name + address", () => {
    expect(parseAddressEntries("Jane Smith <jane@x.com>")).toEqual([
      { name: "Jane Smith", email: "jane@x.com" },
    ]);
  });

  it("returns null name for a bare address", () => {
    expect(parseAddressEntries("jane@x.com")).toEqual([
      { name: null, email: "jane@x.com" },
    ]);
    expect(parseAddressEntries("<jane@x.com>")).toEqual([
      { name: null, email: "jane@x.com" },
    ]);
  });

  it("treats an echoed address as not a real name", () => {
    expect(parseAddressEntries('"jane@x.com" <jane@x.com>')).toEqual([
      { name: null, email: "jane@x.com" },
    ]);
  });

  it("treats the local-part as not a real name", () => {
    expect(parseAddressEntries("jane <jane@x.com>")).toEqual([
      { name: null, email: "jane@x.com" },
    ]);
  });

  it("lowercases the email but preserves name case", () => {
    expect(parseAddressEntries('"Jane Smith" <Jane@X.COM>')).toEqual([
      { name: "Jane Smith", email: "jane@x.com" },
    ]);
  });

  it("handles a comma inside a quoted name", () => {
    expect(parseAddressEntries('"Smith, Jane" <jane@x.com>')).toEqual([
      { name: "Smith, Jane", email: "jane@x.com" },
    ]);
  });

  it("splits multiple addresses", () => {
    expect(
      parseAddressEntries('"Jane Smith" <jane@x.com>, bob@y.com'),
    ).toEqual([
      { name: "Jane Smith", email: "jane@x.com" },
      { name: null, email: "bob@y.com" },
    ]);
  });

  it("skips MIME encoded-word names in v1 (no mojibake)", () => {
    expect(
      parseAddressEntries("=?UTF-8?B?abc?= <jane@x.com>"),
    ).toEqual([{ name: null, email: "jane@x.com" }]);
  });

  it("returns [] for empty input", () => {
    expect(parseAddressEntries("")).toEqual([]);
  });
});

describe("parseAddresses (back-compat: addresses only)", () => {
  it("returns just the addresses", () => {
    expect(parseAddresses('"Jane Smith" <jane@x.com>, bob@y.com')).toEqual([
      "jane@x.com",
      "bob@y.com",
    ]);
  });
});
