import { describe, expect, it } from "vitest";

import {
  buildFrameworkServerTiming,
  classifyFrameworkRequest,
} from "../framework-performance.js";

function request(method: string, url: string, cohort?: string) {
  return {
    method,
    originalUrl: url,
    url,
    headers: cohort ? { "x-rollout-cohort": cohort } : {},
  } as never;
}

describe("framework request classifier", () => {
  it.each([
    ["GET", "/api/metadata/entities/purchase-order/compiled", "descriptor_bootstrap"],
    ["GET", "/api/runtime/v1/entities/supplier?page=1", "list"],
    ["GET", "/api/records/supplier/7b86b633-fdc3-4f06-a175-21bfc6f5145e", "detail"],
    ["POST", "/api/runtime/v1/entities/supplier", "create"],
    ["PATCH", "/api/records/supplier/7b86b633-fdc3-4f06-a175-21bfc6f5145e", "patch"],
    ["POST", "/api/runtime/v1/entities/purchase_invoice/7b86b633-fdc3-4f06-a175-21bfc6f5145e/edit/submit", "aggregate_save"],
  ])("classifies %s %s as %s", (method, url, operation) => {
    expect(classifyFrameworkRequest(request(method, url, "canary"))).toMatchObject({
      operation,
      rolloutCohort: "canary",
    });
  });

  it("does not attach high-cardinality metrics to unrelated routes", () => {
    expect(classifyFrameworkRequest(request("GET", "/api/notifications"))).toBeNull();
  });

  it("renders descriptor, query, pool, SQL, and Redis timing without statement data", () => {
    const header = buildFrameworkServerTiming({
      phases: { descriptor_hydrate: 12.345, query: 23.456 },
      poolWaitMs: 7.891,
      poolAcquireCount: 3,
      sqlDurationMs: 18.234,
      sqlCount: 4,
      redisDurationMs: 2.345,
      redisCount: 2,
      totalDurationMs: 48.765,
    } as never);

    expect(header).toContain("framework_descriptor_hydrate;dur=12.35");
    expect(header).toContain("framework_query;dur=23.46");
    expect(header).toContain("framework_db_pool;dur=7.89;desc=\"3 acquisitions\"");
    expect(header).toContain("framework_db_sql;dur=18.23;desc=\"4 statements\"");
    expect(header).toContain("framework_redis;dur=2.35;desc=\"2 operations\"");
    expect(header).toContain("framework_total;dur=48.77");
  });
});
