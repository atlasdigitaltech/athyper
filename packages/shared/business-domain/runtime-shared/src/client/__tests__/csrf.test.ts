// packages/shared/runtime-domain/runtime-shared/src/client/__tests__/csrf.test.ts
//
// Regression tests for the plane-aware CSRF reader.
//
// Each plane writes its csrf cookie under a different name (per
// PLANE_CONFIGS.<plane>.csrfCookieName):
//
//   neon  â†’ __csrf
//   mesh  â†’ __mesh_csrf
//   admin â†’ __admin_csrf
//
// The set-once registration via setBffClientPlane() makes getCsrfToken() pick
// up the right cookie. Before this refactor the cookie name was hardcoded to
// __csrf so mesh and admin silently read nothing.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { csrfFetch, getCsrfToken, setBffClientPlane } from "../csrf";

// â”€â”€â”€ Fake document.cookie â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let mockCookie = "";

beforeEach(() => {
  vi.stubGlobal("document", { cookie: "" });
  // Pipe through a getter so tests can mutate `mockCookie` between assertions.
  Object.defineProperty(globalThis.document, "cookie", {
    get: () => mockCookie,
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  mockCookie = "";
});

// â”€â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("getCsrfToken â€” plane-aware cookie reader", () => {
  it("neon plane reads __csrf", () => {
    setBffClientPlane("neon");
    mockCookie = "__csrf=neon-token-xyz; other=foo";
    expect(getCsrfToken()).toBe("neon-token-xyz");
  });

  it("prefers the production __Host- cookie when both names are present", () => {
    setBffClientPlane("neon");
    mockCookie = "__csrf=local-token; __Host-__csrf=production-token";
    expect(getCsrfToken()).toBe("production-token");
  });

  it("mesh plane reads __mesh_csrf (and ignores __csrf)", () => {
    setBffClientPlane("mesh");
    mockCookie = "__csrf=should-not-read; __mesh_csrf=mesh-token-abc";
    expect(getCsrfToken()).toBe("mesh-token-abc");
  });

  it("admin plane reads __admin_csrf (and ignores __csrf)", () => {
    setBffClientPlane("admin");
    mockCookie = "__csrf=should-not-read; __admin_csrf=admin-token-123";
    expect(getCsrfToken()).toBe("admin-token-123");
  });

  it("returns empty when the configured cookie is absent", () => {
    setBffClientPlane("mesh");
    mockCookie = "__csrf=neon-only; other=bar";
    expect(getCsrfToken()).toBe("");
  });

  it("decodes URL-encoded cookie values", () => {
    setBffClientPlane("admin");
    mockCookie = "__admin_csrf=hello%20world%3D";
    expect(getCsrfToken()).toBe("hello world=");
  });

  it("returns empty in SSR (no document)", () => {
    setBffClientPlane("neon");
    vi.unstubAllGlobals(); // wipe document
    expect(getCsrfToken()).toBe("");
  });

  it("calling setBffClientPlane with the same value is idempotent and silent", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setBffClientPlane("neon");
    setBffClientPlane("neon");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("calling setBffClientPlane with a different value warns (HMR-safe accept)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setBffClientPlane("neon");
    mockCookie = "__mesh_csrf=switched-to-mesh";
    setBffClientPlane("mesh");
    expect(warn).toHaveBeenCalled();
    expect(getCsrfToken()).toBe("switched-to-mesh");
    warn.mockRestore();
  });
});

describe("csrfFetch", () => {
  it("adds the plane token to mutations without dropping caller headers", async () => {
    setBffClientPlane("neon");
    mockCookie = "__csrf=batch-token";
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await csrfFetch("/api/runtime/v1/entities/purchase_order/1/edit/field-options/batch", {
      method: "POST",
      credentials: "include",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-document-edit-permission-stamp": "permission-stamp",
      },
      body: "{}",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("x-csrf-token")).toBe("batch-token");
    expect(headers.get("x-document-edit-permission-stamp")).toBe("permission-stamp");
    expect(init.credentials).toBe("include");
    expect(init.signal).toBe(controller.signal);
  });
});
