import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import {
  compileSharedReferenceProduct,
  parseSharedReferenceProduct,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import { createPublishedTenantRecordAuthorizer } from "@athyper/server-service-records";
import { withReadEvidence } from "@athyper/server-foundation/context";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import {
  compileNativeRuntimeProjection,
  parseEntityRuntimeDescriptor,
} from "@athyper/server-platform-metadata";

it("refreshes Country IAM/metadata once per read while authorizing every field and retaining revocation", async () => {
  const product = parseSharedReferenceProduct(
    JSON.parse(
      readFileSync(
        new URL(
          "../../../../../../../metadata/entities/country/definition.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
  const compiled = compileSharedReferenceProduct(product, "neon").artifact;
  const projection = compileNativeRuntimeProjection({
    native: compiled.descriptor,
    registration: {
      entityCode: "country",
      plane: "neon",
      storage: { schema: "shared", object: "country", idField: "id" },
      columns: product.definition.fields.map((field) => field.key),
    },
    permissions: [
      { code: "common.platform.reference.view", scopeKinds: ["tenant"] },
    ],
  });
  const descriptor: EntityRuntimeDescriptor = parseEntityRuntimeDescriptor({
    entity_code: "country",
    plane_code: "neon",
    release_id: "00000000-0000-4000-8000-000000000001",
    release_no: 1,
    entity_contract_hash: compiled.descriptorHash,
    compiled_hash: "a".repeat(64),
    compiled_json: projection,
  });
  const context = {
    tenantId: "tenant",
    principalId: "actor",
    planeKey: "neon",
  } as VerifiedRequestContext;
  const metadata = { getEntityDescriptor: vi.fn(async () => descriptor) };
  const refreshContext = vi.fn(async (value: VerifiedRequestContext) => ({
    ...value,
  }));
  const authority = { authorize: vi.fn(async () => ({ allowed: true })) };
  const authorizer = createPublishedTenantRecordAuthorizer({
    metadata,
    refreshContext,
    authority,
    exists: async () => true,
  });
  const requests = descriptor.fields.map((field) => ({
    context,
    permissionCode: descriptor.operations.list!.permissionCode,
    resource: {
      tenantId: context.tenantId,
      entityCode: "country",
      operationKey: "list",
      field: field.key,
    },
  }));
  const decisions = await withReadEvidence(() =>
    Promise.all(requests.map((input) => authorizer.authorize(input))),
  );
  expect(decisions.every((decision) => decision.allowed)).toBe(true);
  expect(refreshContext).toHaveBeenCalledTimes(1);
  expect(metadata.getEntityDescriptor).toHaveBeenCalledTimes(2);
  expect(authority.authorize).toHaveBeenCalledTimes(descriptor.fields.length);
  authority.authorize.mockResolvedValue({ allowed: false });
  expect(
    (await withReadEvidence(() => authorizer.authorize(requests[0]!))).allowed,
  ).toBe(false);
  expect(refreshContext).toHaveBeenCalledTimes(2);
});
