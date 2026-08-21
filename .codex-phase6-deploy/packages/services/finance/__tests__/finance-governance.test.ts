import { describe, expect, it } from "vitest";
import { hashCertificationSnapshot } from "../services/finance-governance.service.js";

describe("finance governance certification snapshots", () => {
  it("produces a stable sha256 content hash", () => {
    const snapshot = { cycleRunId: "run-1", certCode: "FINANCE_POSTING_READY", totals: { debit: "10.00", credit: "10.00" } };
    const first = hashCertificationSnapshot(snapshot);
    expect(first).toBe(hashCertificationSnapshot(snapshot));
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes when attested evidence changes", () => {
    expect(hashCertificationSnapshot({ journalIds: ["a"] }))
      .not.toBe(hashCertificationSnapshot({ journalIds: ["a", "b"] }));
  });
});
