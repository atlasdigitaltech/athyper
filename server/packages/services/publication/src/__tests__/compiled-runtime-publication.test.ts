import { readFileSync } from "node:fs";
import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  compileCompiledEntityArtifacts,
  compiledEntityRuntimeProjection,
} from "../compiled-entity-artifact-compiler.js";
import { VerifiedPublicationArtifactLoader } from "../publication-artifact-loader.js";

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
const ordered = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(ordered)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, x]) => [k, ordered(x)]),
        )
      : v;
const canonicalBytes = (v: unknown) => Buffer.from(JSON.stringify(ordered(v)));
const sha256 = (v: Uint8Array) => createHash("sha256").update(v).digest("hex");
const base = (type: string, suffix: string) => ({
  schema: "athyper.compiled-entity-artifact/2.0-draft",
  schemaVersion: 2,
  contractStatus: "published",
  artifactType: type,
  artifactKey: `${entityCode}/${suffix}`,
  entityCode,
  plane: "neon",
  dependencies: [],
});
const input = {
  canonicalizer: {
    canonicalBytes,
    sha256: (v: Uint8Array) => `sha256:${sha256(v)}`,
  },
  registry: {
    permissions: new Set<string>(
      profile.operations.map(
        (o: { permissionCode: string }) => o.permissionCode,
      ),
    ),
    handlers: new Set<string>(),
    resolvers: new Set<string>(),
    renderers: new Set<string>(),
    evaluators: new Set<string>(),
  },
  release: {
    content: {
      schema: "athyper.compiled-entity-release/2.0-draft",
      contractStatus: "published",
      releaseId: "invoice-test",
      releaseNo: 1,
      targetPlanes: ["neon"],
      externalDependencies: [],
      signature: { algorithm: "", keyId: "", value: "" },
    },
  },
  artifacts: [
    {
      ref: `${entityCode}/core.json`,
      content: {
        ...base("core", "core"),
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
      },
    },
    {
      ref: `${entityCode}/operation.json`,
      content: {
        ...base("operation", "operation"),
        operations: profile.operations,
      },
    },
  ],
  runtimeContracts: { [entityCode]: descriptor },
};
it("compiles executable server and UI contracts into one deterministic release", () => {
  const result = compileCompiledEntityArtifacts(input);
  expect(result.report.artifactCount).toBe(3);
  expect(
    result.release.artifacts.some((a) => a.artifactType === "runtime_contract"),
  ).toBe(true);
  expect(compileCompiledEntityArtifacts(input).release.releaseHash).toBe(
    result.release.releaseHash,
  );
  expect(() =>
    compileCompiledEntityArtifacts({
      ...input,
      runtimeContracts: {
        [entityCode]: { ...descriptor, authorizationRuntime: undefined },
      },
    }),
  ).toThrow("AUTHORIZATION_REQUIRED");
});

async function load(qualify?: (profile: unknown, bindings: unknown) => void) {
  const compilation = compileCompiledEntityArtifacts(input);
  const releaseId = "00000000-0000-4000-8000-000000000001",
    at = "2026-09-25T00:00:00Z",
    publicationKey = `metadata.compiled_entity.${entityCode}`;
  const payload = compiledEntityRuntimeProjection(compilation, at, entityCode);
  const envelope = {
    schema: "athyper.publication-artifact.v1",
    publicationKey,
    releaseId,
    releaseNo: 1,
    releaseKind: "publish",
    targetPlane: "neon",
    artifactKind: "compiled_entity_runtime",
    generatedAt: at,
    compatibilityLevel: "backward_compatible",
    payload,
  };
  const manifest = {
    artifactSchema: envelope.schema,
    mediaType: "application/vnd.athyper.publication-artifact.v1+json",
    publicationKey,
    releaseId,
    releaseNo: 1,
    targetPlane: "neon",
    artifactKind: "compiled_entity_runtime",
    payloadSha256: sha256(canonicalBytes(payload)),
    compiler: { name: "test", version: "1.0.0" },
    contractSchemaVersion: "2.0.0",
    descriptorSchemaVersion: "2.0.0",
    signatureAlgorithm: "Ed25519",
    signingKeyId: "test",
    createdAt: at,
  };
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const signature = sign(
    null,
    canonicalBytes({ envelope, manifest }),
    privateKey,
  ).toString("base64");
  const bytes = canonicalBytes({ envelope, manifest, signature });
  const loader = new VerifiedPublicationArtifactLoader({
    store: { get: async () => bytes, putImmutable: async () => {} },
    verifier: {
      verify: async (value) =>
        verify(
          null,
          value.bytes,
          publicKey,
          Buffer.from(value.signature, "base64"),
        ),
    },
    canonicalizer: { canonicalBytes, sha256 },
    runtimeVersion: "2.0.0",
    ...(qualify ? { authorizationRuntime: { qualify } } : {}),
  });
  return loader.load({
    deploymentId: releaseId,
    deploymentStatus: "dispatched",
    targetPlane: "neon",
    targetEnvironment: "test",
    targetInstance: "*",
    publicationKey,
    sourceReleaseId: releaseId,
    sourceReleaseNo: 1,
    artifactUri: "s3://test/compiled.json",
    artifactHash: sha256(bytes),
    signatureAlgorithm: "Ed25519",
    signingKeyId: "test",
    signature,
  });
}
it("qualifies the compiled server authorization before accepting a signed release", async () => {
  const qualify = vi.fn();
  expect((await load(qualify)).verification.runtimeCompatible).toBe(true);
  expect(qualify).toHaveBeenCalledWith(profile, {
    ...descriptor.authorizationRuntime,
    bindings: expect.arrayContaining(descriptor.authorizationRuntime.bindings),
  });
});
it("rejects signed compiled runtime contracts without a target runtime qualifier", async () => {
  await expect(load()).rejects.toThrow("RUNTIME_INCOMPATIBLE");
});
it("rejects handler incompatibility even when the signature is valid", async () => {
  await expect(
    load(() => {
      throw Error("UNKNOWN_HANDLER");
    }),
  ).rejects.toThrow("RUNTIME_INCOMPATIBLE");
});
