import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/session", () => ({
  getNeonServerSession: vi.fn(async () => ({
    userId: "user-1",
    activeOrg: "org-1",
    accessToken: "token-1",
    realmKey: "athyper",
    planeKey: "neon",
    organizations: { "org-1": { tenantId: "tenant-1", tenantCode: "athyper", roles: ["user"] } },
  })),
}));

import { GET } from "../route";
import { getNeonServerSession } from "@/lib/server/session";

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => vi.unstubAllGlobals());

describe("/api/relay/[...path] context mismatch handling", () => {
  it("preserves AUTH_CONTEXT_MISMATCH for the notification stream", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      error: "AUTH_CONTEXT_MISMATCH",
      message: "The requested organization does not match the verified tenant.",
    }), { status: 403, headers: { "content-type": "application/json" } }));
    const response = await GET(new NextRequest("http://localhost/api/relay/platform/notifications/stream"), {
      params: Promise.resolve({ path: ["platform", "notifications", "stream"] }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "AUTH_CONTEXT_MISMATCH" });
    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("X-Org")).toBe("org-1");
    expect(headers.get("X-Tenant-ID")).toBe("tenant-1");
    expect(headers.get("X-Tenant-Code")).toBe("athyper");
  });

  it("forwards the selected typed work context together with the legacy tenant alias", async () => {
    vi.mocked(getNeonServerSession).mockResolvedValueOnce({
      userId: "user-1",
      activeOrg: "athyper--oo--procurement--buying",
      accessToken: "token-1",
      realmKey: "athyper",
      planeKey: "neon",
      authEpoch: 12,
      activeWorkContext: {
        type: "operating_organization",
        id: "oo-1",
        code: "buying",
        name: "Buying",
        tenantId: "tenant-1",
        domain: "procurement",
        scopeVersion: 4,
      },
      organizations: {
        "athyper--oo--procurement--buying": {
          id: "oo-1",
          name: "Buying",
          alias: "athyper--oo--procurement--buying",
          tenantId: "tenant-1",
          tenantCode: "athyper",
          contextType: "operating_organization",
          organizationId: "oo-1",
          roles: ["user"],
          workContextDomain: "procurement",
          scopeVersion: 4,
          authEpoch: 12,
        },
      },
    } as never);
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response("{}", { status: 403 }));

    await GET(new NextRequest("http://localhost/api/relay/platform/notifications/stream"), {
      params: Promise.resolve({ path: ["platform", "notifications", "stream"] }),
    });

    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("X-Org")).toBe("athyper--oo--procurement--buying");
    expect(headers.get("X-Tenant-ID")).toBe("tenant-1");
    expect(headers.get("X-Work-Context-Type")).toBe("operating_organization");
    expect(headers.get("X-Work-Context-ID")).toBe("oo-1");
    expect(headers.get("X-Work-Context-Domain")).toBe("procurement");
    expect(headers.get("X-Scope-Version")).toBe("4");
    expect(headers.get("X-Auth-Epoch")).toBe("12");
  });

  it("uses the typed context membership when activeOrg is stale", async () => {
    vi.mocked(getNeonServerSession).mockResolvedValueOnce({
      userId: "user-1",
      activeOrg: "athyper--le-old",
      accessToken: "token-1",
      realmKey: "athyper",
      planeKey: "neon",
      activeWorkContext: {
        type: "operating_organization",
        id: "oo-1",
        code: "buying",
        name: "Buying",
        tenantId: "tenant-1",
        domain: "procurement",
      },
      organizations: {
        "athyper--le-old": {
          id: "le-old",
          name: "Old",
          alias: "athyper--le-old",
          tenantId: "tenant-1",
          tenantCode: "athyper",
          contextType: "legal_entity",
          legalEntityId: "le-old",
          roles: ["user"],
        },
        "athyper--oo--procurement--buying": {
          id: "oo-1",
          name: "Buying",
          alias: "athyper--oo--procurement--buying",
          tenantId: "tenant-1",
          tenantCode: "athyper",
          contextType: "operating_organization",
          organizationId: "oo-1",
          roles: ["user"],
          workContextDomain: "procurement",
        },
      },
    } as never);
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response("{}", { status: 200 }));

    await GET(new NextRequest("http://localhost/api/relay/platform/notifications/preferences"), {
      params: Promise.resolve({ path: ["platform", "notifications", "preferences"] }),
    });

    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("X-Org")).toBe("athyper--oo--procurement--buying");
    expect(headers.get("X-Work-Context-ID")).toBe("oo-1");
  });
});


