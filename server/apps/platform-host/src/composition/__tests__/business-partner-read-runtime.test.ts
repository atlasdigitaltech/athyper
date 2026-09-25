import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import type { BusinessPartner360Service } from "@athyper/server-contract-master-data";
import type { RecordQueryService } from "@athyper/server-contract-records";
import type { EntityScopeAdapter } from "@athyper/server-service-records";
import { createEntityAuthorizationRuntimeRegistry } from "@athyper/server-contract-metadata";
import { createBusinessPartnerReadRuntimeRegistrations } from "../business-partner-read-runtime.js";
import { reconcileBusinessPartnerReadContract } from "../business-partner-read-contract.js";

const setup = () => {
  const records = {
    list: vi.fn(async () => ({ data: [] })),
    record: vi.fn(async () => ({ data: { id: "bp" } })),
    applicationDescriptor: vi.fn(async () => ({ surface: "application" })),
  };
  const providers = {
    section: vi.fn(async () => ({ data: { masked: true } })),
  };
  const scopes: EntityScopeAdapter = {
    resolve: vi.fn(async () => ({ state: "invalid" })),
    preflight: vi.fn(async () => "workflow_blocked"),
  };
  return {
    records,
    providers,
    scopes,
    entries: createBusinessPartnerReadRuntimeRegistrations(
      records as never,
      providers as unknown as BusinessPartner360Service,
      scopes,
    ),
  };
};
it("pins provider sections and delegates to the authorized service; provider denials propagate", async () => {
  const { providers, entries } = setup();
  const entry = entries.find((e) => e.operation.key === "bank_read")!;
  const query = {
    context: { planeKey: "neon" },
    businessPartnerId: "bp",
    sectionCode: "identity",
    companyCodeId: "company",
  };
  await Reflect.apply(entry.handler.invoke, null, [query]);
  expect(providers.section).toHaveBeenCalledWith({
    ...query,
    sectionCode: "banking",
  });
  providers.section.mockRejectedValueOnce(Error("DENIED"));
  await expect(
    Reflect.apply(entry.handler.invoke, null, [query]),
  ).rejects.toThrow("DENIED");
});
it("entry resolves the authorized application surface instead of issuing a directory query", async () => {
  const { records, entries } = setup();
  const query = {
    context: { planeKey: "neon" },
    entityCode: "business_partner",
    scopeCoordinate: { operatingOrganizationId: "org" },
  };
  await Reflect.apply(
    entries.find((e) => e.operation.key === "enter")!.handler.invoke,
    null,
    [query],
  );
  expect(records.applicationDescriptor).toHaveBeenCalledWith(
    query.context,
    "business_partner",
    query.scopeCoordinate,
  );
  expect(records.list).not.toHaveBeenCalled();
});
it("keeps company data context and provider denials when permission ownership is organization-scoped", async () => {
  const { entries, providers } = setup();
  const query = {
    context: { planeKey: "neon" },
    businessPartnerId: "bp",
    operatingOrganizationId: "org",
    companyCodeId: "company",
  };
  const entry = entries.find(
    (e) => e.operation.key === "supplier_company_read",
  )!;
  expect(entry.operation.scope).toBe("organization.record.v1");
  await Reflect.apply(entry.handler.invoke, null, [query]);
  expect(providers.section).toHaveBeenCalledWith({
    ...query,
    sectionCode: "supplier-company",
  });
  providers.section.mockRejectedValueOnce(Error("BP_360_SCOPE_REQUIRED"));
  await expect(
    Reflect.apply(entry.handler.invoke, null, [
      { ...query, companyCodeId: undefined },
    ]),
  ).rejects.toThrow("BP_360_SCOPE_REQUIRED");
});
it("rejects cross-entity reads and pins stored ownership semantics against supplied targets", async () => {
  const { records, scopes, entries } = setup();
  const entry = entries.find((e) => e.operation.key === "read")!;
  expect(() =>
    Reflect.apply(entry.handler.invoke, null, [
      { context: { planeKey: "neon" }, entityCode: "entity_case" },
    ]),
  ).toThrow("MISMATCH");
  expect(records.record).not.toHaveBeenCalled();
  const input = {
    entityCode: "business_partner",
    operationKey: "read",
    target: "proposed",
    resolver: "organization.record.v1",
    recordId: "bp",
  };
  expect(await Reflect.apply(entry.resolver.resolve, null, [input])).toEqual({
    state: "invalid",
  });
  expect(scopes.resolve).toHaveBeenCalledWith({
    ...input,
    target: "existing",
    resolver: "tenant.record.v1",
  });
});
it("qualifies all 21 accepted read semantics, rejects drift and does not invent mutation registrations", () => {
  const { entries } = setup();
  const selected = JSON.parse(
    readFileSync(
      new URL(
        "../../../../../../governance/policy/reports/business-partner-corrected-release.dev.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ).descriptor.authorization;
  const profile = { ...selected, operations: entries.map((e) => e.operation) };
  const runtime = {
    schemaVersion: 1,
    runtimeVersion: "entity-authorization.v1",
    bindings: entries.map((e) => ({
      operation: e.operation.key,
      handler: e.handler.key,
      resolver: e.resolver.key,
    })),
  };
  expect(entries).toHaveLength(21);
  const registry = createEntityAuthorizationRuntimeRegistry(entries);
  expect(() => registry.qualify(profile, runtime)).not.toThrow();
  const changed = structuredClone(profile);
  changed.operations.find(
    (o: { key: string }) => o.key === "credit_read",
  ).requiresParentRead = false;
  expect(() => registry.qualify(changed, runtime)).toThrow();
  expect(
    entries.every(
      (e) => e.operation.effect === "read" && !e.operation.requiresPreflight,
    ),
  ).toBe(true);
  const historical = {
    ...selected,
    operations: selected.operations.filter((o: { key: string }) =>
      entries.some((e) => e.operation.key === o.key),
    ),
  };
  expect(() => registry.qualify(historical, runtime)).toThrow();
});

it("matches cleaned metadata permissions and preserves company context only for company data", () => {
  const { entries } = setup();
  for (const [key, section] of [
    ["bank_read", "banking"],
    ["network_read", "network"],
    ["supplier_company_read", "supplier-company"],
    ["customer_company_read", "customer-company"],
    ["credit_read", "credit"],
  ]) {
    const metadata = JSON.parse(
      readFileSync(
        new URL(
          `../../../../../../metadata/products/mdg/entities/business_partner/presentation.section.${section}.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(
      entries.find((e) => e.operation.key === key)!.operation.permissionCode,
    ).toBe(metadata.authorization.viewPermission);
  }
  expect(
    entries.find((e) => e.operation.key === "network_read")!.operation.scope,
  ).toBe("tenant.record.v1");
  for (const key of [
    "credit_read",
    "supplier_company_read",
    "customer_company_read",
    "requests_read",
    "activity_read",
  ])
    expect(entries.find((e) => e.operation.key === key)!.operation.scope).toBe(
      "organization.record.v1",
    );
});

it("reconciles a copy, preserves non-read operations, is idempotent and refuses semantic drift", () => {
  const original = JSON.parse(
    readFileSync(
      new URL(
        "../../../../../../governance/policy/reports/business-partner-corrected-release.dev.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ).descriptor;
  original.authorizationRuntime = {
    schemaVersion: 1,
    runtimeVersion: "entity-authorization.v1",
    bindings: original.authorization.operations.map((o: any) => ({
      operation: o.key,
      handler: `business_partner.${o.key}.v1`,
      resolver: o.scope,
      ...(o.requiresPreflight ? { preflight: "test.preflight.v1" } : {}),
    })),
  };
  const before = structuredClone(original);
  const result = reconcileBusinessPartnerReadContract(original);
  expect(original).toEqual(before);
  expect(result.changes.length).toBeGreaterThan(0);
  expect(
    reconcileBusinessPartnerReadContract(result.descriptor).changes,
  ).toEqual([]);
  expect(result.descriptor.operations.case_decide).toEqual(
    original.operations.case_decide,
  );
  const drift = structuredClone(result.descriptor);
  drift.authorization.operations.find(
    (o: any) => o.key === "bank_read",
  ).requiresParentRead = false;
  expect(() => reconcileBusinessPartnerReadContract(drift)).toThrow(
    "SEMANTIC_DRIFT",
  );
  const handler = structuredClone(result.descriptor);
  handler.authorizationRuntime.bindings.find(
    (b: any) => b.operation === "bank_read",
  ).handler = "untrusted.v1";
  expect(() => reconcileBusinessPartnerReadContract(handler)).toThrow(
    "BINDING_DRIFT",
  );
});
