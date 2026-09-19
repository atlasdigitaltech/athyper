import { describe, expect, it } from "vitest";
import type { EntityAuthorizationRuntimeV2 } from "@athyper/server-contract-metadata";
import { assertCanonicalReadSourceCatalog } from "../canonical-read-catalog.js";
import type { EntityAuthorizationPermission } from "../entity-authorization-compiler.js";
const runtime: EntityAuthorizationRuntimeV2 = {
  schemaVersion: 2,
  runtimeVersion: "entity-authorization.v2",
  bindings: [],
  canonicalReadAdmission: {
    schemaVersion: 1,
    kind: "entity_canonical_read_admission",
    entityCode: "business_partner",
    planeKey: "neon",
    profileHash: "a".repeat(64),
    reviewRevision: "b".repeat(64),
    transitions: [
      {
        operationKey: "comments_read",
        sourcePermissionCode: "collaboration.comment.read",
        targetPermissionCode: "neon.relationship.bp_target.comments_read",
      },
    ],
  },
};
const source: EntityAuthorizationPermission = {
  id: "00000000-0000-4000-8000-000000000001",
  code: "collaboration.comment.read",
  kind: "capability",
  scopeKinds: ["operating_organization"],
};
describe("canonical source catalog dependency", () => {
  it("rejects a target-only catalog before publication", () => {
    expect(() =>
      assertCanonicalReadSourceCatalog(runtime, [
        { ...source, code: "neon.relationship.bp_target.comments_read" },
      ]),
    ).toThrow("Canonical read source catalog unresolved");
  });
  it("requires an unambiguous, identified source definition", () => {
    for (const catalog of [
      [source, source],
      [{ ...source, id: "invalid" }],
      [{ ...source, scopeKinds: [] }],
    ])
      expect(() =>
        assertCanonicalReadSourceCatalog(runtime, catalog),
      ).toThrow();
  });
  it("does not widen organization source scopes into target tenant grants", () => {
    const before = JSON.stringify(source);
    assertCanonicalReadSourceCatalog(runtime, [source]);
    expect(JSON.stringify(source)).toBe(before);
  });
  it("keeps existing v1 releases independent of canonical admission", () => {
    expect(() =>
      assertCanonicalReadSourceCatalog(
        {
          schemaVersion: 1,
          runtimeVersion: "entity-authorization.v1",
          bindings: [],
        },
        [],
      ),
    ).not.toThrow();
  });
});
