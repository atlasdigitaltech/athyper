import { describe, expect, it } from "vitest";
import {
  businessPartnerCasePublicationIdentity,
  companySetupCaseInitialSchema,
} from "../business-partner-company-case-contract.js";
import { initialCaseContractSchema } from "../business-partner-case-contract-service.js";

describe("registered company-case publication identity", () => {
  const tenantId = "44444444-4444-4444-8444-444444444444";
  const key = `metadata.entity.master_business_partner_company_setup_request.${tenantId.replaceAll("-", "")}`;
  it("binds all lifecycle operations exclusively to independent company permissions", () => {
    const identity = businessPartnerCasePublicationIdentity(tenantId, key);
    expect(identity.entityCode).toBe(
      "master.business_partner_company_setup_request",
    );
    expect(identity.operationScopeBindings.map((b) => b.operationKey)).toEqual([
      "discover",
      "read",
      "create",
      "update",
      "validate",
      "submit",
      "decide",
      "materialize",
    ]);
    expect(
      identity.operationScopeBindings.every(
        (b) =>
          b.scopeKind === "company_code" &&
          b.permissionCode.startsWith(
            "neon.relationship.bp_company_setup_request.",
          ),
      ),
    ).toBe(true);
    const schema = initialCaseContractSchema({
      tenantId,
      entityId: "company-pilot",
      publicationKey: key,
      contract: companySetupCaseInitialSchema,
    }) as Record<string, unknown>;
    for (const field of schema["required"] as string[])
      expect(schema["properties"]).toHaveProperty(field);
    expect(schema["required"]).toEqual(
      expect.arrayContaining([
        "companyCodeId",
        "operatingOrganizationId",
        "requestedRole",
        "currencyCode",
        "paymentTermId",
        "defaultAccountingProfileId",
      ]),
    );
  });
  it("preserves ordinary BP case identity and rejects another tenant or unregistered key", () => {
    expect(
      businessPartnerCasePublicationIdentity(
        tenantId,
        key.replace(
          "master_business_partner_company_setup_request",
          "master_business_partner",
        ),
      ),
    ).toEqual({
      entityCode: "master.business_partner",
      operationScopeBindings: [],
    });
    expect(() =>
      businessPartnerCasePublicationIdentity(
        "55555555-5555-4555-8555-555555555555",
        key,
      ),
    ).toThrow("UNREGISTERED");
    expect(() =>
      businessPartnerCasePublicationIdentity(
        tenantId,
        key.replace("master_business_partner_company_setup_request", "other"),
      ),
    ).toThrow("UNREGISTERED");
  });
});

import {
  compileCompanyCaseOperationBindings,
  assertCompanyCaseOperationBindings,
} from "../business-partner-company-case-contract.js";
import { randomUUID } from "node:crypto";
describe("company case signed operation provenance", () => {
  function fixture() {
    const operations = [
      "discover",
      "read",
      "create",
      "update",
      "validate",
      "submit",
      "decide",
      "materialize",
    ].map((operationKey) => ({
      id: randomUUID(),
      operationKey,
      handlerKey: `business_partner_company_setup_request.${operationKey}.v1`,
    }));
    const permissionCode = (op: string) =>
      `neon.relationship.bp_company_setup_request.${op === "discover" ? "read" : op}`;
    const graph = {
      entity: { entityCode: "business_partner_company_setup_request" },
      operations,
      operationPermissions: operations.map((o) => ({
        id: randomUUID(),
        entityOperationId: o.id,
        targetPlane: "neon",
        permissionCode: permissionCode(o.operationKey),
        permissionKind: "entity_operation",
      })),
      operationScopeBindings: operations.map((o) => ({
        id: randomUUID(),
        entityOperationId: o.id,
        targetPlane: "neon",
        scopeKind: "company_code",
        coordinateSource: "relation_resolver",
        resolverKey: "company.record.v1",
        decisionMode:
          o.operationKey === "discover" ? "collection" : "entity_resource",
        missingValueBehavior: "deny",
      })),
    };
    const source = {
      entityId: randomUUID(),
      releaseHash: "a".repeat(64),
      graph,
    };
    const catalog = operations
      .filter((o) => o.operationKey !== "discover")
      .map((o) => ({
        id: randomUUID(),
        code: permissionCode(o.operationKey),
        kind: "entity_operation",
        scopeKinds: ["company_code"],
      }));
    return { source, catalog };
  }
  it("preserves reviewed operation/link/scope identities and resolves exact catalog IDs", () => {
    const { source, catalog } = fixture();
    const result = compileCompanyCaseOperationBindings(source, catalog);
    expect(result.operation_scope_bindings).toHaveLength(8);
    expect(result.operation_scope_bindings[0]).toMatchObject({
      sourceEntityOperationId: source.graph.operations[0]!.id,
      bindingId: source.graph.operationPermissions[0]!.id,
      scopeBindingId: source.graph.operationScopeBindings[0]!.id,
      permissionId: catalog[0]!.id,
    });
    expect(() =>
      assertCompanyCaseOperationBindings(result, source.entityId),
    ).not.toThrow();
  });
  it("rejects missing catalog, wrong company resolver, and missing/foreign source provenance", () => {
    const { source, catalog } = fixture();
    expect(() => compileCompanyCaseOperationBindings(source, [])).toThrow(
      "UNRESOLVED",
    );
    const result = compileCompanyCaseOperationBindings(source, catalog);
    expect(() =>
      assertCompanyCaseOperationBindings(
        { ...result, source: undefined },
        source.entityId,
      ),
    ).toThrow("SOURCE_INVALID");
    expect(() =>
      assertCompanyCaseOperationBindings(result, randomUUID()),
    ).toThrow("SOURCE_INVALID");
    source.graph.operationScopeBindings[0]!.resolverKey =
      "organization.record.v1";
    expect(() => compileCompanyCaseOperationBindings(source, catalog)).toThrow(
      "BINDING_INVALID",
    );
  });
});

import { nextCompanyInitialReleaseNo } from "../business-partner-case-contract-service.js";
it("only retries terminal failed never-activated initial deliveries at a new release number", () => {
  expect(nextCompanyInitialReleaseNo([])).toBe(1);
  expect(
    nextCompanyInitialReleaseNo([{ releaseNo: 1, failedUnapplied: true }]),
  ).toBe(2);
  expect(() =>
    nextCompanyInitialReleaseNo([{ releaseNo: 1, failedUnapplied: false }]),
  ).toThrow("PENDING_RELEASE_CONFLICT");
  expect(() =>
    nextCompanyInitialReleaseNo([
      { releaseNo: 1, failedUnapplied: true },
      { releaseNo: 2, failedUnapplied: false },
    ]),
  ).toThrow("PENDING_RELEASE_CONFLICT");
});
