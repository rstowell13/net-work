import { describe, it, expect } from "vitest";
import { classifyFailureStatus } from "@/lib/sync/auth-error";

describe("classifyFailureStatus", () => {
  it("flags invalid_grant as needs_reauth", () => {
    expect(classifyFailureStatus("invalid_grant")).toBe("needs_reauth");
  });

  it("flags expired/revoked token messages as needs_reauth", () => {
    expect(
      classifyFailureStatus("Token has been expired or revoked."),
    ).toBe("needs_reauth");
    expect(classifyFailureStatus("invalid_token")).toBe("needs_reauth");
    expect(classifyFailureStatus("No OAuth token for source abc")).toBe(
      "needs_reauth",
    );
    expect(classifyFailureStatus("Request had invalid authentication credentials (401)")).toBe(
      "needs_reauth",
    );
  });

  it("treats transient/quota/network errors as plain error", () => {
    expect(classifyFailureStatus("quota exceeded")).toBe("error");
    expect(classifyFailureStatus("ETIMEDOUT")).toBe("error");
    expect(classifyFailureStatus("Internal error 500")).toBe("error");
    expect(classifyFailureStatus("")).toBe("error");
  });
});
