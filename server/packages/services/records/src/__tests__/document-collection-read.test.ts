import { expect, it, vi } from "vitest";
import { createRecordQueryService } from "../query-service.js";
import type { RecordQueryServiceOptions } from "../query-service.js";

const descriptor = {
  entityCode: "business_partner_request",
  collectionRelationship: {
    schemaVersion: 1,
    sourceRef: "entity_case",
    subject: { fieldRef: "subject_entity", value: "master.business_partner" },
    scope: {
      fieldRef: "current_snapshot.organization",
      contextRef: "operatingOrganizationId",
    },
  },
  storage: {
    schema: "document",
    object: "entity_case",
    idField: "id",
    tenantField: "tenant_id",
  },
  fields: [{ key: "id", storagePath: "id", type: "uuid" }],
  operations: {
    read: {
      code: "read",
      permissionCode: "neon.relationship.entity_case.read",
    },
  },
};
const query = {
  context: {
    tenantId: "tenant",
    planeKey: "neon",
    principalId: "principal",
    permissions: { principalFingerprint: "fp" },
  },
  entityCode: descriptor.entityCode,
  recordId: "11111111-1111-4111-8111-111111111111",
} as never;
function setup(resolution?: unknown) {
  const rawGet = vi.fn(async () => ({ id: "another-subject-case" }));
  const list = vi.fn(async () => ({ data: [], pagination: {} }));
  const options = {
    metadata: { getEntityDescriptor: async () => descriptor },
    authorizer: { authorize: async () => ({ allowed: true }) },
    repository: { get: rawGet, list },
    transactions: {
      run: async (
        _plane: unknown,
        _context: unknown,
        work: (tx: unknown) => unknown,
      ) => work({}),
    },
    ...(resolution
      ? { collectionScopes: { resolve: async () => resolution } }
      : {}),
  } as unknown as RecordQueryServiceOptions;
  return { service: createRecordQueryService(options), rawGet, list };
}
it.each([
  [undefined, "COLLECTION_SCOPE_RESOLVER_REQUIRED"],
  [{ status: "context_required" }, "RECORD_LIST_SCOPE_REQUIRED"],
  [
    { status: "forbidden", code: "WRONG_ORGANIZATION", message: "Forbidden" },
    "WRONG_ORGANIZATION",
  ],
])(
  "does not let a broad read grant bypass missing or denied child scope: %s",
  async (resolution, code) => {
    const { service, rawGet, list } = setup(resolution);
    await expect(service.get(query)).rejects.toMatchObject({ code });
    expect(rawGet).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  },
);
it("applies registered subject and organization constraints to a direct child ID read", async () => {
  const constraints = [
    {
      kind: "platform.document_relationship.v1",
      operatingOrganizationId: "organization",
    },
  ];
  const { service, rawGet, list } = setup({
    status: "ready",
    authorizationResource: { operatingOrganizationId: "organization" },
    constraints,
    labels: [],
    fingerprintMaterial: { organization: "organization" },
  });
  await expect(service.get(query)).resolves.toEqual({ data: null });
  expect(rawGet).not.toHaveBeenCalled();
  expect(list).toHaveBeenCalledWith(
    expect.objectContaining({
      recordIds: ["11111111-1111-4111-8111-111111111111"],
      collectionScope: constraints,
      limit: 1,
    }),
    expect.anything(),
  );
});
