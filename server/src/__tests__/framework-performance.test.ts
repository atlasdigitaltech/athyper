import { describe, expect, it } from "vitest";

import { classifyFrameworkRequest } from "../framework-performance.js";

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
});
