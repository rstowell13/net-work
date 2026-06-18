import { describe, it, expect } from "vitest";
import { isBusinessName } from "@/lib/contacts/business-name";

describe("isBusinessName", () => {
  it("flags departments and back-office desks", () => {
    expect(isBusinessName("Oracle Netsuite Collections Department")).toBe(true);
    expect(isBusinessName("Accounts Payable")).toBe(true);
    expect(isBusinessName("Anthem Blue Cross Billing")).toBe(true);
    expect(isBusinessName("Bovada Customer Service")).toBe(true);
    expect(isBusinessName("Customer Success")).toBe(true);
    expect(isBusinessName("RASI Client Support")).toBe(true);
    expect(isBusinessName("SendThisFile Notifications")).toBe(true);
    expect(isBusinessName("New York State Department of Taxation and Finance")).toBe(true);
    expect(isBusinessName("Salesforce Support Response")).toBe(true);
  });

  it("flags automated reply / e-sign senders", () => {
    expect(isBusinessName("Do Not Reply")).toBe(true);
    expect(isBusinessName("Grobstein Teeple Tax Services via Docusign")).toBe(true);
  });

  it("keeps real people and working team/sales aliases (high-precision)", () => {
    expect(isBusinessName("Spencer Team")).toBe(false);
    expect(isBusinessName("Nielsen Jensen Investment Team")).toBe(false);
    expect(isBusinessName("Mel Sales")).toBe(false);
    expect(isBusinessName("Just Right Services")).toBe(false);
    expect(isBusinessName("Robb Stowell")).toBe(false);
  });

  it("does not match substrings of real words", () => {
    expect(isBusinessName("Casino Reply Desk Co")).toBe(false); // not "no reply"
    expect(isBusinessName("Billings Montana Office")).toBe(false); // not "billing"
  });

  it("handles null / blank", () => {
    expect(isBusinessName(null)).toBe(false);
    expect(isBusinessName(undefined)).toBe(false);
    expect(isBusinessName("")).toBe(false);
  });
});
