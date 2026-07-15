import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BATCH_URL = "https://neon.athyper.local/api/runtime/v1/entities/purchase_order/po-1/edit/field-options/batch";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("ALLOW_DIRECT_ACCESS", "true");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function runProxy(headers: Record<string, string> = {}) {
  const { proxy } = await import("@/proxy");
  return proxy(new NextRequest(BATCH_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      host: "neon.athyper.local",
      ...headers,
    },
  }));
}

describe("Neon proxy CSRF enforcement for field-option batches", () => {
  it("rejects a missing CSRF header", async () => {
    const response = await runProxy({ cookie: "__csrf=batch-token" });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "CSRF_VALIDATION_FAILED", plane: "neon" });
  });

  it("rejects a mismatched cookie and header", async () => {
    const response = await runProxy({
      cookie: "__csrf=cookie-token",
      "x-csrf-token": "header-token",
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "CSRF_VALIDATION_FAILED" });
  });

  it.each(["__csrf", "__Host-__csrf"])("accepts a matching %s cookie and forwards to the batch handler", async (cookieName) => {
    const response = await runProxy({
      cookie: `${cookieName}=batch-token`,
      "x-csrf-token": "batch-token",
      "x-document-edit-permission-stamp": "permission-stamp",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
