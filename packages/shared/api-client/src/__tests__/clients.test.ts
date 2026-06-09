import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, createFetch, type ApiFetch } from "../base";
import { createDocumentsClient } from "../documents/client";
import { createLedgerClient } from "../ledger/client";
import { createMetadataClient } from "../metadata/client";
import { createPlatformClient } from "../platform/client";
import { createRecordsClient } from "../records/client";
import { createWorkflowClient } from "../workflow/client";

function recordingFetch(response: unknown = {}): { calls: Array<{ path: string; options?: RequestInit }>; fetch: ApiFetch } {
  const calls: Array<{ path: string; options?: RequestInit }> = [];
  const fetch: ApiFetch = async <T>(path: string, options?: RequestInit): Promise<T> => {
    calls.push({ path, options });
    return response as T;
  };
  return { calls, fetch };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createFetch", () => {
  it("joins base URLs and keeps explicit content types intact", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const apiFetch = createFetch({
      baseUrl: "https://api.example.test/",
      accessToken: "token",
      tenantId: "tenant",
    });

    await apiFetch("/health", {
      method: "POST",
      body: JSON.stringify({ ok: true }),
    });
    await apiFetch("/form", {
      method: "POST",
      body: new URLSearchParams({ q: "one" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const first = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined];
    expect(first?.[0]).toBe("https://api.example.test/health");
    expect(new Headers(first?.[1]?.headers).get("Content-Type")).toBe("application/json");

    const second = fetchMock.mock.calls[1] as unknown as [string, RequestInit | undefined];
    expect(second?.[0]).toBe("https://api.example.test/form");
    expect(new Headers(second?.[1]?.headers).get("Content-Type")).toBe("application/x-www-form-urlencoded");
  });

  it("treats empty success responses as void even without content-length", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const apiFetch = createFetch({
      baseUrl: "https://api.example.test",
      accessToken: "token",
      tenantId: "tenant",
    });

    await expect(apiFetch<void>("/workflow/items/1/action", { method: "POST" })).resolves.toBeUndefined();
  });
});

describe("typed client route builders", () => {
  it("encodes dynamic route segments", async () => {
    const { calls, fetch } = recordingFetch();

    await createRecordsClient(fetch).get("supplier/site", "id/123");
    await createDocumentsClient(fetch).transition("purchase/invoice", "doc/1", { to_status: "approved" });
    await createWorkflowClient(fetch).getApprovalContext("request/1");
    await createLedgerClient(fetch).getPostingTrace("journal/entry", "doc/2");
    await createPlatformClient(fetch).updateSavedView("supplier/site", "view/1", {
      config: { _v: 1, entity: "supplier/site" },
    });

    expect(calls.map((call) => call.path)).toEqual([
      "/api/records/supplier%2Fsite/id%2F123",
      "/api/documents/purchase%2Finvoice/doc%2F1/transition",
      "/api/workflow/requests/request%2F1/context",
      "/api/ledger/trace/journal%2Fentry/doc%2F2",
      "/api/platform/saved-views/supplier%2Fsite/view%2F1",
    ]);
  });
});

describe("metadata client", () => {
  it("returns null for missing entity flows only", async () => {
    const notFoundFetch: ApiFetch = async () => {
      throw new ApiError(404, "NOT_FOUND", "No flow configured");
    };

    await expect(createMetadataClient(notFoundFetch).getEntityFlow("invoice")).resolves.toBeNull();
  });

  it("rethrows non-404 entity flow failures", async () => {
    const error = new ApiError(500, "SERVER_ERROR", "Metadata service failed");
    const failingFetch: ApiFetch = async () => {
      throw error;
    };

    await expect(createMetadataClient(failingFetch).getEntityFlow("invoice")).rejects.toBe(error);
  });
});
