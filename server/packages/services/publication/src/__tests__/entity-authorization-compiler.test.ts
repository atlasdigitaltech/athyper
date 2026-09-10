import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createEntityAuthorizationRuntimeRegistry,
  parseEntityAuthorizationProfile,
  parseEntityAuthorizationRuntime,
} from "@athyper/server-contract-metadata";
import type {
  PublicationCanonicalizer,
  PublicationDeploymentBundle,
} from "@athyper/server-contract-publication";
import {
  compileEntityAuthorizationPublication,
  type EntityAuthorizationPublicationInput,
} from "../entity-authorization-compiler.js";
import { VerifiedPublicationArtifactLoader } from "../publication-artifact-loader.js";

const canonicalizer: PublicationCanonicalizer = {
  canonicalBytes(value) {
    return new TextEncoder().encode(JSON.stringify(sort(value)));
  },
  sha256(bytes) {
    return createHash("sha256").update(bytes).digest("hex");
  },
};
function sort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sort(v)]),
    );
  return value;
}
const keys = generateKeyPairSync("ed25519");
const signer = {
  async sign(input: { bytes: Uint8Array }) {
    return {
      signature: sign(null, input.bytes, keys.privateKey).toString("base64"),
    };
  },
};
const verifier = {
  async verify(input: { bytes: Uint8Array; signature: string }) {
    return verify(
      null,
      input.bytes,
      keys.publicKey,
      Buffer.from(input.signature, "base64"),
    );
  },
};
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture(): EntityAuthorizationPublicationInput {
  const profile = parseEntityAuthorizationProfile({
    schemaVersion: 1,
    entityCode: "business_partner",
    planeKey: "neon",
    ownership: "tenant.record.v1",
    directory: { operation: "discover", population: "tenant" },
    recordReadOperation: "read",
    operations: [
      {
        key: "discover",
        permissionCode: "neon.relationship.business_partner.read",
        scope: "tenant.record.v1",
        target: "collection",
        effect: "read",
        requiresParentRead: false,
        requiresPreflight: false,
      },
      {
        key: "read",
        permissionCode: "neon.relationship.business_partner.read",
        scope: "tenant.record.v1",
        target: "existing",
        effect: "read",
        requiresParentRead: false,
        requiresPreflight: false,
      },
    ],
    fieldPolicies: [
      {
        key: "identity",
        fields: ["id"],
        readOperation: "read",
        representation: "plain",
        writeOperations: [],
        queryUses: ["export"],
      },
    ],
    surfaces: [],
    relationships: [],
  });
  const runtime = parseEntityAuthorizationRuntime(
    {
      schemaVersion: 1,
      runtimeVersion: "entity-authorization.v1",
      bindings: profile.operations.map((o) => ({
        operation: o.key,
        handler: "bp.directory.v1",
        resolver: o.scope,
      })),
    },
    profile,
  );
  const registry = createEntityAuthorizationRuntimeRegistry(
    profile.operations.map((operation) => ({
      entityCode: profile.entityCode,
      planeKey: profile.planeKey,
      operation,
      handler: { key: "bp.directory.v1", invoke: async () => [] },
      resolver: {
        key: "tenant.record.v1",
        resolve: async () => ({ state: "resolved", coordinates: {} }),
      },
    })),
  );
  const contract = {
    authorization: profile,
    authorizationRuntime: runtime,
    operations: [
      { id: id(6), operationKey: "read" },
      { id: id(8), operationKey: "discover" },
    ],
  };
  return {
    // Synthetic governance fixture; never represents DEV reviewer acceptance.
    review:{async qualify(){return {receiptSha256:"a".repeat(64)};}},
    canonicalizer,
    signer,
    signingKeyId: "test",
    minimumRuntimeVersion: "1.0.0",
    runtime: registry,
    catalog: [
      {
        id: id(7),
        code: profile.operations[0]!.permissionCode,
        kind: "entity_operation",
        scopeKinds: ["tenant"],
      },
    ],
    operationIds: { read: id(6), discover: id(8) },
    projection: {
      entityContract: {
        id: id(1),
        tenantId: id(2),
        entityId: id(3),
        entityCode: "business_partner",
        releaseId: id(4),
        revisionId: id(1),
        releaseNo: 18,
        contractSchemaCode: "athyper.entity-contract",
        contractSchemaVersion: "1.0.0",
        contractHash: "",
        contract,
        publicationKey: "metadata.entity.business_partner.test",
        signature: { algorithm: "Ed25519", keyId: "test", signature: "" },
        publishedAt: "2026-09-10T00:00:00Z",
      },
      entityDescriptor: {
        id: id(5),
        plane: "neon",
        descriptorKind: "entity_runtime",
        descriptorSchemaVersion: "1.0.0",
        sourceContractHash: "",
        compiledHash: "",
        compilerVersion: "",
        compatibilityLevel: "breaking",
        generatedAt: "2026-09-10T00:00:00Z",
        descriptor: {
          schema: "athyper.entity-runtime-descriptor/1.0",
          entityCode: "business_partner",
          planeKey: "neon",
          storage: {
            schema: "master",
            object: "business_partner",
            idField: "id",
            tenantField: "tenant_id",
          },
          fields: [{ key: "id", type: "uuid", storagePath:"id", writableOn:[] }],
          operations: Object.fromEntries(
            profile.operations.map((o) => [
              o.key,
              { code: o.key, permissionCode: o.permissionCode },
            ]),
          ),
          authorization: profile,
          authorizationRuntime: runtime,
        },
      },
    },
  };
}
async function load(
  input: EntityAuthorizationPublicationInput,
  withRuntime = true,
  change?: (document: any) => void,
) {
  const document = await compileEntityAuthorizationPublication(input);
  change?.(document);
  const bytes = canonicalizer.canonicalBytes(document),
    hash = canonicalizer.sha256(bytes);
  const deployment: PublicationDeploymentBundle = {
    deploymentId: id(9),
    deploymentStatus: "dispatched",
    targetPlane: "neon",
    targetEnvironment: "test",
    targetInstance: "test",
    publicationKey: document.envelope.publicationKey,
    sourceReleaseId: document.envelope.releaseId,
    sourceReleaseNo: document.envelope.releaseNo,
    artifactUri: "memory",
    artifactHash: hash,
    signatureAlgorithm: "Ed25519",
    signingKeyId: "test",
    signature: document.signature,
  };
  return new VerifiedPublicationArtifactLoader({
    store: {
      async get() {
        return bytes;
      },
      async putImmutable() {
        throw new Error("must not publish");
      },
    },
    verifier,
    canonicalizer,
    runtimeVersion: "1.0.0",
    ...(withRuntime ? { authorizationRuntime: input.runtime } : {}),
  }).load(deployment);
}
describe("native entity authorization publication (synthetic approved catalog)", () => {
  it("signs and loads tenant-owned native artifacts without publishing or grants", async () => {
    const input = fixture();
    const loaded = await load(input);
    expect(loaded.verification.signatureVerified).toBe(true);
    expect(loaded.document.envelope.payload).toHaveProperty(
      "entityContract.tenantId",
      id(2),
    );
    expect(loaded.document.envelope.payload).toHaveProperty(
      "entityDescriptor.descriptor.operation_scope_bindings.0.scopeKind",
      "tenant",
    );
  });
  it("is deterministic for identical authored coordinates", async () => {
    const input = fixture();
    expect(await compileEntityAuthorizationPublication(input)).toEqual(
      await compileEntityAuthorizationPublication(input),
    );
  });
  it("regenerates IDs for a new release", async () => {
    const input = fixture();
    const a = await compileEntityAuthorizationPublication(input);
    const next = structuredClone(input.projection);
    Object.assign(next.entityContract, { releaseId: id(20), releaseNo: 19 });
    const b = await compileEntityAuthorizationPublication({
      ...input,
      projection: next,
    });
    expect(a.envelope.payload).not.toEqual(b.envelope.payload);
  });
  it("requires receiving runtime registrations", async () => {
    await expect(load(fixture(), false)).rejects.toThrow(
      "RUNTIME_INCOMPATIBLE",
    );
  });
  it("rejects payload tampering even with an updated transport hash", async () => {
    await expect(
      load(fixture(), true, (d) => {
        d.envelope.payload.entityContract.tenantId = id(30);
      }),
    ).rejects.toThrow("ARTIFACT_HASH_MISMATCH");
  });
  it("rejects a missing canonical permission", async () => {
    await expect(
      compileEntityAuthorizationPublication({ ...fixture(), catalog: [] }),
    ).rejects.toThrow("Canonical permission unresolved");
  });
  it("does not widen organization permission compatibility to tenant", async () => {
    const input = fixture();
    await expect(
      compileEntityAuthorizationPublication({
        ...input,
        catalog: input.catalog.map((p) => ({
          ...p,
          scopeKinds: ["operating_organization"],
        })),
      }),
    ).rejects.toThrow("Permission scope review required");
  });
  it("rejects duplicate catalog entries", async () => {
    const input = fixture();
    await expect(
      compileEntityAuthorizationPublication({
        ...input,
        catalog: [...input.catalog, ...input.catalog],
      }),
    ).rejects.toThrow("Ambiguous");
  });
  it("emits only reviewed scopes when a permission supports additional scopes", async () => {
    const input = fixture();
    const baseline = await compileEntityAuthorizationPublication(input);
    const compiled = await compileEntityAuthorizationPublication({
      ...input,
      catalog: input.catalog.map(p => ({...p, scopeKinds: [...p.scopeKinds, "operating_organization"]})),
    });
    expect(compiled.envelope.payload).toEqual(baseline.envelope.payload);
  });
  it("rejects undecoded PostgreSQL scope arrays", async () => {
    const input = fixture();
    await expect(compileEntityAuthorizationPublication({
      ...input,
      catalog: input.catalog.map(p => ({...p, scopeKinds: "{tenant}" as unknown as string[]})),
    })).rejects.toThrow("Permission scope review required");
  });
  it("rejects missing source operation IDs", async () => {
    await expect(
      compileEntityAuthorizationPublication({ ...fixture(), operationIds: {} }),
    ).rejects.toThrow("Exact operation coverage");
  });
  it("rejects packet fragments", async () => {
    const input = fixture();
    Object.assign(input.projection.entityDescriptor, {
      descriptor: { authorization: {} },
    });
    await expect(compileEntityAuthorizationPublication(input)).rejects.toThrow(
      "coordinates",
    );
  });
  it("rejects unregistered handlers", async () => {
    await expect(
      compileEntityAuthorizationPublication({
        ...fixture(),
        runtime: createEntityAuthorizationRuntimeRegistry([]),
      }),
    ).rejects.toThrow("Unqualified");
  });
  it("requires authored and compiled policies to agree", async () => {
    const input = fixture();
    Object.assign(input.projection.entityContract, { contract: {} });
    await expect(compileEntityAuthorizationPublication(input)).rejects.toThrow(
      "authored authorization",
    );
  });
  it("rejects duplicate and unversioned runtime bindings", () => {
    const input = fixture(),
      profile = parseEntityAuthorizationProfile(
        input.projection.entityDescriptor.descriptor["authorization"],
      );
    expect(() =>
      parseEntityAuthorizationRuntime(
        {
          schemaVersion: 1,
          runtimeVersion: "entity-authorization.v1",
          bindings: profile.operations.map((o) => ({
            operation: o.key,
            handler: "directory",
            resolver: "tenant.record.v1",
          })),
        },
        profile,
      ),
    ).toThrow("Versioned");
  });
  it("rejects mismatched ownership resolvers", () => {
    const input = fixture(),
      profile = parseEntityAuthorizationProfile(
        input.projection.entityDescriptor.descriptor["authorization"],
      );
    expect(() =>
      parseEntityAuthorizationRuntime(
        {
          schemaVersion: 1,
          runtimeVersion: "entity-authorization.v1",
          bindings: profile.operations.map((o) => ({
            operation: o.key,
            handler: "directory.v1",
            resolver: "company.record.v1",
          })),
        },
        profile,
      ),
    ).toThrow("resolver mismatch");
  });
});

