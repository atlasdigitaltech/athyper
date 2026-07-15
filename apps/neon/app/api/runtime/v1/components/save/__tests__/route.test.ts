// BFF route tests - POST /api/runtime/v1/components/save
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

describe("POST /api/runtime/v1/components/save", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNeonServerSession).mockResolvedValue(SESSION as never);
    fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, created: { id: "pc-2" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  it("returns 401 when no session", async () => {
    vi.mocked(getNeonServerSession).mockResolvedValueOnce(null as never);
    const res = await POST(makeRequest({ source_doc_type: "PURCHASE_INVOICE_LINE", create: {} }));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 when body is not an object", async () => {
    const req = new Request("http://localhost", { method: "POST", body: "not json", headers: { "Content-Type": "application/json" } });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when source_doc_type is missing", async () => {
    const res = await POST(makeRequest({ create: { source_doc_id: "inv-1" } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_REQUEST");
  });

  it("returns 400 when source_doc_type is not on the writer allow-list", async () => {
    const res = await POST(makeRequest({ source_doc_type: "UNKNOWN", create: { source_doc_id: "inv-1" } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("SOURCE_DOC_TYPE_NOT_SUPPORTED_BY_WRITER");
  });

  it("returns 400 when create.source_doc_id is missing", async () => {
    const res = await POST(makeRequest({ source_doc_type: "PURCHASE_INVOICE_LINE", create: {} }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_REQUEST");
  });

  it("forwards to the AP pricing-components endpoint with source_doc_type injected into create", async () => {
    const res = await POST(
      makeRequest({
        source_doc_type: "PURCHASE_INVOICE_LINE",
        create: { source_doc_id: "inv-1", amount: 10 },
        replace: { id: "pc-1", expectedVersion: "1" },
      }),
    );
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://runtime.test/api/finance/ap/invoices/inv-1/pricing-components");
    expect((init as RequestInit).method).toBe("POST");

    const sentBody = JSON.parse((init as RequestInit & { body: string }).body);
    expect(sentBody.create).toMatchObject({ source_doc_type: "PURCHASE_INVOICE_LINE", source_doc_id: "inv-1", amount: 10 });
    expect(sentBody.supersede).toMatchObject({ id: "pc-1", expectedVersion: "1" });
  });
});
