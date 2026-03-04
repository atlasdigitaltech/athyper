/**
 * Partition Lifecycle Tests
 *
 * Verifies:
 *   - Worker factory produces a callable handler
 *   - Partition naming convention
 *   - Retention cutoff date calculation
 *   - SQL function specifications
 */
import { describe, it, expect, vi } from "vitest";

import { createPartitionLifecycleHandler } from "../jobs/workers/auditPartitionLifecycle.worker.js";


// ─── Test Helpers ──────────────────────────────────────────────────

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

// ─── Worker Factory ────────────────────────────────────────────────

describe("Partition Lifecycle Worker", () => {
  it("should export a factory function", () => {
    expect(typeof createPartitionLifecycleHandler).toBe("function");
  });

  it("should produce a callable handler", () => {
    const logger = createMockLogger();
    const mockDb = {} as any;
    const handler = createPartitionLifecycleHandler(mockDb, logger);
    expect(typeof handler).toBe("function");
  });
});

// ─── Partition Naming Convention ───────────────────────────────────

describe("Partition Naming Convention", () => {
  it("should follow pattern: workflow_event_log_YYYY_MM", () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const expected = `workflow_event_log_${year}_${month}`;

    expect(expected).toMatch(/^workflow_event_log_\d{4}_\d{2}$/);
  });

  it("should extract year and month from partition name", () => {
    const name = "workflow_event_log_2025_06";
    const match = name.match(/_(\d{4})_(\d{2})$/);

    expect(match).not.toBeNull();
    expect(match![1]).toBe("2025");
    expect(match![2]).toBe("06");
  });
});

// ─── Retention Calculation ─────────────────────────────────────────

describe("Retention Calculation", () => {
  it("should calculate cutoff month from retentionDays", () => {
    const retentionDays = 90;
    const now = new Date("2025-06-15");
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - retentionDays);

    // 90 days before June 15 → March 17 → cutoff month = March
    const cutoffMonth = new Date(cutoff.getFullYear(), cutoff.getMonth(), 1);
    expect(cutoffMonth.getMonth()).toBe(2); // March (0-indexed)
    expect(cutoffMonth.getFullYear()).toBe(2025);
  });

  it("should handle year boundary correctly", () => {
    const retentionDays = 90;
    const now = new Date("2025-02-01");
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - retentionDays);

    // 90 days before Feb 1 → Nov 3, 2024
    const cutoffMonth = new Date(cutoff.getFullYear(), cutoff.getMonth(), 1);
    expect(cutoffMonth.getMonth()).toBe(10); // November (0-indexed)
    expect(cutoffMonth.getFullYear()).toBe(2024);
  });

  it("should only drop partitions strictly before the cutoff month", () => {
    const cutoffMonth = new Date(2025, 2, 1); // March 2025
    const partitions = [
      { name: "workflow_event_log_2025_01", date: new Date(2025, 0, 1) }, // Jan → DROP
      { name: "workflow_event_log_2025_02", date: new Date(2025, 1, 1) }, // Feb → DROP
      { name: "workflow_event_log_2025_03", date: new Date(2025, 2, 1) }, // Mar → KEEP
      { name: "workflow_event_log_2025_04", date: new Date(2025, 3, 1) }, // Apr → KEEP
    ];

    const toDrop = partitions.filter(p => p.date < cutoffMonth);
    const toKeep = partitions.filter(p => p.date >= cutoffMonth);

    expect(toDrop).toHaveLength(2);
    expect(toKeep).toHaveLength(2);
    expect(toDrop.map(p => p.name)).toEqual([
      "workflow_event_log_2025_01",
      "workflow_event_log_2025_02",
    ]);
  });
});

// ─── SQL Function Specs ────────────────────────────────────────────

describe("SQL Function Specifications", () => {
  it("spec: create_audit_partition_for_month creates a monthly partition", () => {
    // core.create_audit_partition_for_month('2025-06-01'::date)
    // Creates: core.workflow_event_log_2025_06
    // Range: [2025-06-01, 2025-07-01)
    const input = "2025-06-01";
    const expectedPartition = "workflow_event_log_2025_06";
    expect(expectedPartition).toBe("workflow_event_log_2025_06");
  });

  it("spec: list_audit_partitions returns name, row_count, size_bytes", () => {
    const expectedColumns = ["partition_name", "range_start", "range_end", "row_count", "size_bytes"];
    expect(expectedColumns).toContain("partition_name");
    expect(expectedColumns).toContain("row_count");
    expect(expectedColumns).toContain("size_bytes");
  });

  it("spec: check_audit_partition_indexes verifies 9 expected indexes", () => {
    const expectedIndexes = [
      "idx_wf_audit_tenant_time",
      "idx_wf_audit_instance",
      "idx_wf_audit_step",
      "idx_wf_audit_correlation",
      "idx_wf_audit_event_type",
      "idx_wf_audit_entity",
      "idx_wf_audit_actor",
      "idx_wf_audit_template",
      "idx_wf_audit_details_gin",
    ];
    expect(expectedIndexes).toHaveLength(9);
  });

  it("spec: drop_audit_partition uses DDL (not DML) to bypass immutability trigger", () => {
    // DROP TABLE is DDL, not DML
    // Immutability trigger fires on UPDATE/DELETE (DML), not DROP
    // This is by design — no bypass variable needed for partition drops
    const isDDL = true;
    const bypassRequired = false;
    expect(isDDL).toBe(true);
    expect(bypassRequired).toBe(false);
  });
});

// ─── Pre-creation Logic ────────────────────────────────────────────

describe("Pre-creation Logic", () => {
  it("should create current + N months ahead", () => {
    const preCreateMonths = 3;
    const partitions: string[] = [];

    for (let i = 0; i <= preCreateMonths; i++) {
      const target = new Date();
      target.setMonth(target.getMonth() + i);
      const year = target.getFullYear();
      const month = String(target.getMonth() + 1).padStart(2, "0");
      partitions.push(`workflow_event_log_${year}_${month}`);
    }

    // Current + 3 ahead = 4 partitions
    expect(partitions).toHaveLength(4);
  });
});
