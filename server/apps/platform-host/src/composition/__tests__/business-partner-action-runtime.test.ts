import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import type { BusinessPartnerRequestService } from "@athyper/server-contract-master-data";
import type { RecordQueryService } from "@athyper/server-contract-records";
import type { EntityScopeAdapter } from "@athyper/server-service-records";
import { createEntityAuthorizationRuntimeRegistry } from "@athyper/server-contract-metadata";
import { createBusinessPartnerActionRuntimeRegistrations } from "../business-partner-action-runtime.js";
import { createBusinessPartnerReadRuntimeRegistrations } from "../business-partner-read-runtime.js";
function fixture() {
  const requests = {create: vi.fn(async () => ({request: {id: "draft"}})), list: vi.fn(async () => [])};
  const records = {get: vi.fn(async () => ({data: {id: "bp"}}))};
  const scopes: EntityScopeAdapter = {resolve: vi.fn(async () => ({state: "invalid"})), preflight: vi.fn(async () => "workflow_blocked")};
  const entries = createBusinessPartnerActionRuntimeRegistrations(requests as unknown as BusinessPartnerRequestService, records as unknown as RecordQueryService, scopes);
  return {requests, records, scopes, entries};
}
it("rejects mutation variant substitution and preserves parent denial before draft creation", async () => {
  const f = fixture(), entry = f.entries.find(e => e.operation.key === "configure_company")!;
  const command = {context: {planeKey: "neon"}, kind: "configure_company", targetBusinessPartnerId: "bp"};
  await expect(Reflect.apply(entry.handler.invoke, null, [{...command, kind: "archive"}])).rejects.toThrow("VARIANT_MISMATCH");
  f.records.get.mockRejectedValueOnce(Error("PARENT_DENIED"));
  await expect(Reflect.apply(entry.handler.invoke, null, [command])).rejects.toThrow("PARENT_DENIED");
  expect(f.requests.create).not.toHaveBeenCalled();
  await Reflect.apply(entry.handler.invoke, null, [command]);
  expect(f.requests.create).toHaveBeenCalledWith(command);
});
it("validates first-assignment proposed ownership without requiring an existing assignment", async () => {
  const f = fixture(), entry = f.entries.find(e => e.operation.key === "assign_organization")!;
  const input = {entityCode: "business_partner", operationKey: "assign_organization", target: "existing", resolver: "tenant.record.v1", coordinates: {operatingOrganizationId: "org"}};
  await Reflect.apply(entry.resolver.resolve, null, [input]);
  expect(f.scopes.resolve).toHaveBeenCalledWith({...input, entityCode: "entity_case", operationKey: "create", resolver: "organization.record.v1", target: "proposed"});
  expect(await Reflect.apply(entry.preflight!.check, null, [input])).toBe("workflow_blocked");
});
it("matches all eight approved action semantics without accepting a changed company boundary", () => {
  const f = fixture();
  expect(f.entries).toHaveLength(8);
  const entries = [...f.entries, ...createBusinessPartnerReadRuntimeRegistrations(f.records as never, {section: vi.fn()} as never, f.scopes)];
  const selected = JSON.parse(readFileSync(new URL("../../../../../../governance/policy/reports/business-partner-corrected-release.dev.json", import.meta.url), "utf8")).descriptor.authorization;
  const profile = {...selected, operations: selected.operations.filter((o: {key: string}) => entries.some(e => e.operation.key === o.key))};
  const runtime = {schemaVersion: 1, runtimeVersion: "entity-authorization.v1", bindings: entries.map(e => ({operation: e.operation.key, handler: e.handler.key, resolver: e.resolver.key, ...(e.preflight ? {preflight: e.preflight.key} : {})}))};
  const registry = createEntityAuthorizationRuntimeRegistry(entries);
  expect(() => registry.qualify(profile, runtime)).not.toThrow();
  profile.operations.find((o: {key: string}) => o.key === "configure_company").requiresParentRead = false;
  expect(() => registry.qualify(profile, runtime)).toThrow();
});
