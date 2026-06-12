// server/packages/services/shared/__tests__/resolve-principal-realm.test.ts
//
// Regression tests for the realmKey-mandatory refactor.
//
// principal_identity_binding rows are keyed by (subject_id, realm_key, tenant_id).
// The same KC subject can be bound to two different principals across realms
// (e.g. the `athyper` tenant realm vs the `platform-control` support realm).
// resolvePrincipalIdOrNull MUST scope every lookup by realm; without it, a
// support-realm session could collide with a tenant-realm principal and vice
// versa.
//
// These tests pin the contract:
//   1. Same sub, different realms → different principal_id.
//   2. Missing realmKey fails closed (returns null), never falling back
//      to "athyper" or anything else.

import { describe, expect, it } from "vitest";
import { resolvePrincipalIdOrNull } from "../route-helpers.js";

// ─── Fake Kysely ──────────────────────────────────────────────────────────────
//
// The helper builds one fluent chain: selectFrom → select → where × 3 → executeTakeFirst.
// We capture the (column, op, value) tuples and look them up in a seed of
// (subject_id, realm_key, tenant_id) → principal_id rows.

interface Binding {
  subject_id: string;
  realm_key:  string;
  tenant_id:  string;
  principal_id: string;
}

function makeFakeDb(bindings: Binding[]): {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  capturedWheres: Array<{ column: string; op: string; value: unknown }>;
} {
  const capturedWheres: Array<{ column: string; op: string; value: unknown }> = [];

  function makeQuery() {
    const filters: Record<string, unknown> = {};
    const chain = {
      select() { return chain; },
      where(column: string, op: string, value: unknown) {
        capturedWheres.push({ column, op, value });
        filters[column] = value;
        return chain;
      },
      executeTakeFirst() {
        const row = bindings.find((b) =>
          b.subject_id === filters["pab.subject_id"] &&
          b.realm_key  === filters["pab.realm_key"] &&
          b.tenant_id  === filters["pab.tenant_id"]
        );
        return Promise.resolve(row ? { principal_id: row.principal_id } : undefined);
      },
    };
    return chain;
  }

  const db = {
    selectFrom(_table: string) { return makeQuery(); },
  };

  return { db, capturedWheres };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("resolvePrincipalIdOrNull — realm scoping", () => {
  const TENANT = "00000000-0000-0000-0000-000000000aaa";
  const SUB    = "kc-subject-uuid";
  const TENANT_PRINCIPAL  = "00000000-0000-0000-0000-000000001111";
  const SUPPORT_PRINCIPAL = "00000000-0000-0000-0000-000000002222";

  const seed: Binding[] = [
    { subject_id: SUB, realm_key: "athyper",          tenant_id: TENANT, principal_id: TENANT_PRINCIPAL  },
    { subject_id: SUB, realm_key: "platform-control", tenant_id: TENANT, principal_id: SUPPORT_PRINCIPAL },
  ];

  it("same sub, different realm → different principal_id", async () => {
    const { db } = makeFakeDb(seed);

    const tenantHit  = await resolvePrincipalIdOrNull(db, SUB, TENANT, "athyper");
    const supportHit = await resolvePrincipalIdOrNull(db, SUB, TENANT, "platform-control");

    expect(tenantHit).toBe(TENANT_PRINCIPAL);
    expect(supportHit).toBe(SUPPORT_PRINCIPAL);
    expect(tenantHit).not.toBe(supportHit);
  });

  it("unbound realm returns null (does not fall back to another realm's principal)", async () => {
    const { db } = makeFakeDb(seed);

    const noMatch = await resolvePrincipalIdOrNull(db, SUB, TENANT, "mesh-collab");

    expect(noMatch).toBeNull();
  });

  it("empty realmKey fails closed — returns null, never the legacy 'athyper' hit", async () => {
    const { db, capturedWheres } = makeFakeDb(seed);

    const result = await resolvePrincipalIdOrNull(db, SUB, TENANT, "");

    expect(result).toBeNull();
    // The early-return path skips the DB entirely — no WHERE clauses captured.
    expect(capturedWheres).toHaveLength(0);
  });

  it("realm filter is included in the WHERE clause (drift guard)", async () => {
    const { db, capturedWheres } = makeFakeDb(seed);

    await resolvePrincipalIdOrNull(db, SUB, TENANT, "platform-control");

    const realmFilter = capturedWheres.find((w) => w.column === "pab.realm_key");
    expect(realmFilter).toBeDefined();
    expect(realmFilter?.op).toBe("=");
    expect(realmFilter?.value).toBe("platform-control");
  });

  it("empty sub returns null without consulting the DB", async () => {
    const { db, capturedWheres } = makeFakeDb(seed);

    const result = await resolvePrincipalIdOrNull(db, "", TENANT, "athyper");

    expect(result).toBeNull();
    expect(capturedWheres).toHaveLength(0);
  });
});
