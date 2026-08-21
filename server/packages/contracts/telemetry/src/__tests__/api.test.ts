import { describe, expect, expectTypeOf, it } from "vitest";
import type { LogRecord, TelemetryBatch, TelemetryExporter, TelemetryRecord } from "../index.js";

describe("telemetry contract API", () => {
  it("defines exporter records without choosing an SDK", () => {
    const log = {
      kind: "log",
      timestamp: "2026-08-09T00:00:00.000Z",
      serviceName: "platform-host",
      level: "info",
      event: "server.started",
      trace: { traceId: "trace", spanId: "span" },
    } as const satisfies LogRecord;
    const batch = {
      resource: { environment: "test" },
      records: [log],
    } satisfies TelemetryBatch<LogRecord>;

    expect(batch.records[0]?.kind).toBe("log");
    expectTypeOf<TelemetryExporter>().toHaveProperty("export");
    expectTypeOf<LogRecord>().toMatchTypeOf<TelemetryRecord>();
  });
});
