import { describe, it, expect } from "vitest";
import { qualifiesForPromotion } from "@/lib/merge/promote-criteria";

describe("qualifiesForPromotion", () => {
  it("promotes a named, two-way correspondent", () => {
    expect(
      qualifiesForPromotion({ name: "Jane Smith", inbound: 3, outbound: 2 }),
    ).toBe(true);
  });

  it("does not promote a named one-way sender (no reply)", () => {
    expect(
      qualifiesForPromotion({ name: "Newsletter Bob", inbound: 9, outbound: 0 }),
    ).toBe(false);
    expect(
      qualifiesForPromotion({ name: "Jane Smith", inbound: 0, outbound: 4 }),
    ).toBe(false);
  });

  it("does not promote an unnamed address even with two-way traffic", () => {
    expect(
      qualifiesForPromotion({ name: null, inbound: 5, outbound: 5 }),
    ).toBe(false);
    expect(
      qualifiesForPromotion({ name: "   ", inbound: 5, outbound: 5 }),
    ).toBe(false);
  });
});
