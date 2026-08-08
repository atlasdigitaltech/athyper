import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../../../../..");
const read = (relativePath: string) => readFileSync(resolve(repoRoot, relativePath), "utf8");

describe("Phase 8 typed tenant/work-context cutover", () => {
  it("migrates old remembered contexts and supports controlled legacy-session invalidation", () => {
    const authBff = read("packages/shared/platform-auth/auth-bff/src/index.ts");
    expect(authBff).toContain("session.activeOrg && !session.activeWorkContext");
    expect(authBff).toContain("AUTH_BFF_LEGACY_SESSION_INVALIDATE");
    expect(authBff).toContain("activeWorkContext: toNeonWorkContext(legacyMembership)");
  });

  it("keeps legacy tenant routing and typed work-context headers aligned at the relay boundary", () => {
    const relay = read("packages/platform/foundation/bff-relay/src/index.ts");
    expect(relay).toContain('headers["X-Org"]');
    expect(relay).toContain('headers["X-Tenant-ID"]');
    expect(relay).toContain('headers["X-Work-Context-Type"]');
    expect(relay).toContain('headers["X-Work-Context-ID"]');
    expect(relay).toContain('headers["X-Auth-Epoch"]');
    expect(relay).toContain("contextAlias");
    expect(relay).toContain("toRelayWorkContext");
  });

  it("does not derive tenant identity from organization claims", () => {
    const helpers = read("server/packages/services/shared/route-helpers.ts");
    expect(helpers).not.toContain('claims["organization"]');
    expect(helpers).not.toContain('claims["organization_code"]');
    expect(helpers).toContain('hints.workContextType');
    expect(helpers).toContain('master.operating_organization');
  });

  it("preserves operating-organization metadata when contexts are materialized", () => {
    const resolver = read("server/packages/platform/iam/context/context-resolver.service.ts");
    expect(resolver).toContain("...(input.workContextDomain ? { workContextDomain: input.workContextDomain } : {})");
    expect(resolver).toContain("...(input.scopeVersion !== undefined ? { scopeVersion: input.scopeVersion } : {})");
  });

  it("keeps the neon-web Keycloak client coarse and PKCE-oriented", () => {
    const realm = JSON.parse(read("stack/config/iam/realm-athyper.json")) as {
      clients?: Array<Record<string, unknown>>;
    };
    const client = realm.clients?.find((candidate) => candidate.clientId === "neon-web");
    expect(client).toBeDefined();
    expect(client?.publicClient).toBe(true);
    expect(client?.standardFlowEnabled).toBe(true);
    expect(client?.directAccessGrantsEnabled).toBe(false);
    expect(client?.fullScopeAllowed).toBe(false);
    expect((client?.attributes as Record<string, unknown>)?.["pkce.code.challenge.method"]).toBe("S256");
    expect(JSON.stringify(client?.protocolMappers ?? [])).toContain("athyper-api-runtime");
  });
});
