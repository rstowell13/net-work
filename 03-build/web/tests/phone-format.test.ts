import { describe, it, expect } from "vitest";
import { formatPhoneDisplay, dedupePhonesForDisplay } from "@/lib/phone-format";

describe("formatPhoneDisplay", () => {
  it("formats a 10-digit US number as (xxx) xxx-xxxx", () => {
    expect(formatPhoneDisplay("8054274108")).toBe("(805) 427-4108");
  });
  it("formats an already-parenthesized US number consistently", () => {
    expect(formatPhoneDisplay("(805) 427-4108")).toBe("(805) 427-4108");
  });
  it("formats a +1 E.164 US number to national style", () => {
    expect(formatPhoneDisplay("+18054274108")).toBe("(805) 427-4108");
  });
  it("formats an 11-digit/dashed US number to national style", () => {
    expect(formatPhoneDisplay("1-805-427-4108")).toBe("(805) 427-4108");
  });
  it("leaves an international number in compact E.164", () => {
    expect(formatPhoneDisplay("+44 20 7946 0958")).toBe("+442079460958");
  });
  it("returns empty string for empty/null", () => {
    expect(formatPhoneDisplay("")).toBe("");
    expect(formatPhoneDisplay(null)).toBe("");
    expect(formatPhoneDisplay(undefined)).toBe("");
  });
  it("returns unparseable input trimmed, as-is (never drops it)", () => {
    expect(formatPhoneDisplay("  ext. 1234  ")).toBe("ext. 1234");
  });
});

describe("dedupePhonesForDisplay", () => {
  it("collapses the same number in different formats into one entry", () => {
    expect(
      dedupePhonesForDisplay(["(805) 427-4108", "+18054274108", "8054274108"]),
    ).toEqual([{ display: "(805) 427-4108", href: "+18054274108" }]);
  });
  it("keeps genuinely different numbers separate, in first-seen order", () => {
    expect(
      dedupePhonesForDisplay(["+18054274108", "(415) 555-0142"]),
    ).toEqual([
      { display: "(805) 427-4108", href: "+18054274108" },
      { display: "(415) 555-0142", href: "+14155550142" },
    ]);
  });
  it("skips empty/null entries", () => {
    expect(
      dedupePhonesForDisplay(["", null, undefined, "8054274108"]),
    ).toEqual([{ display: "(805) 427-4108", href: "+18054274108" }]);
  });
  it("keeps an unparseable number as its own entry with raw href", () => {
    expect(dedupePhonesForDisplay(["ext. 1234"])).toEqual([
      { display: "ext. 1234", href: "ext. 1234" },
    ]);
  });
});
