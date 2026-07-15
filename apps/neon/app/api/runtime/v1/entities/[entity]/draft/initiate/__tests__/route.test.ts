import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/session", () => ({
  getNeonServerSession: vi.fn(),
}));

vi.mock("@/lib/server/runtime-headers", () => ({
  buildRuntimeHeaders: vi.fn(() => ({ Authorization: "Bearer t" })),
  buildRuntimeUrl: (path: string) => `http://runtime.test${path}`,
}));

vi.mock("@/lib/server/meta-entity-runtime", () => ({
  getMetaEntityRuntimeDescriptor: vi.fn(),
  getMetaEntityRuntimeDescriptorCacheState: vi.fn(() => "warm"),
}));

vi.mock("@/lib/server/draft-initiation-bootstrap-cache", () => ({
  writeDraftInitiationBootstrap: vi.fn(),
}));

import { POST } from "../route";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { getNeonServerSession } from "@/lib/server/session";

const SESSION = {
  userId: "user-1",
  activeOrg: "org-1",
  organizations: { "org-1": { tenantId: "tenant-1" } },
  planeKey: "neon",
};

function params(entity = "purchase_order") {
  return { params: Promise.resolve({ entity }) };
}

describe("POST /api/runtime/v1/entities/[entity]/draft/initiate", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNeonServerSession).mockResolvedValue(SESSION as never);
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValue({
      createMode: "EARLY_DRAFT",
      capabilities: { canCreate: true },
    } as never);
    fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ record: { id: "draft-1" } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  it("returns 401 before relay when the session is missing", async () => {
    vi.mocked(getNeonServerSession).mockResolvedValueOnce(null as never);
    const response = await POST(
      new Request("http://localhost/api/runtime/v1/entities/purchase_order/draft/initiate", {
        method: "POST",
      }),
      params(),
    );

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("relays the draft-initiate request to the canonical runtime endpoint", async () => {
    const response = await POST(
      new Request("http://localhost/api/runtime/v1/entities/purchase_order/draft/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "create-draft-1" },
        body: JSON.stringify({ source: "new-page" }),
      }),
      params(),
    );

    expect(response.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://runtime.test/api/runtime/v1/entities/purchase_order/draft/initiate");
    expect((init as RequestInit).method).toBe("POST");
    expect(new Headers((init as RequestInit).headers).get("Idempotency-Key")).toBe("create-draft-1");
    expect(JSON.parse((init as RequestInit & { body: string }).body)).toEqual({ source: "new-page" });
    const body = await response.json();
    expect(body.record.id).toBe("draft-1");
  });

  it("normalizes hyphenated entity path segments before relaying", async () => {
    await POST(
      new Request("http://localhost/api/runtime/v1/entities/purchase-order/draft/initiate", {
        method: "POST",
        headers: { "Idempotency-Key": "create-draft-2" },
      }),
      params("purchase-order"),
    );

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://runtime.test/api/runtime/v1/entities/purchase_order/draft/initiate");
  });

  it("rejects draft initiation without an idempotency key", async () => {
    const response = await POST(
      new Request("http://localhost/api/runtime/v1/entities/purchase_order/draft/initiate", { method: "POST" }),
      params(),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
