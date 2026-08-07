import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../../../../..");
const read = (relativePath: string) => readFileSync(resolve(repoRoot, relativePath), "utf8");

describe("Phase 0 tenant and work-context contracts", () => {
  it("keeps tenant identity binding and context ownership tenant-safe", () => {
    const resolver = read("server/packages/services/iam/context/context-resolver.service.ts");
    const identity = read("server/packages/services/shared/route-helpers.ts");

    expect(identity).toContain('"pab.tenant_id"');
    expect(identity).toContain('"pab.realm_key"');
    expect(resolver).toContain('gr.assignment_scope_type = \'operating_organization\'');
    expect(resolver).toContain('oo.tenant_id = gr.tenant_id');
  });

  it("discovers legal entity and typed procurement/sales contexts", () => {
    const resolver = read("server/packages/services/iam/context/context-resolver.service.ts");
    const bff = read("packages/shared/platform-auth/auth-bff/src/index.ts");

    expect(resolver).toContain('contextType: "legal_entity"');
    expect(resolver).toContain('contextType: "operating_organization"');
    expect(resolver).toContain('workContextDomain');
    expect(bff).toContain("createSessionContextsGetHandler");
    expect(bff).toContain("procurementOrganizations");
    expect(bff).toContain("salesOrganizations");
  });

  it("fails closed for domain mismatch and stale context versions", () => {
    const bff = read("packages/shared/platform-auth/auth-bff/src/index.ts");
    const relay = read("packages/platform/foundation/bff-relay/src/index.ts");

    expect(bff).toContain("runtimeHeadersMatchSession");
    expect(bff).toContain("activeWorkContext");
    expect(relay).toContain('X-Work-Context-Domain');
    expect(relay).toContain('X-Scope-Version');
    expect(relay).toContain('X-Auth-Epoch');
  });

  it("implements scoped deny subtraction and member-company propagation", () => {
    const permission = read("server/packages/services/iam/permission/permission.service.ts");
    const authorizationScope = read("server/db/ddl/planes/neon/authz/07_functions.sql");
    const policy = read("server/db/ddl/planes/neon/authz/12_compiled_permission_reference_seed.sql");

    expect(permission).toContain("grant_denies");
    expect(permission).toContain("ag.effect = 'deny'");
    expect(authorizationScope).toContain("operating_organization");
    expect(authorizationScope).toContain("resolve_operating_organization_companies");
    expect(policy).toContain("member_companies");
  });

  it("keeps activeOrg compatibility while carrying the legacy tenant route contract", () => {
    const bff = read("packages/shared/platform-auth/auth-bff/src/index.ts");
    const relay = read("packages/platform/foundation/bff-relay/src/index.ts");

    expect(bff).toContain("activeOrg");
    expect(bff).toContain("activeWorkContext");
    expect(relay).toContain("activeWorkContext");
    expect(relay).toContain('headers["X-Org"]');
    expect(relay).toContain('X-Work-Context-ID');
  });

  it("contains the RLS and tenant-safe FK contract for domain ownership", () => {
    const ddl = read("server/db/ddl/planes/neon/master/03_tables.sql");
    const rls = read("server/db/ddl/planes/neon/document/10_rls.sql");

    expect(ddl).toContain("FOREIGN KEY (tenant_id, operating_organization_id)");
    expect(ddl).toContain("FOREIGN KEY (tenant_id, company_code_id)");
    expect(rls).toContain("FORCE ROW LEVEL SECURITY");
    expect(rls).toContain("shared.current_tenant_id_soft()");
    expect(rls).toContain("WITH CHECK (tenant_id = shared.current_tenant_id())");
  });
});

describe.skipIf(!process.env.DATABASE_URL)("Phase 0 live database RLS isolation", () => {
  it("requires an explicit tenant context for ownership reads", async () => {
    const { default: postgres } = await import("postgres");
    const sql = postgres(process.env.DATABASE_URL!);
    try {
      await sql`select set_config('app.current_tenant_id', '00000000-0000-0000-0000-000000000000', true)`;
      const rows = await sql`
        select tenant_id
        from document.operating_organization_resource_owner
        where tenant_id <> '00000000-0000-0000-0000-000000000000'::uuid
      `;
      expect(rows).toHaveLength(0);
    } finally {
      await sql.end();
    }
  });
});
