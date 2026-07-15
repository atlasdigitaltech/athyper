// BFF route tests — /api/runtime/v1/entities/[entity]/rules
// Verifies session + descriptor gates, then the thin upstream passthrough.
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/server/session", () => ({
  getNeonServerSession: vi.fn(),
}));
vi.mock("@/lib/server/meta-entity-runtime", () => ({
  getMetaEntityRuntimeDescriptor: vi.fn(),
}));
vi.mock("@/lib/server/runtime-headers", () => ({
  buildRuntimeHeaders: vi.fn(() => ({ Authorization: "Bearer t" })),
  buildRuntimeUrl: (path: string) => `http://runtime.test${path}`,
}));

import { GET } from "../route";
import { getNeonServerSession } from "@/lib/server/session";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";

const DESCRIPTOR = { entityCode: "purchase_invoice", capabilities: { canRead: true } };
const SESSION = { userId: "user-1" };

function params(entity = "purchase_invoice") {
  return { params: Promise.resolve({ entity }) };
}

describe("GET /api/runtime/v1/entities/[entity]/rules", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNeonServerSession).mockResolvedValue(SESSION as never);
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValue(DESCRIPTOR as never);
    fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, entity: "purchase_invoice", field_rules: {}, action_rules: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  it("returns 401 when no session", async () => {
    vi.mocked(getNeonServerSession).mockResolvedValueOnce(null as never);
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(401);
  });

  it("returns 404 when the entity descriptor is missing (prevents probing)", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValueOnce(null as never);
    const res = await GET(new Request("http://localhost"), params("not_a_thing"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("ENTITY_NOT_FOUND");
  });

  it("normalizes hyphenated entity slugs to underscores before forwarding", async () => {
    await GET(new Request("http://localhost"), params("purchase-invoice"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://runtime.test/api/runtime/v1/entities/purchase_invoice/rules");
  });

  it("passes the upstream envelope through and sets a 60s cache header", async () => {
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=60");
    const body = await res.json();
    expect(body).toMatchObject({ entity: "purchase_invoice", field_rules: {}, action_rules: {} });
  });

  it("propagates upstream errors", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "RULES_DOWN", message: "boom" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("RULES_UPSTREAM_ERROR");
  });
});
