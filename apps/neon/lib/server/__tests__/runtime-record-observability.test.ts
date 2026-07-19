import { describe, expect, it, vi } from "vitest";
import {
  logRuntimeRecordDiagnosticSnapshot,
  RuntimeRecordDiagnosticCollector,
} from "@/lib/server/runtime-record-observability";

describe("runtime record observability", () => {
  it("aggregates operations without exposing the record identifier", () => {
    const collector = new RuntimeRecordDiagnosticCollector({
      entityCode: "journal_entry",
      recordId: "019f7440-70d0-7596-bb59-1104493511a6",
    });
    collector.record("descriptor", 12.345);
    collector.record("process_state", 40);
    collector.record("process_state", 20);

    const snapshot = collector.snapshot({
      totalMs: 80.555,
      renderer: "document",
      capabilities: { approvals: true, snapshots: true },
    });

    expect(snapshot).toMatchObject({
      event: "runtime_record_workspace_baseline",
      entityCode: "journal_entry",
      renderer: "document",
      totalMs: 80.56,
      duplicateOperations: [{ operation: "process_state", calls: 2 }],
    });
    expect(JSON.stringify(snapshot)).not.toContain("019f7440");
  });

  it("emits one structured completion record", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const collector = new RuntimeRecordDiagnosticCollector({
      entityCode: "supplier",
      recordId: "supplier-1",
    });
    const snapshot = collector.snapshot({ totalMs: 10, renderer: "master" });

    logRuntimeRecordDiagnosticSnapshot(snapshot);

    expect(info).toHaveBeenCalledWith(
      "[runtime-record-observability]",
      expect.objectContaining({ event: "runtime_record_workspace_baseline" }),
    );
    info.mockRestore();
  });
});
