import { describe, expect, it } from "vitest";

import { resolveVerifiedRequestContext } from "../route-helpers.js";

const TENANT_ID = "019f6778-e401-7ecb-8c9a-a712cd3279d9";
const PRINCIPAL_ID = "f40691f6-e153-4179-92f2-017842486333";

describe("resolveVerifiedRequestContext", () => {
  it("hydrates the tenant code when the host supplies only the trusted tenant UUID", async () => {
    const result = await resolveVerifiedRequestContext(fakeDb(), {
      iss: "https://iam.athyper.local/realms/athyper",
      sub: "keycloak-subject",
    }, {
      org: "athyper--le-athq",
      realm: "athyper",
      tenantCode: "athyper",
      trustedTenantId: TENANT_ID,
    });

    expect(result).toMatchObject({
      ok: true,
      context: {
        tenantId: TENANT_ID,
        tenantCode: "athyper",
        principalId: PRINCIPAL_ID,
      },
    });
  });

  it("rejects a trusted host tenant that disagrees with the token tenant UUID", async () => {
    const result = await resolveVerifiedRequestContext(fakeDb(), {
      iss: "https://iam.athyper.local/realms/athyper",
      sub: "keycloak-subject",
      tenant_id: "22222222-2222-4222-8222-222222222222",
    }, {
      org: "athyper",
      realm: "athyper",
      tenantCode: "athyper",
      trustedTenantId: TENANT_ID,
    });

    expect(result).toMatchObject({
      ok: false,
      error: "AUTH_CONTEXT_MISMATCH",
      status: 403,
    });
  });

  it("does not interpret a tenant-admin organization context as a typed work context", async () => {
    const result = await resolveVerifiedRequestContext(fakeDb(), {
      iss: "https://iam.athyper.local/realms/athyper",
      sub: "keycloak-subject",
    }, {
      org: "athyper",
      realm: "athyper",
      tenantCode: "athyper",
      trustedTenantId: TENANT_ID,
      orgContextType: "tenant_admin",
    });

    expect(result).toMatchObject({
      ok: true,
      context: {
        tenantId: TENANT_ID,
        principalId: PRINCIPAL_ID,
      },
    });
  });
});

function fakeDb(): any {
  return {
    selectFrom(table: string) {
      const builder: any = {
        select: () => builder,
        innerJoin: () => builder,
        leftJoin: () => builder,
        where: () => builder,
        executeTakeFirst: async () => table.startsWith("master.tenant")
          ? { id: TENANT_ID, code: "athyper" }
          : { id: PRINCIPAL_ID, auth_epoch: 0, is_service_account: false, status: "active", keycloak_service_client_id: null },
      };
      return builder;
    },
  };
}
