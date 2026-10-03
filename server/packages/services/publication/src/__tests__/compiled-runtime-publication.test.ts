import { readFileSync } from "node:fs";
import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  compileCompiledEntityArtifacts,
  compiledEntityRuntimeProjection,
} from "../compiled-entity-artifact-compiler.js";
import { VerifiedPublicationArtifactLoader } from "../publication-artifact-loader.js";
import { parseCompiledEntityReleaseEnvelope } from "@athyper/server-contract-publication";
import * as metadataRuntime from "@athyper/server-platform-metadata";

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
  expect(result.release).not.toHaveProperty("signature");
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

async function load(qualify?: (profile: unknown, bindings: unknown) => void, mode?: string, current = "2.0.0", minimum?: string) {
  const source = { entity_id: "source-entity", release_hash: "source-release-hash" };
  const compilation = compileCompiledEntityArtifacts(mode?.startsWith("provenance") ? {
    ...input, runtimeContracts: { [entityCode]: { ...descriptor, source } },
  } : mode === "unsafe-pattern" ? { ...input, runtimeContracts: { [entityCode]: {
    ...descriptor, fields: descriptor.fields.map((field: Record<string, unknown>) => ({ ...field, validation: { pattern: "^(a+)+$" } })),
  } } } : mode === "incomplete-operation" ? { ...input, artifacts: input.artifacts.map(artifact =>
    artifact.content.artifactType === "operation" ? { ...artifact, content: { ...artifact.content,
      operations: [...profile.operations, { key: "approve_extra" }] } } : artifact) } : input);
  const releaseId = "00000000-0000-4000-8000-000000000001",
    at = "2026-09-25T00:00:00Z",
    publicationKey = `metadata.compiled_entity.${entityCode}`;
  const projection = compiledEntityRuntimeProjection(compilation, at, entityCode);
  const payload = mode === "legacy" ? { ...projection, release: { ...projection.release,
    signature: { algorithm: "undefined", keyId: "undefined", value: "undefined" } } } : projection;
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
    ...(minimum !== undefined ? { minimumRuntimeVersion: minimum } : {}),
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
    ...(mode?.startsWith("provenance") ? { evidence: { sourceEntityId: source.entity_id,
      sourceReleaseHash: mode === "provenance-invalid" ? "different-source" : source.release_hash } } : {}),
  };
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const signature = mode === "bad-signature" ? Buffer.alloc(64).toString("base64") : sign(
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
    runtimeVersion: current,
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
it("rejects unsafe patterns during compilation and independently at signed target admission", async () => {
  await expect(load(vi.fn(), "unsafe-pattern")).rejects.toThrow("Unsupported metadata field pattern");
  // Simulate an older compiler which admitted this syntax. The target must still reject
  // a correctly hashed, genuinely signed document; skip only the compiler-side check.
  const validation = vi.spyOn(metadataRuntime, "validateCompiledRuntimeContracts").mockImplementationOnce(() => {});
  try {
    await expect(load(vi.fn(), "unsafe-pattern")).rejects.toMatchObject({
      code: "RUNTIME_INCOMPATIBLE", cause: { code: "METADATA_FIELD_PATTERN_INVALID" },
    });
    expect(validation.mock.calls.length).toBeGreaterThanOrEqual(2);
  } finally { validation.mockRestore(); }
});
it("qualifies the compiled server authorization before accepting a signed release", async () => {
  const qualify = vi.fn();
  expect((await load(qualify)).verification.runtimeCompatible).toBe(true);
  expect(qualify).toHaveBeenCalledWith(profile, {
    ...descriptor.authorizationRuntime,
    bindings: expect.arrayContaining(descriptor.authorizationRuntime.bindings),
  });
});
it("blocks omitted source operations at compilation and independently at signed admission", async () => {
  await expect(load(vi.fn(), "incomplete-operation")).rejects.toThrow("OPERATION_UNLOWERED");
  // Simulate an older compiler. A valid signature must not bypass target admission.
  const coverage = vi.spyOn(metadataRuntime, "assertCompleteRuntimeOperations").mockImplementationOnce(() => {});
  try {
    await expect(load(vi.fn(), "incomplete-operation")).rejects.toThrow("RUNTIME_INCOMPATIBLE");
    expect(coverage.mock.calls.length).toBeGreaterThanOrEqual(2);
  } finally { coverage.mockRestore(); }
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

it("verifies the outer signature for compiled releases without an inner signature", async () => {
  expect((await load(() => {})).verification.signatureVerified).toBe(true);
  await expect(load(() => {}, "bad-signature")).rejects.toThrow("ARTIFACT_SIGNATURE_INVALID");
});
it("preserves legacy placeholder bytes covered by a real outer signature", async () => {
  expect((await load(() => {}, "legacy")).verification.signatureVerified).toBe(true);
});
it("cross-checks source provenance at target admission even for correctly signed documents", async () => {
  expect((await load(() => {}, "provenance-valid")).verification.signatureVerified).toBe(true);
  await expect(load(() => {}, "provenance-invalid")).rejects.toThrow("ARTIFACT_MANIFEST_INVALID");
});
it("does not manufacture inner signature strings or coerce invalid legacy values", () => {
  const release = compileCompiledEntityArtifacts(input).release;
  expect(parseCompiledEntityReleaseEnvelope(release)).not.toHaveProperty("signature");
  expect(parseCompiledEntityReleaseEnvelope({ ...release, signature: {} }).signature).toEqual({});
  for (const signature of [null, { algorithm: 123 }, { value: undefined }, { other: "x" }])
    expect(() => parseCompiledEntityReleaseEnvelope({ ...release, signature })).toThrow("Legacy inner signature metadata is invalid");
});

it.each([
  ["1.9.9", "2.0.0", false], ["2.0.0", "2.0.0", true], ["3.0.0", "2.9.9", true],
  ["2.1.9", "2.2.0", false], ["2.3.0", "2.2.9", true],
  ["2.2.1", "2.2.2", false], ["2.2.3", "2.2.2", true],
  ["2.0.0-rc.1", "2.0.0", false], ["2.0.0", "2.0.0-rc.1", true],
  ["2.0.0-rc.2", "2.0.0-rc.10", false], ["2.0.0+build", "2.0.0", true],
])("loader enforces runtime %s >= %s (%s)", async (current, minimum, allowed) => {
  const run = load(() => {}, undefined, current, minimum);
  if (allowed) expect((await run).verification.runtimeCompatible).toBe(true);
  else await expect(run).rejects.toThrow("RUNTIME_INCOMPATIBLE");
});
it.each(["2", "2.0", "02.0.0", "2.0.0garbage", "2.0.0-01", "2.0.0-", "2.0.0+", " 2.0.0"])("loader rejects malformed version %s", async value => {
  await expect(load(() => {}, undefined, "2.0.0", value)).rejects.toThrow();
  await expect(load(() => {}, undefined, value, "2.0.0")).rejects.toThrow();
});
