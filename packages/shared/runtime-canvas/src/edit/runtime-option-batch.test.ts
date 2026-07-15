import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setBffClientPlane } from "@athyper/runtime-shared/client";
import {
  fetchRuntimeOptionsCached,
  resetRuntimeOptionTransportForTest,
  type RuntimeOptionFetchInput,
} from "./runtime-edit-form";

function input(fieldName: string, cacheKey: string): RuntimeOptionFetchInput {
  return {
    cacheKey,
    entitySlug: "purchase_order",
    fieldName,
    params: new URLSearchParams({ value: `${fieldName}-value`, "context.id": "po-1" }),
    ttlMs: 60_000,
    batchContext: {
      endpoint: "/api/runtime/v1/entities/purchase_order/po-1/edit/field-options/batch",
      permissionStamp: "permission-stamp",
    },
  };
}

beforeEach(() => {
  resetRuntimeOptionTransportForTest();
  setBffClientPlane("neon");
  vi.stubGlobal("document", { cookie: "__csrf=batch-token" });
});

afterEach(() => {
  resetRuntimeOptionTransportForTest();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("runtime option batch transport", () => {
  it("coalesces fields into one secured POST and isolates a failed sibling", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as {
        requests: Array<{ requestId: string; fieldName: string }>;
      };
      return Response.json({
        results: payload.requests.map((request, index) => index === 0
          ? {
              requestId: request.requestId,
              fieldName: request.fieldName,
              ok: true,
              options: [{ value: "company-1", label: "Company 1" }],
            }
          : {
              requestId: request.requestId,
              fieldName: request.fieldName,
              ok: false,
              status: 503,
              message: "Requested-by lookup is temporarily unavailable.",
              options: [],
            }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const settled = await Promise.allSettled([
      fetchRuntimeOptionsCached(input("company_code_id", "company")),
      fetchRuntimeOptionsCached(input("requested_by", "requester")),
    ]);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("x-csrf-token")).toBe("batch-token");
    expect(headers.get("x-document-edit-permission-stamp")).toBe("permission-stamp");
    expect(init.credentials).toBe("include");
    expect(settled[0]).toMatchObject({
      status: "fulfilled",
      value: [{ value: "company-1", label: "Company 1" }],
    });
    expect(settled[1]).toMatchObject({
      status: "rejected",
      reason: { message: "Requested-by lookup is temporarily unavailable." },
    });
  });

  it("surfaces a CSRF rejection as a security error without individual-request fallback", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(
      { error: "CSRF_VALIDATION_FAILED", plane: "neon" },
      { status: 403 },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const settled = await Promise.allSettled([
      fetchRuntimeOptionsCached(input("company_code_id", "company-security")),
      fetchRuntimeOptionsCached(input("requested_by", "requester-security")),
    ]);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(settled).toHaveLength(2);
    for (const result of settled) {
      expect(result).toMatchObject({
        status: "rejected",
        reason: {
          name: "RuntimeOptionSecurityError",
          code: "CSRF_VALIDATION_FAILED",
          status: 403,
        },
      });
    }
  });
});