it("runtime qualification rejects changed permission semantics and never executes a command", () => {
  const input = fixture(),
    profile = parseEntityAuthorizationProfile(
      input.projection.entityDescriptor.descriptor["authorization"],
    );
  let executions = 0;
  const registry = createEntityAuthorizationRuntimeRegistry(
    profile.operations.map((operation) => ({
      entityCode: profile.entityCode,
      planeKey: profile.planeKey,
      operation: {
        ...operation,
        permissionCode: "neon.relationship.business_partner.update",
      },
      handler: {
        key: "bp.directory.v1",
        invoke: () => {
          executions++;
        },
      },
      resolver: {
        key: operation.scope,
        resolve: () => {
          executions++;
        },
      },
    })),
  );
  expect(() =>
    registry.qualify(
      profile,
      input.projection.entityDescriptor.descriptor["authorizationRuntime"],
    ),
  ).toThrow("Unqualified");
  expect(executions).toBe(0);
});
it("runtime preflight references cannot substitute for executable workflow checks", () => {
  const input = fixture(),
    profile = parseEntityAuthorizationProfile(
      input.projection.entityDescriptor.descriptor["authorization"],
    );
  expect(() =>
    createEntityAuthorizationRuntimeRegistry([
      {
        entityCode: profile.entityCode,
        planeKey: profile.planeKey,
        operation: { ...profile.operations[1]!, requiresPreflight: true },
        handler: { key: "bp.read.v1", invoke: async () => [] },
        resolver: { key: "tenant.record.v1", resolve: async () => ({}) },
      },
    ]),
  ).toThrow("callable");
});
it("compiler pins operation IDs to authored source identities", async () => {
  const input = fixture();
  await expect(
    compileEntityAuthorizationPublication({
      ...input,
      operationIds: { read: id(80), discover: id(8) },
    }),
  ).rejects.toThrow("authored identities");
});
it("runtime parser rejects missing preflight, extra properties, and duplicate operations", () => {
  const input = fixture(),
    profile = parseEntityAuthorizationProfile(
      input.projection.entityDescriptor.descriptor["authorization"],
    );
  const raw = input.projection.entityDescriptor.descriptor[
    "authorizationRuntime"
  ] as { bindings: readonly Record<string, unknown>[] };
  expect(() =>
    parseEntityAuthorizationRuntime(
      {
        ...raw,
        schemaVersion: 1,
        runtimeVersion: "entity-authorization.v1",
        grants: [],
      },
      profile,
    ),
  ).toThrow("Invalid authorization runtime object");
  expect(() =>
    parseEntityAuthorizationRuntime(
      {
        ...raw,
        schemaVersion: 1,
        runtimeVersion: "entity-authorization.v1",
        bindings: [raw.bindings[0], raw.bindings[0]],
      },
      profile,
    ),
  ).toThrow("duplicate");
});


