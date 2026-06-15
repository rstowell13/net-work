import { describe, it, expect } from "vitest";
import { isRoleAddress } from "@/lib/contacts/role-address";

describe("isRoleAddress", () => {
  it("matches exact role local-parts", () => {
    expect(isRoleAddress("info@acme.com")).toBe(true);
    expect(isRoleAddress("support@acme.com")).toBe(true);
    expect(isRoleAddress("sales@acme.com")).toBe(true);
    expect(isRoleAddress("billing@acme.com")).toBe(true);
  });

  it("matches no-reply / bounce prefixes with suffixes and sub-addresses", () => {
    expect(isRoleAddress("noreply@acme.com")).toBe(true);
    expect(isRoleAddress("noreply-123@acme.com")).toBe(true);
    expect(isRoleAddress("no-reply@acme.com")).toBe(true);
    expect(isRoleAddress("bounce+45@acme.com")).toBe(true);
    expect(isRoleAddress("mailer-daemon@acme.com")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isRoleAddress("INFO@Acme.com")).toBe(true);
    expect(isRoleAddress("NoReply@Acme.com")).toBe(true);
  });

  it("keeps real people (exact match only, no substring)", () => {
    expect(isRoleAddress("john.smith@acme.com")).toBe(false);
    expect(isRoleAddress("salesforce-rep@acme.com")).toBe(false);
    expect(isRoleAddress("info.patel@acme.com")).toBe(false);
    expect(isRoleAddress("jane@acme.com")).toBe(false);
  });

  it("handles null / blank / malformed input", () => {
    expect(isRoleAddress(null)).toBe(false);
    expect(isRoleAddress(undefined)).toBe(false);
    expect(isRoleAddress("")).toBe(false);
    expect(isRoleAddress("not-an-email")).toBe(false);
    expect(isRoleAddress("@acme.com")).toBe(false);
  });
});
