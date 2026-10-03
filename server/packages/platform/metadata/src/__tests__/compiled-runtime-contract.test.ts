import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { MetadataReader } from "@athyper/server-contract-metadata";
import {
  parseCompiledEntityArtifact,
  parseCompiledEntityReleaseEnvelope,
} from "@athyper/server-contract-publication";
import { PinnedCompiledEntityReader } from "../compiled-entity-reader.js";
import {
  createCompiledMetadataReader,
  parseCompiledRuntimeContract,
  validateCompiledRuntimeContracts,
} from "../compiled-runtime-contract.js";

const profile = JSON.parse(
  readFileSync(
    new URL(
      "../../../../../../packages/contracts/platform/fixtures/entity-authorization/company-invoice.v1.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const entityCode = profile.entityCode;
const descriptor = {
  schema: "athyper.entity-runtime-descriptor/1.0",
  entityCode,
  planeKey: "neon",
  storage: {
    schema: "document",
    object: "invoice",
    idField: "id",
    tenantField: "tenant_id",
  },
  fields: profile.fieldPolicies
    .flatMap((p: { fields: string[] }) => p.fields)
    .map((key: string) => ({
      key,
      storagePath: key,
      type: "string",
      required: false,
      writableOn: [],
    })),
  operations: Object.fromEntries(
    profile.operations.map((o: { key: string; permissionCode: string }) => [
      o.key,
      {
        code: o.key,
        permissionCode: o.permissionCode,
        authorizationMode: "bound_operation",
      },
    ]),
  ),
  authorization: profile,
  authorizationRuntime: {
    schemaVersion: 1,
    runtimeVersion: "entity-authorization.v1",
    bindings: profile.operations.map(
      (o: { key: string; scope: string; requiresPreflight: boolean }) => ({
        operation: o.key,
        handler: `invoice.${o.key}.v1`,
        resolver: o.scope,
        ...(o.requiresPreflight
          ? { preflight: `invoice.${o.key}.preflight.v1` }
          : {}),
      }),
    ),
  },
};
const artifact = (
  type: string,
  suffix: string,
  content: Record<string, unknown>,
) =>
  parseCompiledEntityArtifact({
    schema: "athyper.compiled-entity-artifact/2.0-draft",
    schemaVersion: 2,
    contractStatus: "published",
    artifactType: type,
    artifactKey: `${entityCode}/${suffix}`,
    entityCode,
    plane: "neon",
    dependencies: [],
    artifactHash: `sha256:${"a".repeat(64)}`,
    ...content,
  });
const runtime = artifact("runtime_contract", "runtime", {
  descriptor,
  dependencies: [`${entityCode}/core`, `${entityCode}/operation`],
});
const core = artifact("core", "core", {
  storage: {
    primaryObject: "document.invoice",
    sourceObjects: ["document.invoice"],
    idField: "id",
    tenantField: "tenant_id",
  },
  fields: descriptor.fields.map((f: { key: string }) => ({
    key: f.key,
    dataType: "string",
    binding: { sourceObject: "document.invoice", column: f.key },
  })),
});
const operation = artifact("operation", "operation", {
  operations: profile.operations,
});
const artifacts = [core, operation, runtime];
const release = parseCompiledEntityReleaseEnvelope({
  schema: "athyper.compiled-entity-release/2.0-draft",
  contractStatus: "published",
  releaseId: "example-release",
  releaseNo: 1,
  targetPlanes: ["neon"],
  externalDependencies: [],
  releaseHash: `sha256:${"b".repeat(64)}`,
  signature: {},
  artifacts: artifacts.map((a) => ({
    artifactKey: a.artifactKey,
    artifactType: a.artifactType,
    entityCode,
    hash: a.artifactHash,
    ref: `${a.artifactKey}.json`,
  })),
});
const publication = {
  releaseId: "00000000-0000-4000-8000-000000000001",
  releaseNo: 9,
};
const context = {
  tenantId: "tenant-a",
  principalId: "user-a",
  planeKey: "neon",
  permissions: { localGraphPreview: { [entityCode]: "old-native-pin" } },
} as unknown as Parameters<MetadataReader["getEntityDescriptor"]>[0];

function fixture() {
  const source = {
    findAdmittedRelease: vi.fn(async () => release),
    findPublicationCoordinate: vi.fn(async () => publication),
    findArtifact: vi.fn(
      async (input: { entry: { artifactKey: string } }) =>
        artifacts.find((a) => a.artifactKey === input.entry.artifactKey) ??
        null,
    ),
  };
  const reader = new PinnedCompiledEntityReader({ source });
  return { source, reader, metadata: createCompiledMetadataReader(reader) };
}
describe("compiled-only runtime contract", () => {
  it("keeps the DTO while using the compiled artifact and publication identity", async () => {
    const { metadata, source } = fixture();
    expect(
      await metadata.getEntityDescriptor(context, entityCode),
    ).toMatchObject({
      ...publication,
      storage: descriptor.storage,
      authorization: profile,
    });
    expect(source.findAdmittedRelease).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      principalId: "user-a",
      planeKey: "neon",
      entityCode,
    });
    expect(source.findArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        release,
        entry: expect.objectContaining({
          artifactKey: `${entityCode}/runtime`,
        }),
      }),
    );
  });
  it("returns missing when no compiled release is admitted, never consulting native preview", async () => {
    const { metadata, source } = fixture();
    source.findAdmittedRelease.mockResolvedValueOnce(null as never);
    expect(await metadata.getEntityDescriptor(context, entityCode)).toBeNull();
    expect(source.findArtifact).not.toHaveBeenCalled();
  });
  it("rejects a partial compiled release rather than falling back to a different authority", async () => {
    const { metadata, source } = fixture();
    source.findAdmittedRelease.mockResolvedValueOnce({
      ...release,
      artifacts: release.artifacts.filter(
        (a) => a.artifactType !== "runtime_contract",
      ),
    });
    await expect(
      metadata.getEntityDescriptor(context, entityCode),
    ).rejects.toThrow("COMPILED_ENTITY_ARTIFACT_NOT_IN_RELEASE");
  });
  it("re-resolves activation heads instead of caching a tenant descriptor independently", async () => {
    const { metadata, source } = fixture();
    await metadata.getEntityDescriptor(context, entityCode);
    source.findAdmittedRelease.mockResolvedValueOnce(null as never);
    expect(await metadata.getEntityDescriptor(context, entityCode)).toBeNull();
  });
  it("requires complete authorization and preflight bindings", () => {
    expect(() =>
      parseCompiledRuntimeContract(
        {
          ...runtime,
          content: {
            ...runtime.content,
            descriptor: { ...descriptor, authorizationRuntime: undefined },
          },
        },
        publication,
      ),
    ).toThrow("AUTHORIZATION_REQUIRED");
    expect(() =>
      parseCompiledRuntimeContract(
        {
          ...runtime,
          content: {
            ...runtime.content,
            descriptor: {
              ...descriptor,
              authorizationRuntime: {
                ...descriptor.authorizationRuntime,
                bindings: [],
              },
            },
          },
        },
        publication,
      ),
    ).toThrow("coverage");
  });
  it("validates storage, field and permission compatibility with the same release", () => {
    expect(() => validateCompiledRuntimeContracts(artifacts)).not.toThrow();
    expect(() =>
      validateCompiledRuntimeContracts([runtime, operation]),
    ).toThrow("DEPENDENCY_MISSING");
    expect(() =>
      validateCompiledRuntimeContracts([
        runtime,
        operation,
        {
          ...core,
          content: {
            ...core.content,
            storage: { primaryObject: "document.other" },
          },
        },
      ]),
    ).toThrow("STORAGE_MISMATCH");
    expect(() =>
      validateCompiledRuntimeContracts([
        runtime,
        operation,
        { ...core, content: { ...core.content, fields: [] } },
      ]),
    ).toThrow("FIELD_MISMATCH");
    expect(() =>
      validateCompiledRuntimeContracts([
        runtime,
        core,
        {
          ...operation,
          content: {
            ...operation.content,
            operations: [{ key: "read", permissionCode: "other.read" }],
          },
        },
      ]),
    ).toThrow("PERMISSION_MISMATCH");
  });
  it("requires the canonical runtime key and dependency declarations", () => {
    expect(() => artifact("runtime_contract", "other", { descriptor })).toThrow(
      "Invalid compiled server-runtime contract",
    );
    expect(() =>
      artifact("runtime_contract", "runtime", { descriptor }),
    ).toThrow("Invalid compiled server-runtime contract");
  });
});

