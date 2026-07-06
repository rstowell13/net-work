import { describe, it, expect } from "vitest";
import { computeStaleness } from "@/lib/staleness";

const NOW = new Date("2026-07-06T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

describe("computeStaleness", () => {
  it("is not stale when everything is healthy", () => {
    const r = computeStaleness(
      {
        sourceStatuses: [{ kind: "gmail", status: "connected" }],
        macAgentLastSeenAt: hoursAgo(1),
        macAgentConnected: true,
      },
      NOW,
    );
    expect(r.stale).toBe(false);
    expect(r.reasons).toEqual([]);
  });

  it("flags a source in error", () => {
    const r = computeStaleness(
      {
        sourceStatuses: [{ kind: "gmail", status: "error" }],
        macAgentLastSeenAt: null,
        macAgentConnected: false,
      },
      NOW,
    );
    expect(r.stale).toBe(true);
    expect(r.reasons[0]).toMatch(/gmail/);
  });

  it("flags a source needing reauth", () => {
    const r = computeStaleness(
      {
        sourceStatuses: [{ kind: "google_calendar", status: "needs_reauth" }],
        macAgentLastSeenAt: null,
        macAgentConnected: false,
      },
      NOW,
    );
    expect(r.stale).toBe(true);
    expect(r.reasons[0]).toMatch(/reconnect/);
  });

  it("ignores not_connected and connected sources", () => {
    const r = computeStaleness(
      {
        sourceStatuses: [
          { kind: "linkedin_csv", status: "not_connected" },
          { kind: "gmail", status: "connected" },
        ],
        macAgentLastSeenAt: null,
        macAgentConnected: false,
      },
      NOW,
    );
    expect(r.stale).toBe(false);
  });

  it("flags a mac agent that has gone quiet for over 48h", () => {
    const r = computeStaleness(
      {
        sourceStatuses: [],
        macAgentLastSeenAt: hoursAgo(49),
        macAgentConnected: true,
      },
      NOW,
    );
    expect(r.stale).toBe(true);
    expect(r.reasons[0]).toMatch(/Mac agent/);
  });

  it("does not flag a mac agent within the 48h window", () => {
    const r = computeStaleness(
      {
        sourceStatuses: [],
        macAgentLastSeenAt: hoursAgo(47),
        macAgentConnected: true,
      },
      NOW,
    );
    expect(r.stale).toBe(false);
  });

  it("does not flag a disconnected mac agent even with an old lastSeenAt", () => {
    const r = computeStaleness(
      {
        sourceStatuses: [],
        macAgentLastSeenAt: hoursAgo(1000),
        macAgentConnected: false,
      },
      NOW,
    );
    expect(r.stale).toBe(false);
  });

  it("collects multiple reasons", () => {
    const r = computeStaleness(
      {
        sourceStatuses: [
          { kind: "gmail", status: "error" },
          { kind: "google_calendar", status: "needs_reauth" },
        ],
        macAgentLastSeenAt: hoursAgo(72),
        macAgentConnected: true,
      },
      NOW,
    );
    expect(r.reasons).toHaveLength(3);
  });
});
