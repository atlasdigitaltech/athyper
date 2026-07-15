// BFF route tests — /api/runtime/v1/lookups/[lookup_code]
// Verifies base_filters merge precedence (server-side base wins on key conflict)
// and the records-API envelope unwrap (data → records).
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/server/session", () => ({
  getNeonServerSession: vi.fn(),
}));
vi.mock("@/lib/server/runtime-headers", () => ({
  buildRuntimeHeaders: vi.fn(() => ({ Authorization: "Bearer t" })),
  buildRuntimeUrl: (path: string) => `http://runtime.test${path}`,
}));

import { GET } from "../route";
import { getNeonServerSession } from "@/lib/server/session";

const SESSION = { userId: "user-1" };

function params(code = "pi_discount_condition_types") {
  return { params: Promise.resolve({ lookup_code: code }) };
}

describe("GET /api/runtime/v1/lookups/[lookup_code]", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNeonServerSession).mockResolvedValue(SESSION as never);
  });

  it("returns 401 when no session", async () => {
    vi.mocked(getNeonServerSession).mockResolvedValueOnce(null as never);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the lookup row is missing or inactive", async () => {
    fetchMock = vi.fn().mockResolvedValueOnce(new Response("not found", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await GET(new Request("http://localhost"), params("nope"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("LOOKUP_NOT_FOUND");
  });

  it("merges caller filters under filter.* and lets base_filters win on key conflict", async () => {
    fetchMock = vi
      .fn()
      // 1: lookup row fetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            lookup_code: "pi_discount_condition_types",
            child_entity: "condition_type",
            base_filters: { type: "discount" },
            status: "active",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      // 2: records fetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: [{ id: "ct-1" }, { id: "ct-2" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(
      // Caller passes type=spurious — should be overridden by base_filters.type=discount.
      new Request("http://localhost?status=active&type=spurious"),
      params(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.records).toHaveLength(2);

    // Inspect the records-fetch URL: filter.type must be "discount" (base), not "spurious".
    const [recordsUrl] = fetchMock.mock.calls[1]!;
    const u = new URL(recordsUrl as string);
    expect(u.pathname).toBe("/api/runtime/v1/entities/condition_type");
    expect(u.searchParams.get("filter.type")).toBe("discount");
    expect(u.searchParams.get("filter.status")).toBe("active");
  });

  it("unwraps the records-API `data` envelope into `records`", async () => {
    fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ lookup_code: "x", child_entity: "y", base_filters: {}, status: "active" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: "row-1" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const res = await GET(new Request("http://localhost"), params());
    const body = await res.json();
    expect(body.records).toEqual([{ id: "row-1" }]);
    expect(body.lookup).toMatchObject({ code: "x", child_entity: "y" });
  });
});