it("requires identical structured projection declarations in Core and the signed runtime", () => {
  const structuredProjection = {kind:"object_array",maxItems:2,fields:[{key:"state",type:"string",nullable:false}]};
  const key = descriptor.fields[0]!.key;
  const native = {...descriptor, fields:descriptor.fields.map(field=>field.key===key?{...field,type:"json",structuredProjection}:field)};
  const runtimeWithJson = {...runtime, content:{...runtime.content,descriptor:native}};
  const fields = (core.content.fields as any[]).map(field=>field.key===key?{...field,dataType:"json",structuredProjection}:field);
  const coreWithJson = {...core,content:{...core.content,fields}};
  expect(()=>validateCompiledRuntimeContracts([runtimeWithJson,coreWithJson,operation])).not.toThrow();
  expect(()=>validateCompiledRuntimeContracts([runtimeWithJson,{...coreWithJson,content:{...coreWithJson.content,fields:fields.map(field=>field.key===key?{...field,structuredProjection:{...structuredProjection,maxItems:3}}:field)}},operation])).toThrow("FIELD_MISMATCH");
  for (const property of ["filterable","sortable","searchable"]) {
    expect(()=>parseCompiledRuntimeContract({...runtimeWithJson,content:{...runtimeWithJson.content,descriptor:{...native,fields:native.fields.map(field=>field.key===key?{...field,[property]:true}:field)}}},publication)).toThrow("non-queryable JSON");
  }
});
