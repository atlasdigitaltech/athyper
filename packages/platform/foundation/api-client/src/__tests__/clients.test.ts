import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, createFetch, type ApiFetch } from "../base";
import { createCollabClient } from "../collab/client";
import { createDocumentsClient } from "../documents/client";
import { createLedgerClient } from "../ledger/client";
import { createMetadataClient } from "../metadata/client";
import { createPlatformClient } from "../platform/client";
import { createRecordsClient } from "../records/client";
import { createWorkflowClient } from "../workflow/client";
import { serializeFilterEntry } from "../paths";

function recordingFetch(
  response: unknown = {},
): { calls: Array<{ path: string; options?: RequestInit }>; fetch: ApiFetch } {
  const calls: Array<{ path: string; options?: RequestInit }> = [];
  const apiFetch: ApiFetch = async <T>(path: string, options?: RequestInit): Promise<T> => {
    calls.push({ path, options });
    return response as T;
  };
  return { calls, fetch: apiFetch };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── createFetch ───────────────────────────────────────────────────────────────

describe("createFetch", () => {
  it("joins base URLs and keeps explicit content types intact", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const apiFetch = createFetch({
      baseUrl:     "https://api.example.test/",
      accessToken: "token",
      tenantId:    "tenant",
    });

    await apiFetch("/health", { method: "POST", body: JSON.stringify({ ok: true }) });
    await apiFetch("/form", {
      method:  "POST",
      body:    new URLSearchParams({ q: "one" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const first = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined];
    expect(first?.[0]).toBe("https://api.example.test/health");
    expect(new Headers(first?.[1]?.headers).get("Content-Type")).toBe("application/json");

    const second = fetchMock.mock.calls[1] as unknown as [string, RequestInit | undefined];
    expect(second?.[0]).toBe("https://api.example.test/form");
    expect(new Headers(second?.[1]?.headers).get("Content-Type")).toBe("application/x-www-form-urlencoded");
  });

  it("treats empty success responses as void", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));

    const apiFetch = createFetch({ baseUrl: "https://api.example.test", accessToken: "t", tenantId: "t" });
    await expect(apiFetch<void>("/workflow/items/1/action", { method: "POST" })).resolves.toBeUndefined();
  });

  it("attaches X-Request-Id and auth headers", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const apiFetch = createFetch({ baseUrl: "https://api.example.test", accessToken: "tok", tenantId: "t1" });
    await apiFetch("/ping");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers  = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer tok");
    expect(headers.get("X-Tenant-Id")).toBe("t1");
    expect(headers.get("X-Request-Id")).toBeTruthy();
  });

  it("retries GET on 503 once with backoff", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls++;
      if (calls === 1) return new Response(JSON.stringify({ errors: [{ code: "UNAVAILABLE", message: "down" }] }), { status: 503 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));

    const apiFetch = createFetch({
      baseUrl:     "https://api.example.test",
      accessToken: "t",
      tenantId:    "t",
      retry:       { attempts: 1, delayMs: 0, retryOn: [503] },
    });

    const result = await apiFetch<{ ok: boolean }>("/data");
    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it("does not retry POST on 503", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls++;
      return new Response(JSON.stringify({ errors: [{ code: "UNAVAILABLE", message: "down" }] }), { status: 503 });
    }));

    const apiFetch = createFetch({
      baseUrl:     "https://api.example.test",
      accessToken: "t",
      tenantId:    "t",
      retry:       { attempts: 1, delayMs: 0, retryOn: [503] },
    });

    await expect(apiFetch("/submit", { method: "POST" })).rejects.toThrow(ApiError);
    expect(calls).toBe(1);
  });

  it("calls refreshToken on 401 and retries", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls++;
      if (calls === 1) return new Response(JSON.stringify({ errors: [{ code: "UNAUTHORIZED", message: "expired" }] }), { status: 401 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));

    const refreshToken = vi.fn(async () => "new-token");
    const apiFetch = createFetch({
      baseUrl:      "https://api.example.test",
      accessToken:  "old-token",
      tenantId:     "t",
      refreshToken,
    });

    await apiFetch<{ ok: boolean }>("/data");
    expect(refreshToken).toHaveBeenCalledOnce();
    expect(calls).toBe(2);
  });

  it("parses all three error envelope shapes", async () => {
    const make = (body: object, status = 400) =>
      vi.fn(async () => new Response(JSON.stringify(body), { status }));

    const apiFetch = createFetch({ baseUrl: "https://api.example.test", accessToken: "t", tenantId: "t" });

    // Shape 1: errors array
    vi.stubGlobal("fetch", make({ errors: [{ code: "VALIDATION", message: "bad" }] }));
    await expect(apiFetch("/x")).rejects.toMatchObject({ code: "VALIDATION", message: "bad" });

    // Shape 2: error string
    vi.stubGlobal("fetch", make({ error: "Not found", code: "NOT_FOUND" }, 404));
    await expect(apiFetch("/x")).rejects.toMatchObject({ code: "NOT_FOUND", message: "Not found" });

    // Shape 3: message string
    vi.stubGlobal("fetch", make({ message: "Internal error" }, 500));
    await expect(apiFetch("/x")).rejects.toMatchObject({ message: "Internal error" });
  });
});

