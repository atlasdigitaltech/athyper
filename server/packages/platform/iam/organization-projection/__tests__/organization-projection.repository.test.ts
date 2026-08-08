import { describe, expect, it } from "vitest";

import {
  normalizeProjectionRows,
  projectionAllowsExactScope,
  type ProjectionRow,
} from "../organization-projection.repository.js";

const PROJECTION_ID = "11111111-1111-4111-8111-111111111111";
const TENANT_ID = "22222222-2222-4222-8222-222222222222";
const SCOPE_ID = "33333333-3333-4333-8333-333333333333";

function row(overrides: Partial<ProjectionRow> = {}): ProjectionRow {
  return {
    projection_id: PROJECTION_ID,
    tenant_id: TENANT_ID,
    realm_key: "athyper",
    external_organization_id: "kc-org-athyper",
    organization_alias: "athyper",
    organization_name: "Athyper",
    source_version: 3,
    source_hash: "a".repeat(64),
    effective_from: "2026-01-01T00:00:00.000Z",
    effective_until: null,
    scope_ceilings: [{
      scope_target_id: SCOPE_ID,
      ceiling_mode: "exact",
      network_role_ceiling: "buyer",
    }],
    ...overrides,
  };
}

describe("organization projection normalization", () => {
  it("retains immutable organization and source evidence", () => {
    const projection = normalizeProjectionRows([row()])[0]!;
    expect(projection).toMatchObject({
      projectionId: PROJECTION_ID,
      tenantId: TENANT_ID,
      externalOrganizationId: "kc-org-athyper",
      sourceVersion: 3,
      sourceHash: "a".repeat(64),
    });
    expect(projectionAllowsExactScope(projection, SCOPE_ID, "buyer")).toBe(true);
    expect(projectionAllowsExactScope(projection, SCOPE_ID, "supplier")).toBe(false);
  });

  it("fails closed for an ambiguous realm and organization coordinate", () => {
    expect(() => normalizeProjectionRows([
      row(),
      row({ projection_id: "44444444-4444-4444-8444-444444444444" }),
    ])).toThrow("IAM_PROJECTION_AMBIGUOUS");
  });

  it("fails closed for missing or unsupported scope ceilings", () => {
    expect(() => normalizeProjectionRows([row({ scope_ceilings: [] })]))
      .toThrow("IAM_PROJECTION_SCOPE_MISSING");
    expect(() => normalizeProjectionRows([row({
      scope_ceilings: [{
        scope_target_id: SCOPE_ID,
        ceiling_mode: "member_companies",
        network_role_ceiling: null,
      }],
    })])[0]).not.toThrow();
    expect(projectionAllowsExactScope(
      normalizeProjectionRows([row({
        scope_ceilings: [{
          scope_target_id: SCOPE_ID,
          ceiling_mode: "member_companies",
          network_role_ceiling: null,
        }],
      })])[0]!,
      SCOPE_ID,
    )).toBe(false);
  });
});
