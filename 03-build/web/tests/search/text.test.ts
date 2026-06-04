import { describe, it, expect } from "vitest";
import { escapeLike, makeSnippet } from "@/lib/search/text";

describe("escapeLike", () => {
  it("escapes LIKE wildcards so they match literally", () => {
    expect(escapeLike("50%")).toBe("50\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("c:\\path")).toBe("c:\\\\path");
  });
  it("leaves ordinary text untouched", () => {
    expect(escapeLike("Brian")).toBe("Brian");
  });
});

describe("makeSnippet", () => {
  it("centres a window on the matched term with ellipses", () => {
    const text =
      "We spent the call talking through his commercial real estate fund and the timeline for the next raise.";
    const s = makeSnippet(text, "real estate", 20);
    expect(s).toContain("real estate");
    expect(s.startsWith("…")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
  });

  it("collapses whitespace", () => {
    expect(makeSnippet("a\n\n  b\t c", "b")).toBe("a b c");
  });

  it("returns the whole short text when the term isn't literally present", () => {
    // stemmed full-text match: query 'invest' but text says 'invested'
    expect(makeSnippet("He invested last spring", "investing")).toBe(
      "He invested last spring",
    );
  });

  it("falls back to the head of a long text with no literal match", () => {
    const long = "x".repeat(300);
    const s = makeSnippet(long, "zzz", 70);
    expect(s.endsWith("…")).toBe(true);
    expect(s.length).toBeLessThan(long.length);
  });

  it("does not lead with an ellipsis when the match is at the start", () => {
    const s = makeSnippet("Brian called about the merger", "Brian", 50);
    expect(s.startsWith("…")).toBe(false);
  });

  it("returns empty string for empty text", () => {
    expect(makeSnippet("", "anything")).toBe("");
  });
});
