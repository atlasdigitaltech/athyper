import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import type { BusinessPartner360Service } from "@athyper/server-contract-master-data";
import type { RecordQueryService } from "@athyper/server-contract-records";
import type { EntityScopeAdapter } from "@athyper/server-service-records";
import { createEntityAuthorizationRuntimeRegistry } from "@athyper/server-contract-metadata";
import { createBusinessPartnerReadRuntimeRegistrations } from "../business-partner-read-runtime.js";

const setup = () => {
  const records = {list: vi.fn(async () => ({data: []})), record: vi.fn(async () => ({data: {id: "bp"}})), applicationDescriptor: vi.fn(async () => ({surface: "application"}))};
  const providers = {section: vi.fn(async () => ({data: {masked: true}}))};
  const scopes: EntityScopeAdapter = {resolve: vi.fn(async () => ({state: "invalid"})), preflight: vi.fn(async () => "workflow_blocked")};
  return {records, providers, scopes, entries: createBusinessPartnerReadRuntimeRegistrations(records as never, providers as unknown as BusinessPartner360Service, scopes)};
};
it("pins provider sections and delegates to the authorized service; provider denials propagate", async () => {
  const {providers, entries} = setup();
  const entry = entries.find(e => e.operation.key === "bank_read")!;
  const query = {context: {planeKey: "neon"}, businessPartnerId: "bp", sectionCode: "identity", companyCodeId: "company"};
  await Reflect.apply(entry.handler.invoke, null, [query]);
  expect(providers.section).toHaveBeenCalledWith({...query, sectionCode: "banking"});
  providers.section.mockRejectedValueOnce(Error("DENIED"));
  await expect(Reflect.apply(entry.handler.invoke, null, [query])).rejects.toThrow("DENIED");
});
it("entry resolves the authorized application surface instead of issuing a directory query", async () => {
  const {records, entries} = setup();
  const query = {context: {planeKey: "neon"}, entityCode: "business_partner", scopeCoordinate: {operatingOrganizationId: "org"}};
  await Reflect.apply(entries.find(e => e.operation.key === "enter")!.handler.invoke, null, [query]);
  expect(records.applicationDescriptor).toHaveBeenCalledWith(query.context, "business_partner", query.scopeCoordinate);
  expect(records.list).not.toHaveBeenCalled();
});
it("rejects cross-entity reads and pins stored ownership semantics against supplied targets", async () => {
  const {records, scopes, entries} = setup();
  const entry = entries.find(e => e.operation.key === "read")!;
  expect(() => Reflect.apply(entry.handler.invoke, null, [{context: {planeKey: "neon"}, entityCode: "entity_case"}])).toThrow("MISMATCH");
  expect(records.record).not.toHaveBeenCalled();
  const input = {entityCode: "business_partner", operationKey: "read", target: "proposed", resolver: "organization.record.v1", recordId: "bp"};
  expect(await Reflect.apply(entry.resolver.resolve, null, [input])).toEqual({state: "invalid"});
  expect(scopes.resolve).toHaveBeenCalledWith({...input, target: "existing", resolver: "tenant.record.v1"});
});
it("qualifies all 21 accepted read semantics, rejects drift and does not invent mutation registrations", () => {
  const {entries} = setup();
  const selected = JSON.parse(readFileSync(new URL("../../../../../../governance/policy/reports/business-partner-corrected-release.dev.json", import.meta.url), "utf8")).descriptor.authorization;
  const profile = {...selected, operations: selected.operations.filter((o: {key: string}) => entries.some(e => e.operation.key === o.key))};
  const runtime = {schemaVersion: 1, runtimeVersion: "entity-authorization.v1", bindings: entries.map(e => ({operation: e.operation.key, handler: e.handler.key, resolver: e.resolver.key}))};
  expect(entries).toHaveLength(21);
  const registry = createEntityAuthorizationRuntimeRegistry(entries);
  expect(() => registry.qualify(profile, runtime)).not.toThrow();
  const changed = structuredClone(profile);
  changed.operations.find((o: {key: string}) => o.key === "credit_read").requiresParentRead = false;
  expect(() => registry.qualify(changed, runtime)).toThrow();
  expect(entries.every(e => e.operation.effect === "read" && !e.operation.requiresPreflight)).toBe(true);
});
