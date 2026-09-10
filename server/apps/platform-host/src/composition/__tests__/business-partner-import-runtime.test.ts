import { expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createBusinessPartnerImportRuntime } from "../business-partner-import-runtime.js";
const context = {planeKey: "neon", tenantId: "11111111-1111-4111-8111-111111111111", principalId: "22222222-2222-4222-8222-222222222222", requestId: "request"} as VerifiedRequestContext;
const batch = {schemaVersion: 1, batchKey: "batch-0001", rows: [{rowKey: "row-0001", operatingOrganizationId: "33333333-3333-4333-8333-333333333333", companyCodeId: "44444444-4444-4444-8444-444444444444", proposedPayload: {}}]};
it("requires the exact import gateway and separate per-row authority with stored compatibility", async () => {
  const authorize = vi.fn(async (request: {permissionCode: string}) => ({allowed: request.permissionCode.endsWith(".import")}));
  const resolve = vi.fn(async (input: {coordinates?: object}) => ({state: "resolved" as const, coordinates: input.coordinates ?? {}}));
  const preflightCreate = vi.fn();
  const service = createBusinessPartnerImportRuntime({requests: {preflightCreate} as never, authorizer: {authorize}, scopes: {resolve, preflight: async () => "allowed"}, refreshContext: async c => c});
  await expect(service.execute(context, batch)).rejects.toMatchObject({code: "BP_GOVERNED_IMPORT_ROW_FORBIDDEN"});
  expect(authorize.mock.calls.map(([r]) => r.permissionCode)).toEqual(["neon.relationship.bp_target.import", "neon.relationship.entity_case.create"]);
  expect(resolve).toHaveBeenCalledWith(expect.objectContaining({entityCode: "entity_case", target: "proposed", resolver: "organization-company.record.v1"}));
  expect(preflightCreate).not.toHaveBeenCalled();
});
