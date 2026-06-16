import { describe, it, expect } from "vitest";
import { isRemovableUnknown } from "@/lib/contacts/unknown-contacts-criteria";

describe("isRemovableUnknown", () => {
  it("removes pure ghosts (no activity at all)", () => {
    expect(
      isRemovableUnknown({ messages1on1: 0, inboundEmail: 0, outboundEmail: 0 }),
    ).toBe(true);
  });

  it("removes one-way email (inbound-only marketing blast)", () => {
    expect(
      isRemovableUnknown({ messages1on1: 0, inboundEmail: 5, outboundEmail: 0 }),
    ).toBe(true);
  });

  it("removes one-way email (outbound-only, no reply)", () => {
    expect(
      isRemovableUnknown({ messages1on1: 0, inboundEmail: 0, outboundEmail: 3 }),
    ).toBe(true);
  });

  it("keeps two-way email correspondents", () => {
    expect(
      isRemovableUnknown({ messages1on1: 0, inboundEmail: 63, outboundEmail: 29 }),
    ).toBe(false);
  });

  it("keeps anyone you've texted 1-on-1", () => {
    expect(
      isRemovableUnknown({ messages1on1: 1, inboundEmail: 0, outboundEmail: 0 }),
    ).toBe(false);
  });

  it("does not let group-chat-only activity save an Unknown", () => {
    // messages1on1 excludes group messages, so a group-only contact reads as 0.
    expect(
      isRemovableUnknown({ messages1on1: 0, inboundEmail: 0, outboundEmail: 0 }),
    ).toBe(true);
  });
});