// ── Route builders ────────────────────────────────────────────────────────────

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

    expect(calls.map((c) => c.path)).toEqual([
      "/api/runtime/v1/entities/supplier%2Fsite/id%2F123",
      "/api/documents/purchase%2Finvoice/doc%2F1/transition",
      "/api/workflow/requests/request%2F1/context",
      "/api/ledger/trace/journal%2Fentry/doc%2F2",
      "/api/platform/saved-views/supplier%2Fsite/view%2F1",
    ]);
  });

  it("builds document bundle path", async () => {
    const { calls, fetch } = recordingFetch();
    await createDocumentsClient(fetch).getBundle("purchase_invoice", "inv-1");
    expect(calls[0]?.path).toBe("/api/documents/purchase_invoice/inv-1/bundle");
  });

  it("builds recent activity path with limit", async () => {
    const { calls, fetch } = recordingFetch({ data: [] });
    await createWorkflowClient(fetch).getRecentActivity(25);
    expect(calls[0]?.path).toBe("/api/activity/recent?limit=25");
  });
});

// ── Records list ──────────────────────────────────────────────────────────────

describe("records client — list query string", () => {
  it("appends parent_id when provided, omits it otherwise", async () => {
    const { calls, fetch } = recordingFetch({ data: [], pagination: {} });
    const client = createRecordsClient(fetch);

    await client.list("purchase_invoice_line", { parent_id: "inv-42" });
    await client.list("purchase_invoice_line");

    expect(calls[0]?.path).toBe("/api/runtime/v1/entities/purchase_invoice_line?parent_id=inv-42");
    expect(calls[1]?.path).toBe("/api/runtime/v1/entities/purchase_invoice_line");
  });

  it("coexists with other params without collision", async () => {
    const { calls, fetch } = recordingFetch({ data: [], pagination: {} });
    await createRecordsClient(fetch).list("purchase_invoice_line", {
      q:        "consulting",
      parent_id: "inv-42",
      page:     2,
      pageSize: 50,
      sort:     [{ key: "line_number", dir: "asc" }],
    });

    const url = new URL(`http://x${calls[0]?.path ?? ""}`);
    expect(url.searchParams.get("parent_id")).toBe("inv-42");
    expect(url.searchParams.get("q")).toBe("consulting");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("page_size")).toBe("50");
    expect(url.searchParams.get("sort")).toBe("line_number:asc");
  });

  it("serializes filters as filter.<field> sigil params", async () => {
    const { calls, fetch } = recordingFetch({ data: [], pagination: {} });
    await createRecordsClient(fetch).list("supplier", {
      filters: {
        status: { in: ["active", "trial"] },
        amount: { gte: 1000 },
      },
    });

    const url = new URL(`http://x${calls[0]?.path ?? ""}`);
    expect(url.searchParams.get("filter.status")).toBe("in:active,trial");
    expect(url.searchParams.get("filter.amount")).toBe("gte:1000");
  });
});

// ── Metadata client ───────────────────────────────────────────────────────────

describe("metadata client", () => {
  it("returns null for missing entity flows only", async () => {
    const notFoundFetch: ApiFetch = async () => {
      throw new ApiError(404, "NOT_FOUND", "No flow configured");
    };
    await expect(createMetadataClient(notFoundFetch).getEntityFlow("invoice")).resolves.toBeNull();
  });

  it("rethrows non-404 entity flow failures", async () => {
    const error = new ApiError(500, "SERVER_ERROR", "Metadata service failed");
    const failingFetch: ApiFetch = async () => { throw error; };
    await expect(createMetadataClient(failingFetch).getEntityFlow("invoice")).rejects.toBe(error);
  });
});

// ── Filter serialization ──────────────────────────────────────────────────────

describe("serializeFilterEntry", () => {
  it.each([
    [{ eq: "foo" },          "foo"],
    [{ neq: "bar" },         "neq:bar"],
    [{ in: ["a", "b"] },    "in:a,b"],
    [{ nin: ["x"] },         "nin:x"],
    [{ gt: 10 },             "gt:10"],
    [{ gte: 0 },             "gte:0"],
    [{ lt: 100 },            "lt:100"],
    [{ lte: 99 },            "lte:99"],
    [{ like: "%foo%" },      "like:%foo%"],
    [{ ilike: "%bar%" },     "ilike:%bar%"],
    [{ isNull: true },       "null"],
    [{ isNull: false },      "notnull"],
  ] as const)("serializes %j → %s", (entry, expected) => {
    expect(serializeFilterEntry(entry)).toBe(expected);
  });
});

// ── Collab client ─────────────────────────────────────────────────────────────

describe("collab client", () => {
  it("builds batch bookmark path correctly", async () => {
    const { calls, fetch } = recordingFetch({ bookmarked_ids: [] });
    await createCollabClient(fetch).getBatchBookmarks("supplier", ["id1", "id2"]);
    const url = new URL(`http://x${calls[0]?.path ?? ""}`);
    expect(url.pathname).toBe("/api/collab/bookmarks/batch");
    expect(url.searchParams.get("entity_code")).toBe("supplier");
    expect(url.searchParams.get("ids")).toBe("id1,id2");
  });

  it("returns empty bookmarked_ids without a network call when recordIds is empty", async () => {
    const { calls, fetch } = recordingFetch();
    const result = await createCollabClient(fetch).getBatchBookmarks("supplier", []);
    expect(calls).toHaveLength(0);
    expect(result.bookmarked_ids).toEqual([]);
  });
});
