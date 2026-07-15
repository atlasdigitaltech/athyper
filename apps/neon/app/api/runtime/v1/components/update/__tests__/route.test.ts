// BFF route tests — POST /api/runtime/v1/components/update
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/server/session", () => ({
  getNeonServerSession: vi.fn(),
}));
vi.mock("@/lib/server/runtime-headers", () => ({
  buildRuntimeHeaders: vi.fn(() => ({ Authorization: "Bearer t" })),
  buildRuntimeUrl: (path: string) => `http://runtime.test${path}`,
}));

import { POST } from "../route";
import { getNeonServerSession } from "@/lib/server/session";

const SESSION = { userId: "user-1" };

function makeRequest(body: unknown): Request {
  return new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/runtime/v1/components/update", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNeonServerSession).mockResolvedValue(SESSION as never);
    fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, updated: { id: "pc-1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  it("returns 401 when no session", async () => {
    vi.mocked(getNeonServerSession).mockResolvedValueOnce(null as never);
    const res = await POST(
      makeRequest({
        source_doc_type: "PURCHASE_INVOICE_LINE",
        source_doc_id: "inv-1",
        component_id: "pc-1",
        patch: { amount: 5 },
      }),
    );
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["missing all", {}],
    ["missing component_id", { source_doc_type: "PURCHASE_INVOICE_LINE", source_doc_id: "inv-1", patch: {} }],
    ["missing patch",        { source_doc_type: "PURCHASE_INVOICE_LINE", source_doc_id: "inv-1", component_id: "pc-1" }],
    ["non-object body",      "not an object"],
  ])("returns 400 (%s)", async (_label, body) => {
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
  });

  it("returns 400 when source_doc_type is not on the writer allow-list", async () => {
    const res = await POST(
      makeRequest({
        source_doc_type: "UNKNOWN",
        source_doc_id: "inv-1",
        component_id: "pc-1",
        patch: { amount: 5 },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("SOURCE_DOC_TYPE_NOT_SUPPORTED_BY_WRITER");
  });

  it("forwards to the AP pricing-component PATCH endpoint with source_doc fields injected", async () => {
    const res = await POST(
      makeRequest({
        source_doc_type: "PURCHASE_INVOICE_LINE",
        source_doc_id: "inv-1",
        component_id: "pc-1",
        patch: { amount: 5 },
      }),
    );
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://runtime.test/api/finance/ap/invoices/inv-1/pricing-components/pc-1");
    expect((init as RequestInit).method).toBe("PATCH");
    const sentBody = JSON.parse((init as RequestInit & { body: string }).body);
    expect(sentBody.create).toMatchObject({
      source_doc_type: "PURCHASE_INVOICE_LINE",
      source_doc_id: "inv-1",
      amount: 5,
    });
    expect(sentBody.supersede).toBeNull();
  });
});
