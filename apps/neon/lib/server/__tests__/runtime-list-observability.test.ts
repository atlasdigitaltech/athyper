import { describe, expect, it, vi } from "vitest";
import {
  logRuntimeListDiagnosticSnapshot,
  RuntimeListDiagnosticCollector,
  runtimeDescriptorCacheState,
} from "@/lib/server/runtime-list-observability";

describe("runtime-list observability", () => {
  it("builds stable cache and Server-Timing diagnostics", () => {
    const collector = new RuntimeListDiagnosticCollector({
      entityCode: "journal_entry",
      routeKind: "api",
    });
    collector.record("descriptor", 12.345, "hit");
    collector.record("records", 40.111, "bypass");
    collector.record("records", 2.222, "bypass");

    const snapshot = collector.snapshot(60.777, "bypass");
    expect(snapshot).toMatchObject({
      entityCode: "journal_entry",
      routeKind: "api",
      cacheState: "bypass",
      totalMs: 60.78,
    });
    expect(snapshot.serverTiming).toContain("descriptor;dur=12.35;desc=\"cache=hit\"");
    expect(snapshot.serverTiming).toContain("records;dur=42.33;desc=\"cache=bypass; 2 calls\"");
    expect(snapshot.serverTiming).toContain("total;dur=60.78");
    expect(snapshot.spans).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operation: "descriptor",
        durationMs: 12.35,
        cacheState: "hit",
      }),
    ]));
    expect(collector.responseHeaders(60.777, "bypass")).toMatchObject({
      "Cache-Control": "no-store",
      "X-Athyper-Cache": "bypass",
      "X-Athyper-Descriptor-Cache": "hit",
      "X-Athyper-Record-Cache": "bypass",
    });
  });

  it("maps existing descriptor cache vocabulary to the common diagnostic values", () => {
    expect(runtimeDescriptorCacheState("warm")).toBe("hit");
    expect(runtimeDescriptorCacheState("hot")).toBe("hit");
    expect(runtimeDescriptorCacheState("cold")).toBe("miss");
    expect(runtimeDescriptorCacheState("bypass")).toBe("bypass");
    expect(runtimeDescriptorCacheState(undefined)).toBe("bypass");
  });

  it("emits a structured RSC completion record", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const collector = new RuntimeListDiagnosticCollector({
      entityCode: "journal_entry",
      routeKind: "rsc",
    });
    collector.record("descriptor", 5, "miss");

    logRuntimeListDiagnosticSnapshot(collector.snapshot(25));

    expect(info).toHaveBeenCalledWith(
      "[runtime-list-observability]",
      expect.objectContaining({
        event: "runtime_list_baseline",
        entityCode: "journal_entry",
        serverTiming: expect.stringContaining("rsc_total;dur=25"),
      }),
    );
    info.mockRestore();
  });
});