it("requires verified publication review before signing",async()=>{
 const base=fixture();let signs=0;const input={...base,signer:{async sign(){signs++;return{signature:"unused"};}}};
 await expect(compileEntityAuthorizationPublication({...input,review:undefined})).rejects.toThrow("review adapter required");
 await expect(compileEntityAuthorizationPublication({...input,review:{async qualify(){throw Error("Unresolved operation review");}}})).rejects.toThrow("Unresolved operation review");
 await expect(compileEntityAuthorizationPublication({...input,review:{async qualify(){return{receiptSha256:"pending"};}}})).rejects.toThrow("review receipt");
 expect(signs).toBe(0);
});

it("pins catalog and authored IDs before asynchronous governance review",async()=>{
 const input=fixture();const result=await compileEntityAuthorizationPublication({...input,review:{async qualify(){(input.catalog as unknown[]).splice(0);for(const key of Object.keys(input.operationIds))delete (input.operationIds as Record<string,string>)[key];return{receiptSha256:"a".repeat(64)};}}});
 expect(result.manifest.evidence).toMatchObject({authorizationReviewReceiptSha256:"a".repeat(64)});
});

it("normalizes authored binding order while retaining exact binding values and contract evidence", async () => {
  const input=fixture();
  const contract=input.projection.entityContract.contract as Record<string,any>;
  contract.authorizationRuntime={...contract.authorizationRuntime,bindings:[...contract.authorizationRuntime.bindings].reverse()};
  const compiled=await compileEntityAuthorizationPublication(input);
  expect(compiled.manifest.evidence).toMatchObject({authorizationReviewReceiptSha256:"a".repeat(64)});
  contract.authorizationRuntime.bindings[0]={...contract.authorizationRuntime.bindings[0],handler:"unreviewed.handler.v1"};
  await expect(compileEntityAuthorizationPublication(input)).rejects.toThrow("Authoring contract/runtime authorization mismatch");
});
