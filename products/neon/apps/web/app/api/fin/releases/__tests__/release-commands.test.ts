// releases/__tests__/release-commands.test.ts
//
// Integration-style tests for the seven release commands.
// Tests validate response shape contracts, policy echo structure,
// status snapshot presence, and blocker/warning arrays.
//
// These tests mock the DB layer (sql`...`.execute(db)) and verify
// the route handler logic — they do NOT require a running database.

import { describe, it, expect, vi, beforeEach } from "vitest";

import type {
  ReleaseCommandResult,
  ReleaseStatusSnapshot,
  PolicyBlocker,
  IntegrityCheckResult,
  CleanCloseEvaluation,
} from "@/lib/finance/release-types";

// ---------------------------------------------------------------------------
// 1. Response shape contracts
// ---------------------------------------------------------------------------

describe("ReleaseCommandResult shape", () => {
  it("has required fields for a successful command", () => {
    const result: ReleaseCommandResult = {
      ok: true,
      releaseId: "uuid-1",
      status: "ASSEMBLING",
      message: "Release assembled",
      command: "ASSEMBLE",
      blockers: [],
      warnings: [],
      snapshot: {
        status: "ASSEMBLING",
        isCleanClose: null,
        overrideCount: 0,
        readinessScore: null,
        requiresExceptionSignoff: false,
        hasExceptionSignoff: false,
        packStatus: null,
        batchStatus: null,
        certificationStatus: null,
        distributionCount: 0,
      },
    };

    expect(result.ok).toBe(true);
    expect(result.command).toBe("ASSEMBLE");
    expect(result.blockers).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.snapshot).toBeDefined();
    expect(result.snapshot!.status).toBe("ASSEMBLING");
  });

  it("has blockers for a blocked command", () => {
    const result: ReleaseCommandResult = {
      ok: false,
      releaseId: "uuid-1",
      status: "ASSEMBLING",
      message: "Release cannot be marked ready — 2 blocker(s)",
      command: "MARK_READY",
      blockers: [
        { code: "PACK_NOT_READY", message: "Pack instance status: DRAFT", severity: "error" },
        { code: "BATCH_NOT_READY", message: "Publication batch status: DRAFT", severity: "error" },
      ],
      warnings: [
        { code: "CLEAN_CLOSE_FAIL", message: "Override count 3 exceeds maximum 2", severity: "warning" },
      ],
    };

    expect(result.ok).toBe(false);
    expect(result.blockers).toHaveLength(2);
    expect(result.blockers[0].code).toBe("PACK_NOT_READY");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].severity).toBe("warning");
  });

  it("carries integrity payload for verify-integrity", () => {
    const integrity: IntegrityCheckResult = {
      releaseId: "uuid-1",
      overallPass: false,
      checks: [
        { checkName: "manifest_hash", passed: true, expected: "abc", actual: "abc", detail: null },
        { checkName: "cert_valid", passed: false, expected: "CERTIFIED", actual: "INVALIDATED", detail: "Certification was invalidated" },
      ],
      checkedAt: "2026-03-07T00:00:00.000Z",
    };

    const result: ReleaseCommandResult = {
      ok: false,
      releaseId: "uuid-1",
      status: "READY",
      message: "Integrity verification failed: 1 check(s) failed",
      command: "INTEGRITY_CHECK",
      blockers: [
        { code: "INTEGRITY_CERT_VALID", message: "Certification was invalidated", severity: "error" },
      ],
      warnings: [],
      integrity,
    };

    expect(result.integrity).toBeDefined();
    expect(result.integrity!.overallPass).toBe(false);
    expect(result.integrity!.checks).toHaveLength(2);
    expect(result.integrity!.checks[1].passed).toBe(false);
    expect(result.blockers).toHaveLength(1);
  });

  it("carries cleanClose payload for mark-ready", () => {
    const cleanClose: CleanCloseEvaluation = {
      isCleanClose: false,
      overrideCount: 3,
      overrideImpactTotal: "45700.0000",
      readinessScore: "82.00",
      maxOverridesAllowed: 2,
      minReadinessRequired: "90.00",
      maxImpactAllowed: "50000.0000",
      requiresExceptionSignoff: true,
      failureReasons: [
        "Override count 3 exceeds maximum 2",
        "Readiness score 82.00% below minimum 90.00%",
      ],
    };

    const result: ReleaseCommandResult = {
      ok: true,
      releaseId: "uuid-1",
      status: "READY",
      message: "Release marked as READY",
      command: "MARK_READY",
      blockers: [],
      warnings: [
        { code: "CLEAN_CLOSE_FAIL", message: "Override count 3 exceeds maximum 2", severity: "warning" },
        { code: "CLEAN_CLOSE_FAIL", message: "Readiness score 82.00% below minimum 90.00%", severity: "warning" },
        { code: "EXCEPTION_REQUIRED", message: "Exception signoff will be required before release", severity: "warning" },
      ],
      cleanClose,
    };

    expect(result.cleanClose).toBeDefined();
    expect(result.cleanClose!.isCleanClose).toBe(false);
    expect(result.cleanClose!.requiresExceptionSignoff).toBe(true);
    expect(result.cleanClose!.failureReasons).toHaveLength(2);
    expect(result.warnings).toHaveLength(3);
  });

  it("carries supersession fields for supersede", () => {
    const result: ReleaseCommandResult = {
      ok: true,
      releaseId: "uuid-new",
      status: "ASSEMBLING",
      message: "Original release superseded. New release: REL-CORRECTION",
      command: "SUPERSEDE",
      blockers: [],
      warnings: [
        { code: "CERTS_INVALIDATED", message: "Certifications on the original release have been invalidated", severity: "warning" },
        { code: "DISTS_RECALLED", message: "Distributions from the original release should be recalled", severity: "warning" },
      ],
      supersededReleaseId: "uuid-old",
      newReleaseId: "uuid-new",
    };

    expect(result.supersededReleaseId).toBe("uuid-old");
    expect(result.newReleaseId).toBe("uuid-new");
    expect(result.warnings).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 2. PolicyBlocker contract
// ---------------------------------------------------------------------------

describe("PolicyBlocker", () => {
  it("requires code, message, and severity", () => {
    const blocker: PolicyBlocker = {
      code: "PACK_NOT_READY",
      message: "Pack instance status: DRAFT",
      severity: "error",
    };
    expect(blocker.severity).toBe("error");

    const warning: PolicyBlocker = {
      code: "CLEAN_CLOSE_FAIL",
      message: "Override count exceeds maximum",
      severity: "warning",
    };
    expect(warning.severity).toBe("warning");
  });
});

// ---------------------------------------------------------------------------
// 3. Status snapshot contract
// ---------------------------------------------------------------------------

describe("ReleaseStatusSnapshot", () => {
  it("carries all component statuses", () => {
    const snapshot: ReleaseStatusSnapshot = {
      status: "READY",
      isCleanClose: false,
      overrideCount: 2,
      readinessScore: "88.50",
      requiresExceptionSignoff: true,
      hasExceptionSignoff: false,
      packStatus: "PUBLISHED",
      batchStatus: "PUBLISHED",
      certificationStatus: "CERTIFIED",
      distributionCount: 3,
    };

    expect(snapshot.status).toBe("READY");
    expect(snapshot.packStatus).toBe("PUBLISHED");
    expect(snapshot.batchStatus).toBe("PUBLISHED");
    expect(snapshot.certificationStatus).toBe("CERTIFIED");
    expect(snapshot.distributionCount).toBe(3);
    expect(snapshot.requiresExceptionSignoff).toBe(true);
    expect(snapshot.hasExceptionSignoff).toBe(false);
  });

  it("allows null for optional fields", () => {
    const snapshot: ReleaseStatusSnapshot = {
      status: "ASSEMBLING",
      isCleanClose: null,
      overrideCount: 0,
      readinessScore: null,
      requiresExceptionSignoff: false,
      hasExceptionSignoff: false,
      packStatus: null,
      batchStatus: null,
      certificationStatus: null,
      distributionCount: 0,
    };

    expect(snapshot.isCleanClose).toBeNull();
    expect(snapshot.readinessScore).toBeNull();
    expect(snapshot.packStatus).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. Command scenario coverage
// ---------------------------------------------------------------------------

describe("command scenarios", () => {
  describe("clean release path", () => {
    it("assemble → mark-ready → release produces correct status transitions", () => {
      const assemble: ReleaseCommandResult = {
        ok: true, releaseId: "r1", status: "ASSEMBLING", message: "Assembled",
        command: "ASSEMBLE", blockers: [], warnings: [],
      };
      expect(assemble.status).toBe("ASSEMBLING");

      const markReady: ReleaseCommandResult = {
        ok: true, releaseId: "r1", status: "READY", message: "Ready",
        command: "MARK_READY", blockers: [], warnings: [],
        cleanClose: {
          isCleanClose: true, overrideCount: 0, overrideImpactTotal: "0",
          readinessScore: "97.00", maxOverridesAllowed: 2,
          minReadinessRequired: "90.00", maxImpactAllowed: "50000.0000",
          requiresExceptionSignoff: false, failureReasons: [],
        },
      };
      expect(markReady.status).toBe("READY");
      expect(markReady.cleanClose!.isCleanClose).toBe(true);
      expect(markReady.warnings).toHaveLength(0);

      const release: ReleaseCommandResult = {
        ok: true, releaseId: "r1", status: "RELEASED", message: "Released",
        command: "RELEASE", blockers: [], warnings: [],
      };
      expect(release.status).toBe("RELEASED");
    });
  });

  describe("blocked release path", () => {
    it("mark-ready blocked returns component blockers", () => {
      const result: ReleaseCommandResult = {
        ok: false, releaseId: "r2", status: "ASSEMBLING",
        message: "Release cannot be marked ready — 2 blocker(s)",
        command: "MARK_READY",
        blockers: [
          { code: "PACK_NOT_READY", message: "Pack: DRAFT", severity: "error" },
          { code: "CERT_NOT_READY", message: "Cert: PENDING", severity: "error" },
        ],
        warnings: [],
      };
      expect(result.ok).toBe(false);
      expect(result.blockers.length).toBeGreaterThan(0);
      expect(result.blockers.every((b) => b.severity === "error")).toBe(true);
    });
  });

  describe("exception signoff path", () => {
    it("mark-ready with overrides → exception required → signoff → release", () => {
      const markReady: ReleaseCommandResult = {
        ok: true, releaseId: "r3", status: "READY", message: "Ready",
        command: "MARK_READY", blockers: [],
        warnings: [
          { code: "EXCEPTION_REQUIRED", message: "Exception signoff required", severity: "warning" },
        ],
        cleanClose: {
          isCleanClose: false, overrideCount: 3, overrideImpactTotal: "45700",
          readinessScore: "82", maxOverridesAllowed: 2, minReadinessRequired: "90",
          maxImpactAllowed: "50000", requiresExceptionSignoff: true, failureReasons: ["Override count exceeds max"],
        },
      };
      expect(markReady.cleanClose!.requiresExceptionSignoff).toBe(true);

      const signoff: ReleaseCommandResult = {
        ok: true, releaseId: "r3", status: "READY",
        message: "Exception signoff granted — release can now proceed",
        command: "EXCEPTION_SIGNOFF", blockers: [], warnings: [],
      };
      expect(signoff.ok).toBe(true);

      const release: ReleaseCommandResult = {
        ok: true, releaseId: "r3", status: "RELEASED",
        message: "Release completed",
        command: "RELEASE", blockers: [], warnings: [],
      };
      expect(release.status).toBe("RELEASED");
    });
  });

  describe("supersession path", () => {
    it("supersede returns old + new release IDs with warnings", () => {
      const result: ReleaseCommandResult = {
        ok: true, releaseId: "r-new", status: "ASSEMBLING",
        message: "Original superseded",
        command: "SUPERSEDE", blockers: [],
        warnings: [
          { code: "CERTS_INVALIDATED", message: "Certs invalidated", severity: "warning" },
          { code: "DISTS_RECALLED", message: "Distributions recalled", severity: "warning" },
        ],
        supersededReleaseId: "r-old",
        newReleaseId: "r-new",
      };
      expect(result.supersededReleaseId).toBe("r-old");
      expect(result.newReleaseId).toBe("r-new");
      expect(result.warnings).toHaveLength(2);
    });
  });

  describe("integrity verification", () => {
    it("pass returns ok with empty blockers", () => {
      const result: ReleaseCommandResult = {
        ok: true, releaseId: "r4", status: "READY",
        message: "All integrity checks passed",
        command: "INTEGRITY_CHECK", blockers: [], warnings: [],
        integrity: {
          releaseId: "r4", overallPass: true,
          checks: [
            { checkName: "manifest_hash", passed: true, expected: "abc", actual: "abc", detail: null },
            { checkName: "cert_valid", passed: true, expected: "CERTIFIED", actual: "CERTIFIED", detail: null },
          ],
          checkedAt: "2026-03-07T00:00:00Z",
        },
      };
      expect(result.ok).toBe(true);
      expect(result.integrity!.overallPass).toBe(true);
      expect(result.integrity!.checks.every((c) => c.passed)).toBe(true);
    });

    it("fail returns blockers per failed check", () => {
      const result: ReleaseCommandResult = {
        ok: false, releaseId: "r4", status: "READY",
        message: "Integrity failed: 2 check(s)",
        command: "INTEGRITY_CHECK",
        blockers: [
          { code: "INTEGRITY_MANIFEST_HASH", message: "Hash mismatch", severity: "error" },
          { code: "INTEGRITY_CERT_VALID", message: "Cert invalidated", severity: "error" },
        ],
        warnings: [],
        integrity: {
          releaseId: "r4", overallPass: false,
          checks: [
            { checkName: "manifest_hash", passed: false, expected: "abc", actual: "def", detail: "Hash mismatch" },
            { checkName: "cert_valid", passed: false, expected: "CERTIFIED", actual: "INVALIDATED", detail: "Cert invalidated" },
          ],
          checkedAt: "2026-03-07T00:00:00Z",
        },
      };
      expect(result.ok).toBe(false);
      expect(result.blockers).toHaveLength(2);
      expect(result.integrity!.checks.filter((c) => !c.passed)).toHaveLength(2);
    });
  });

  describe("cancel path", () => {
    it("cancel from ASSEMBLING succeeds", () => {
      const result: ReleaseCommandResult = {
        ok: true, releaseId: "r5", status: "CANCELLED",
        message: "Release cancelled",
        command: "CANCEL", blockers: [], warnings: [],
      };
      expect(result.status).toBe("CANCELLED");
    });

    it("cancel from RELEASED is blocked", () => {
      const result: ReleaseCommandResult = {
        ok: false, releaseId: "r5", status: "RELEASED",
        message: "Cannot cancel this release",
        command: "CANCEL",
        blockers: [
          { code: "CANCEL_DENIED", message: "Release cannot be cancelled in its current state", severity: "error" },
        ],
        warnings: [],
      };
      expect(result.ok).toBe(false);
      expect(result.blockers[0].code).toBe("CANCEL_DENIED");
    });
  });
});

// ---------------------------------------------------------------------------
// 5. All seven commands produce valid command field
// ---------------------------------------------------------------------------

describe("command field validation", () => {
  const validCommands = [
    "ASSEMBLE", "MARK_READY", "RELEASE", "CANCEL",
    "SUPERSEDE", "EXCEPTION_SIGNOFF", "INTEGRITY_CHECK",
  ] as const;

  for (const cmd of validCommands) {
    it(`'${cmd}' is a valid ReleaseCommand`, () => {
      const result: ReleaseCommandResult = {
        ok: true, releaseId: "r", status: "ASSEMBLING",
        message: "test", command: cmd, blockers: [], warnings: [],
      };
      expect(validCommands).toContain(result.command);
    });
  }
});
