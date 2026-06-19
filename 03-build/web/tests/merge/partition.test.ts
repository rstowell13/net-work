import { describe, it, expect } from "vitest";
import {
  validatePartition,
  pluralityBucketIndex,
  type PartitionBucket,
} from "@/lib/merge/partition-plan";

const CAND = ["r1", "r2", "r3", "r4"];
const INVOLVED = ["cA", "cB"];

describe("validatePartition", () => {
  it("accepts a valid two-person split (some records skipped)", () => {
    const buckets: PartitionBucket[] = [
      { name: "Robb", rawIds: ["r1", "r2"] },
      { keepContactId: "cB", rawIds: ["r3"] },
    ];
    expect(validatePartition(CAND, INVOLVED, buckets)).toBeNull();
  });

  it("rejects when nothing is assigned", () => {
    expect(validatePartition(CAND, INVOLVED, [{ rawIds: [] }])).toBe(
      "no_records_assigned",
    );
  });

  it("rejects a record that isn't in the candidate", () => {
    expect(
      validatePartition(CAND, INVOLVED, [{ rawIds: ["r1", "nope"] }]),
    ).toBe("raw_not_in_candidate");
  });

  it("rejects a record assigned to two buckets", () => {
    expect(
      validatePartition(CAND, INVOLVED, [
        { rawIds: ["r1"] },
        { rawIds: ["r1"] },
      ]),
    ).toBe("raw_assigned_twice");
  });

  it("rejects keeping a contact that isn't in the group", () => {
    expect(
      validatePartition(CAND, INVOLVED, [
        { keepContactId: "cZ", rawIds: ["r1"] },
      ]),
    ).toBe("keep_contact_not_involved");
  });

  it("rejects two buckets keeping the same contact", () => {
    expect(
      validatePartition(CAND, INVOLVED, [
        { keepContactId: "cA", rawIds: ["r1"] },
        { keepContactId: "cA", rawIds: ["r2"] },
      ]),
    ).toBe("duplicate_keep_contact");
  });
});

describe("pluralityBucketIndex", () => {
  it("picks the bucket holding the most of a contact's records", () => {
    const sets = [new Set(["r1"]), new Set(["r2", "r3"])];
    expect(pluralityBucketIndex(["r1", "r2", "r3"], sets)).toBe(1);
  });
  it("breaks ties toward the earliest bucket", () => {
    const sets = [new Set(["r1"]), new Set(["r2"])];
    expect(pluralityBucketIndex(["r1", "r2"], sets)).toBe(0);
  });
  it("returns -1 when none of the contact's records were assigned", () => {
    const sets = [new Set(["r9"]), new Set(["r8"])];
    expect(pluralityBucketIndex(["r1", "r2"], sets)).toBe(-1);
  });
});
