import { readFileSync } from "node:fs";

export const row = () => ({
  artifact_kind: "entity_runtime" as const,
  source_release_id: "release-1",
  source_release_no: 1,
  descriptor_kind: "entity_runtime",
  payload: null,
  descriptor: {
    entity_code: "country",
    release_id: "release-1",
    release_no: 1,
    entity_contract_hash: "a".repeat(64),
    compiled_hash: "b".repeat(64),
    plane_code: "neon",
    compiled_json: {
      schema: "athyper.entity-runtime-descriptor/1.0",
      entityCode: "country",
      planeKey: "neon",
      storage: {
        schema: "master",
        object: "country",
        idField: "id",
        tenantField: "tenant_id",
      },
      fields: [
        {
          key: "name",
          storagePath: "name",
          type: "string",
          required: true,
          writableOn: [],
        },
      ],
      operations: { read: { code: "read", permissionCode: "country.read" } },
    },
  },
});
export function compiled() {
  const authorization = JSON.parse(
    readFileSync(
      new URL(
        "../../../../../packages/contracts/platform/fixtures/entity-authorization/company-invoice.v1.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const entityCode = authorization.entityCode;
  const artifact = {
    schema: "athyper.compiled-entity-artifact/2.0-draft",
    schemaVersion: 2,
    contractStatus: "published",
    artifactType: "runtime_contract",
    artifactKey: `${entityCode}/runtime`,
    entityCode,
    plane: "neon",
    dependencies: [`${entityCode}/core`, `${entityCode}/operation`],
    artifactHash: `sha256:${"c".repeat(64)}`,
    descriptor: {
      ...row().descriptor.compiled_json,
      entityCode,
      fields: authorization.fieldPolicies
        .flatMap((policy: { fields: string[] }) => policy.fields)
        .map((key: string) => ({
          key,
          storagePath: key,
          type: "string",
          required: false,
          writableOn: [],
        })),
      operations: Object.fromEntries(
        authorization.operations.map(
          (op: { key: string; permissionCode: string }) => [
            op.key,
            {
              code: op.key,
              permissionCode: op.permissionCode,
              authorizationMode: "bound_operation",
            },
          ],
        ),
      ),
      authorization,
      authorizationRuntime: {
        schemaVersion: 1,
        runtimeVersion: "entity-authorization.v1",
        bindings: authorization.operations.map(
          (op: { key: string; scope: string; requiresPreflight: boolean }) => ({
            operation: op.key,
            handler: `invoice.${op.key}.v1`,
            resolver: op.scope,
            ...(op.requiresPreflight
              ? { preflight: `invoice.${op.key}.preflight.v1` }
              : {}),
          }),
        ),
      },
    },
  };
  return {
    ...row(),
    artifact_kind: "compiled_entity_runtime" as const,
    descriptor: null,
    payload: {
      release: {
        schema: "athyper.compiled-entity-release/2.0-draft",
        contractStatus: "published",
        releaseId: "compiled-release",
        releaseNo: 1,
        targetPlanes: ["neon"],
        externalDependencies: [],
        releaseHash: `sha256:${"d".repeat(64)}`,
        artifacts: [
          {
            artifactKey: artifact.artifactKey,
            artifactType: artifact.artifactType,
            entityCode,
            hash: artifact.artifactHash,
            ref: `${artifact.artifactKey}.json`,
          },
        ],
      },
      artifacts: [artifact],
    },
  };
}
