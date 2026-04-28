import { describe, it, expect } from "vitest";
import { classify, type ConfidenceInput } from "@/lib/merge/confidence";

const rc = (over: Partial<ConfidenceInput>): ConfidenceInput => ({
  id: "x",
  sourceId: "s",
  name: null,
  emails: null,
  phones: null,
  linkedinUrl: null,
  ...over,
});

describe("classify", () => {
  it("returns null for single-record groups", () => {
    expect(classify([rc({ id: "1" })])).toBeNull();
  });

  it("exact when ≥1 shared email", () => {
    const r = classify([
      rc({ id: "1", emails: ["A@B.com"], name: "Sarah K" }),
      rc({ id: "2", emails: ["a@b.com"], name: "Sarah Kauffman" }),
    ]);
    expect(r?.confidence).toBe("exact");
    expect(r?.signals.sharedEmails).toEqual(["a@b.com"]);
  });

  it("high when shared phone but no email", () => {
    const r = classify([
      rc({ id: "1", phones: ["(415) 555-0142"] }),
      rc({ id: "2", phones: ["+14155550142"] }),
    ]);
    expect(r?.confidence).toBe("high");
  });

  it("high when shared LinkedIn", () => {
    const r = classify([
      rc({ id: "1", linkedinUrl: "https://www.linkedin.com/in/sarahk/" }),
      rc({ id: "2", linkedinUrl: "http://linkedin.com/in/sarahk" }),
    ]);
    expect(r?.confidence).toBe("high");
  });

  it("high when same exact name and no conflicts", () => {
    const r = classify([
      rc({ id: "1", name: "Marisol Vega" }),
      rc({ id: "2", name: "marisol  vega" }),
    ]);
    expect(r?.confidence).toBe("high");
  });

  it("ambiguous when names differ and no shared identifier", () => {
    const r = classify([
      rc({ id: "1", name: "Sarah K" }),
      rc({ id: "2", name: "Sarah Kauffman" }),
    ]);
    expect(r?.confidence).toBe("ambiguous");
  });
});
