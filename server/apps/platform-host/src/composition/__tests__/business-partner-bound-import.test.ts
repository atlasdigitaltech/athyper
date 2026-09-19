import {readFileSync} from "node:fs";
import {expect, it, vi} from "vitest";
import type {VerifiedRequestContext} from "@athyper/server-contract-auth";
import {entityAuthorizationProfileHash} from "@athyper/server-service-records";
import {createBusinessPartnerBoundImport, createBusinessPartnerImportRegistration} from "../business-partner-bound-import.js";
const context = {planeKey: "neon", tenantId: "44444444-4444-4444-8444-444444444444", principalId: "principal", requestId: "request"} as VerifiedRequestContext;
const release = {releaseId: "33333333-3333-4333-8333-333333333333", compiledHash: "a".repeat(64)};
const batch = {schemaVersion: 1, batchKey: "batch-0001", rows: [1,2].map(n => ({rowKey: `row-000${n}`, operatingOrganizationId: context.tenantId, proposedPayload: {legalName: "Supplier"}}))};
function fixture() {
  const selected = JSON.parse(readFileSync(new URL("../../../../../../governance/policy/reports/business-partner-corrected-release.dev.json", import.meta.url), "utf8"));
  const descriptor = {...selected.descriptor, ...release};
  descriptor.authorizationRuntime = {schemaVersion: 1, runtimeVersion: "entity-authorization.v1", bindings: descriptor.authorization.operations.map((o: {key: string; scope: string; requiresPreflight: boolean}) => ({operation: o.key, handler: o.key === "import" ? "business_partner.import.governed_requests.v1" : `business_partner.${o.key}.v1`, resolver: o.scope, ...(o.requiresPreflight ? {preflight: `business_partner.${o.key}.preflight.v1`} : {})}))};
  const metadata = {getEntityDescriptor: vi.fn(async () => descriptor)};
  const requests = {preflightCreate: vi.fn(async () => ({schema: {code: "request", version: 1, hash: "b".repeat(64), releaseId: release.releaseId}, validation: {valid: true}})), create: vi.fn(async () => ({request: {id: "draft"}, replayed: false}))};
  const authorizer = {enforcedEntityProfile: vi.fn((): string | undefined => entityAuthorizationProfileHash(descriptor.authorization)), authorize: vi.fn(async () => ({allowed: true}))};
  const scopes = {resolve: vi.fn(async (input: {coordinates?: object}) => ({state: "resolved" as const, coordinates: input.coordinates ?? {}})), preflight: vi.fn(async () => "allowed" as const)};
  const options = {requests: requests as never, metadata, authorizer, scopes, refreshContext: async () => context};
  return {descriptor, metadata, requests, authorizer, scopes, service: createBusinessPartnerBoundImport(options)};
}
it("keeps legacy/shadow and incompatible runtime selections closed before any draft or gateway call", async () => {
  const f = fixture(); f.authorizer.enforcedEntityProfile.mockReturnValue(undefined);
  await expect(f.service.execute(context, release, batch)).rejects.toMatchObject({code: "BP_GOVERNED_IMPORT_UNAVAILABLE"});
  expect(f.requests.create).not.toHaveBeenCalled(); expect(f.authorizer.authorize).not.toHaveBeenCalled();
  f.authorizer.enforcedEntityProfile.mockReturnValue(entityAuthorizationProfileHash(f.descriptor.authorization));
  f.descriptor.authorizationRuntime.bindings.find((b: {operation: string}) => b.operation === "import").handler = "business_partner.import.v1";
  await expect(f.service.execute(context, release, batch)).rejects.toMatchObject({code: "BP_GOVERNED_IMPORT_UNAVAILABLE"});
});
it("requires an exact client release and rejects deferral or a stale release", async () => {
  const f = fixture();
  await expect(f.service.execute(context, {...release, compiledHash: "c".repeat(64)}, batch)).rejects.toMatchObject({code: "BP_GOVERNED_IMPORT_RELEASE_CHANGED"});
  await expect(f.service.execute(context, {} as never, batch)).rejects.toMatchObject({code: "BP_GOVERNED_IMPORT_RELEASE_INVALID"});
  f.descriptor.authorization.deferredOperations.push("import");
  await expect(f.service.execute(context, release, batch)).rejects.toThrow();
  expect(f.requests.create).not.toHaveBeenCalled();
});
it("stops a partially created batch when metadata changes before the next row", async () => {
  const f = fixture();
  f.metadata.getEntityDescriptor.mockImplementation(async () => f.metadata.getEntityDescriptor.mock.calls.length >= 5 ? {...f.descriptor, compiledHash: "c".repeat(64)} : f.descriptor);
  const result = await f.service.execute(context, release, batch);
  expect(result.outcomes.map(o => o.status)).toEqual(["created", "failed"]);
  expect(f.requests.create).toHaveBeenCalledTimes(1);
});
it("uses the same executable binding and a read-only preflight that never creates drafts", async () => {
  const f = fixture(), registration = createBusinessPartnerImportRegistration(f.service, f.scopes);
  expect(registration.handler.key).toBe("business_partner.import.governed_requests.v1");
  expect(await Reflect.apply(registration.preflight!.check, null, [{context, operationKey: "import", phase: "execute"}])).toBe("allowed");
  expect(f.requests.create).not.toHaveBeenCalled(); expect(f.authorizer.authorize).not.toHaveBeenCalled();
  const result = await Reflect.apply(registration.handler.invoke, null, [context, release, batch]);
  expect(result.outcomes.map((o: {status: string}) => o.status)).toEqual(["created", "created"]);
});
