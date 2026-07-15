import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handler: vi.fn(async () => new Response("ok")),
}));

vi.mock("@/lib/server/make-module-relay", () => ({
  makeModuleRelay: () => ({
    GET: mocks.handler,
    POST: mocks.handler,
    PUT: mocks.handler,
    PATCH: mocks.handler,
    DELETE: mocks.handler,
  }),
}));

import { NextRequest } from "next/server";
import { GET } from "../route";

afterEach(() => vi.restoreAllMocks());

describe("legacy records relay", () => {
  it("emits migration telemetry without retaining a referer query string", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await GET(
      new NextRequest("http://localhost/api/records/purchase_order/record-1", {
        headers: { Referer: "https://neon.example/finance/orders?secret=do-not-log" },
      }),
      { params: Promise.resolve({ path: ["purchase_order", "record-1"] }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.handler).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith("[legacy-runtime/records]", expect.objectContaining({
      event: "legacy_records_call",
      callerRoute: "/finance/orders",
      entity: "purchase_order",
      migrationBlocker: "product-deprecated/runtime-ui retirement",
    }));
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret=do-not-log");
  });
});
