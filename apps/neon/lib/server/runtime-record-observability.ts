import "server-only";

export type RuntimeRecordDiagnosticOperation =
  | "session"
  | "descriptor"
  | "record_core"
  | "process_state"
  | "manifest"
  | "query_hydration"
  | "optional"
  | "snapshot_child_contracts"
  | "edit_identity";

export interface RuntimeRecordDiagnosticEntry {
  operation: RuntimeRecordDiagnosticOperation;
  calls: number;
  durationMs: number;
  maxDurationMs: number;
  outcome: "ok" | "error";
}

export interface RuntimeRecordDiagnosticSnapshot {
  schemaVersion: 1;
  event: "runtime_record_workspace_baseline";
  entityCode: string;
  renderer: string;
  recordKeyHash: string;
  totalMs: number;
  operations: RuntimeRecordDiagnosticEntry[];
  duplicateOperations: Array<{ operation: RuntimeRecordDiagnosticOperation; calls: number }>;
  capabilities: Record<string, boolean>;
}

/** Request-local measurements for the server portion of a record workspace. */
export class RuntimeRecordDiagnosticCollector {
  private readonly entries = new Map<RuntimeRecordDiagnosticOperation, RuntimeRecordDiagnosticEntry>();

  constructor(private readonly context: {
    entityCode: string;
    recordId: string;
  }) {}

  async measure<T>(operation: RuntimeRecordDiagnosticOperation, loader: () => Promise<T>): Promise<T> {
    const startedAt = performance.now();
    try {
      const value = await loader();
      this.record(operation, performance.now() - startedAt, "ok");
      return value;
    } catch (error) {
      this.record(operation, performance.now() - startedAt, "error");
      throw error;
    }
  }

  record(
    operation: RuntimeRecordDiagnosticOperation,
    durationMs: number,
    outcome: "ok" | "error" = "ok",
  ): void {
    const duration = roundDuration(durationMs);
    const existing = this.entries.get(operation);
    if (existing) {
      existing.calls += 1;
      existing.durationMs = roundDuration(existing.durationMs + duration);
      existing.maxDurationMs = Math.max(existing.maxDurationMs, duration);
      if (outcome === "error") existing.outcome = "error";
      return;
    }
    this.entries.set(operation, {
      operation,
      calls: 1,
      durationMs: duration,
      maxDurationMs: duration,
      outcome,
    });
  }

  snapshot(input: {
    totalMs: number;
    renderer: string;
    capabilities?: Readonly<Record<string, boolean>>;
  }): RuntimeRecordDiagnosticSnapshot {
    const operations = [...this.entries.values()].map((entry) => ({ ...entry }));
    return {
      schemaVersion: 1,
      event: "runtime_record_workspace_baseline",
      entityCode: this.context.entityCode,
      renderer: input.renderer,
      recordKeyHash: stableHash(this.context.recordId),
      totalMs: roundDuration(input.totalMs),
      operations,
      duplicateOperations: operations
        .filter((entry) => entry.calls > 1)
        .map((entry) => ({ operation: entry.operation, calls: entry.calls })),
      capabilities: { ...(input.capabilities ?? {}) },
    };
  }
}

export function logRuntimeRecordDiagnosticSnapshot(snapshot: RuntimeRecordDiagnosticSnapshot): void {
  console.info("[runtime-record-observability]", snapshot);
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function roundDuration(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100) / 100;
}
