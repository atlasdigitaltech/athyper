import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("../routes/records.route.ts", import.meta.url), "utf8");
const fanout = readFileSync(new URL("../routes/record-sse-fanout.ts", import.meta.url), "utf8");

describe("record SSE release contract", () => {
  it("uses one process-level subscriber and durable cursor catch-up", () => {
    expect(route).toContain("subscribeRecordSse(redis, channel");
    expect(route).toContain("Last-Event-ID");
    expect(route).toContain("readDurableDocumentRuntimeEvents");
    expect(fanout).toContain("new WeakMap<RedisClient, FanoutState>");
    expect(fanout).toContain("redis.duplicate()");
  });

  it("disconnects slow clients and cleans subscriptions", () => {
    expect(route).toContain("sse_slow_client_disconnect");
    expect(fanout).toContain("unsubscribe(channel)");
  });

  it("resolves optional stream columns from metadata instead of assuming row_version", () => {
    expect(route).toContain("function resolveStreamColumn(");
    expect(route).toContain('resolveStreamColumn(fieldMap, "row_version", configuredVersionColumn)');
    expect(route).toContain('const initialEtag = versionColumn ? String(initialRow?.[versionColumn] ?? 0) : "0";');
    expect(route).not.toContain('.select(["status", "row_version"])');
  });
});
