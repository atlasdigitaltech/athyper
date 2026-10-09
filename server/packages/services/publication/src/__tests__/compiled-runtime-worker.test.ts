import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { Kysely, PostgresDialect } from "kysely";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import {
  compileRuntimePublication,
  qualifyRuntimePublication,
  type CompiledRuntimePublication,
  type CompiledRuntimeSource,
} from "../compilation/compiled-runtime.js";
import {
  KyselyPublicationAuthorityWork,
  type KyselyPublicationAuthorityWorkOptions,
} from "../kysely-publication-authority-work.js";

const normalize = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(normalize)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, x]) => [k, normalize(x)]),
        )
      : v;
const canonical = {
  canonicalBytes: (v: unknown) => Buffer.from(JSON.stringify(normalize(v))),
  sha256: (b: Uint8Array) => createHash("sha256").update(b).digest("hex"),
};
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture() {
  // Existing non-reference fixture proves the worker is not tied to one product/category.
  const profile = JSON.parse(
    readFileSync(
      new URL(
        "../../../../../../packages/contracts/platform/fixtures/entity-authorization/company-invoice.v1.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const entity = profile.entityCode;
  const descriptor = {
    schema: "athyper.entity-runtime-descriptor/1.0",
    entityCode: entity,
    planeKey: "neon",
    source: { entity_id: id(3), release_hash: "a".repeat(64) },
    operation_scope_bindings: profile.operations.map(
      (o: { key: string; permissionCode: string }, i: number) => ({
        bindingId: id(100 + i),
        scopeBindingId: id(200 + i),
        sourceEntityOperationId: id(300 + i),
        entityCode: entity,
        operationKey: o.key,
        permissionId: id(400 + i),
        permissionCode: o.permissionCode,
        permissionKind: "entity_operation",
        decisionMode: "entity_resource",
        scopeKind: "company_code",
        coordinateSource: "relation_resolver",
        resolverKey: "company.record.v1",
        coordinateKey: null,
      }),
    ),
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
          handler: `test.${o.key}.v1`,
          resolver: o.scope,
          ...(o.requiresPreflight
            ? { preflight: `test.${o.key}.preflight.v1` }
            : {}),
        }),
      ),
    },
  };
  const source: CompiledRuntimeSource = {
    releaseId: id(1),
    releaseNo: 1,
    publicationKey: `metadata.compiled_entity.${entity}`,
    plane: "neon",
    tenantId: null,
    entityCode: entity,
    sourceEntityId: id(3),
    sourceReleaseHash: "a".repeat(64),
    revisionId: id(2),
    sourceContractHash: "a".repeat(64),
    sourceDescriptorHash: "b".repeat(64),
    generatedAt: "2026-09-26T00:00:00.000Z",
    native: descriptor,
    contract: {},
  };
  const base = (type: string) => ({
    schema: "athyper.compiled-entity-artifact/2.0-draft",
    schemaVersion: 2,
    contractStatus: "published",
    artifactType: type,
    artifactKey: `${entity}/${type}`,
    entityCode: entity,
    plane: "neon",
    dependencies: [],
  });
  const registry = {
    permissions: new Set<string>(
      profile.operations.map(
        (o: { permissionCode: string }) => o.permissionCode,
      ),
    ),
    handlers: new Set<string>(),
    renderers: new Set<string>(),
    resolvers: new Set<string>(["company.record.v1"]),
    evaluators: new Set<string>(),
  };
  const lower = vi.fn(async () => ({
    artifacts: [
      {
        ref: `${entity}/core.json`,
        content: {
          ...base("core"),
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
        ref: `${entity}/operation.json`,
        content: { ...base("operation"), operations: profile.operations },
      },
    ],
    runtimeContracts: { [entity]: descriptor },
    release: {
      content: {
        schema: "athyper.compiled-entity-release/2.0-draft",
        contractStatus: "published",
        releaseId: source.releaseId,
        releaseNo: source.releaseNo,
        targetPlanes: [source.plane],
        externalDependencies: [],
      },
    },
  }));
  const qualify = vi.fn(async () => ({ receiptSha256: "c".repeat(64) }));
  const dependencies: CompiledRuntimePublication = {
    lower,
    registry: async () => registry,
    qualify,
  };
  return { source, dependencies, qualify, lower, registry };
}
it("compiles a published split release and rechecks qualification at signing and dispatch", async () => {
  const f = fixture();
  const document = await compileRuntimePublication(
    f.source,
    f.dependencies,
    canonical,
    "test-key",
  );
  expect(document.envelope.artifactKind).toBe("compiled_entity_runtime");
  expect(document.manifest.evidence).toMatchObject({
    sourceRevisionId: id(2),
    qualificationReceiptSha256: "c".repeat(64),
  });
  await qualifyRuntimePublication(document, f.dependencies, canonical, "sign");
  await qualifyRuntimePublication(
    document,
    f.dependencies,
    canonical,
    "dispatch",
  );
  expect(
    f.qualify.mock.calls.map(
      (c) => (c as unknown as [{ phase: string }])[0].phase,
    ),
  ).toEqual(["compile", "sign", "dispatch"]);
});
it("requires a target predecessor for successors and preserves it in the signed manifest input", async () => {
  const f = fixture();
  Object.assign(f.source, { releaseNo: 2 });
  await expect(
    compileRuntimePublication(f.source, f.dependencies, canonical, "test-key"),
  ).rejects.toThrow("PREDECESSOR_REQUIRED");
  expect(f.lower).not.toHaveBeenCalled();
  const pin = {
    plane: "neon",
    environment: "local",
    instance: "dev",
    publicationKey: f.source.publicationKey,
    appliedReleaseId: id(90),
    sourceReleaseId: id(91),
    sourceReleaseNo: 1,
    artifactHash: "d".repeat(64),
    headVersion: 4,
  };
  Object.assign(f.source, { expectedPredecessor: pin });
  const document = await compileRuntimePublication(
    f.source,
    f.dependencies,
    canonical,
    "test-key",
  );
  expect(
    JSON.parse(String(document.manifest.evidence!.expectedPredecessor)),
  ).toEqual(pin);
  expect(f.qualify).toHaveBeenCalledWith(
    expect.objectContaining({ expectedPredecessor: pin }),
  );
  const stripped = structuredClone(document);
  Reflect.deleteProperty(stripped.manifest.evidence!, "expectedPredecessor");
  await expect(
    qualifyRuntimePublication(stripped, f.dependencies, canonical, "sign"),
  ).rejects.toThrow("PREDECESSOR_REQUIRED");
  Object.assign(document.manifest.evidence!, {
    expectedPredecessor: JSON.stringify({ ...pin, plane: "mesh" }),
  });
  await expect(
    qualifyRuntimePublication(document, f.dependencies, canonical, "dispatch"),
  ).rejects.toThrow("PREDECESSOR_MISMATCH");
});
it("preserves a signed explicit absent-head expectation through compilation and dispatch", async () => {
  const f = fixture();
  const pin = {
    plane: "neon",
    environment: "local",
    instance: "dev",
    publicationKey: f.source.publicationKey,
    sourceReleaseId: id(91),
    sourceReleaseNo: 1,
    headState: "absent",
  };
  Object.assign(f.source, { releaseNo: 2, expectedPredecessor: pin });
  const document = await compileRuntimePublication(
    f.source,
    f.dependencies,
    canonical,
    "test-key",
  );
  expect(
    JSON.parse(String(document.manifest.evidence!.expectedPredecessor)),
  ).toEqual(pin);
  await qualifyRuntimePublication(
    document,
    f.dependencies,
    canonical,
    "dispatch",
  );
  Object.assign(document.manifest.evidence!, {
    expectedPredecessor: JSON.stringify({ ...pin, sourceReleaseNo: 2 }),
  });
  await expect(
    qualifyRuntimePublication(document, f.dependencies, canonical, "dispatch"),
  ).rejects.toThrow("PREDECESSOR_MISMATCH");
});
it.each(["missing", "source"])(
  "rejects %s operation projection before runtime qualification",
  async (failure) => {
    const f = fixture(),
      input = await f.lower();
    const descriptor = Object.values(input.runtimeContracts)[0]!;
    if (failure === "missing") descriptor.operation_scope_bindings = [];
    else descriptor.source.entity_id = id(99);
    f.lower.mockResolvedValue(input);
    await expect(
      compileRuntimePublication(
        f.source,
        f.dependencies,
        canonical,
        "test-key",
      ),
    ).rejects.toThrow(
      failure === "missing" ? "BINDING_REQUIRED" : "OPERATION_SOURCE_MISMATCH",
    );
    expect(f.qualify).not.toHaveBeenCalled();
  },
);
it.each(["release", "plane", "review"])(
  "rejects changed %s before compilation is accepted",
  async (change) => {
    const f = fixture(),
      input = await f.lower();
    if (change === "release") input.release.content.releaseId = id(99);
    if (change === "plane") input.release.content.targetPlanes = ["mesh"];
    if (change === "review")
      input.release.content.contractStatus = "unsigned_review_only";
    f.lower.mockResolvedValue(input);
    await expect(
      compileRuntimePublication(
        f.source,
        f.dependencies,
        canonical,
        "test-key",
      ),
    ).rejects.toThrow();
    expect(f.qualify).not.toHaveBeenCalled();
  },
);
it("rejects revoked evidence and changed receipts independently at sign and dispatch", async () => {
  const f = fixture(),
    document = await compileRuntimePublication(
      f.source,
      f.dependencies,
      canonical,
      "test-key",
    );
  f.qualify.mockRejectedValueOnce(Error("revoked"));
  await expect(
    qualifyRuntimePublication(document, f.dependencies, canonical, "sign"),
  ).rejects.toThrow("revoked");
  f.qualify.mockResolvedValueOnce({ receiptSha256: "d".repeat(64) });
  await expect(
    qualifyRuntimePublication(document, f.dependencies, canonical, "dispatch"),
  ).rejects.toThrow("QUALIFICATION_CHANGED");
});
it("rejects lost catalog permissions and member tampering even with a fresh payload hash", async () => {
  const f = fixture(),
    document = await compileRuntimePublication(
      f.source,
      f.dependencies,
      canonical,
      "test-key",
    );
  f.registry.permissions.clear();
  await expect(
    qualifyRuntimePublication(document, f.dependencies, canonical, "sign"),
  ).rejects.toThrow("permissionCode");
  const changed = structuredClone(document);
  if (changed.envelope.artifactKind !== "compiled_entity_runtime")
    throw Error("fixture");
  Object.assign(changed.envelope.payload.artifacts[0]!.content, {
    description: "tampered",
  });
  Object.assign(changed.manifest, {
    payloadSha256: canonical.sha256(
      canonical.canonicalBytes(changed.envelope.payload),
    ),
  });
  await expect(
    qualifyRuntimePublication(changed, f.dependencies, canonical, "sign"),
  ).rejects.toThrow();
});
it.each([
  { targetInstance: undefined, successor: false },
  { targetInstance: "dev", successor: false },
  { targetInstance: "dev", successor: true },
])(
  "worker signs and dispatches $targetInstance with resolved successor $successor",
  async ({ targetInstance, successor }) => {
    const f = fixture();
    if (successor) {
      Object.assign(f.source, { releaseNo: 2 });
      f.dependencies.predecessor = vi.fn(async () => ({
        plane: "neon" as const,
        environment: "local" as const,
        instance: "dev" as const,
        publicationKey: f.source.publicationKey,
        appliedReleaseId: id(90),
        sourceReleaseId: id(91),
        sourceReleaseNo: 1,
        artifactHash: "d".repeat(64),
        headVersion: 4,
      }));
    }
    let saved:
      | { id: string; unsigned_document: unknown; unsigned_hash: string }
      | undefined;
    const query = vi.fn(async (text: string, values: unknown[] = []) => {
      if (text.includes("JOIN metadata."))
        throw Error("unscoped metadata access");
      if (text.startsWith("SELECT id FROM publication.release"))
        return { rows: [{ id: id(1) }] };
      if (text.includes("to_regprocedure"))
        return { rows: [{ available: true }] };
      if (text.includes("fn_compiled_entity_compilation_source"))
        return {
          rows: [
            {
              publication_release_id: id(1),
              source_entity_id: f.source.sourceEntityId,
              source_release_hash: f.source.sourceReleaseHash,
              release_key: f.source.publicationKey,
              release_no: f.source.releaseNo,
              successor_policy: null,
              source_tenant_id: null,
              revision_id: id(2),
              published_by: id(3),
              entity_code: f.source.entityCode,
              contract_json: {},
              compiled_json: f.source.native,
              plane_key: "neon",
              created_at: f.source.generatedAt,
              target_planes: ["neon"],
            },
          ],
        };
      if (text.startsWith("INSERT INTO publication.artifact_compilation")) {
        saved = {
          id: String(values[0]),
          unsigned_document: JSON.parse(String(values[3])),
          unsigned_hash: String(values[4]),
        };
        return { rows: [] };
      }
      if (text.startsWith("SELECT id,unsigned_hash")) return { rows: [saved] };
      if (text.includes("AS complete"))
        return {
          rows: [{ actor_id: id(3), status: "approved", complete: false }],
        };
      if (text.startsWith("SELECT c.*"))
        return {
          rows: [
            {
              ...saved,
              publication_release_id: id(1),
              release_key: f.source.publicationKey,
              release_no: f.source.releaseNo,
              created_by: id(3),
              tenant_id: id(4),
              release_metadata: targetInstance
                ? {
                    humanExecutionPolicy: {
                      environment: "local",
                      instance: "dev",
                    },
                  }
                : {},
              plane_code: "neon",
              artifact_kind: "compiled_entity_runtime",
            },
          ],
        };
      if (text.includes("a.artifact_kind='compiled_entity_runtime'"))
        return {
          rows: [
            { ...saved, publication_release_id: id(1), plane_code: "neon" },
          ],
        };
      return { rows: [] };
    });
    const db = new Kysely<Record<string, never>>({
      dialect: new PostgresDialect({
        pool: {
          connect: async () => ({ query, release() {} }),
          end: async () => {},
        } as never,
      }),
    });
    const keys = generateKeyPairSync("ed25519");
    const putImmutable = vi.fn(async (_input: { bytes: Uint8Array }) => {});
    const authority = {
      createArtifact: vi.fn(async () => ({ id: id(8), status: "compiled" })),
      transitionArtifact: vi.fn(async () => {}),
      createDeployment: vi.fn(async () => ({ deploymentId: id(9) })),
      getDeployment: vi.fn(async () => ({
        deploymentStatus: "pending",
        targetPlane: "neon",
      })),
      transitionDeployment: vi.fn(async () => {}),
    };
    const signer = {
      sign: vi.fn(async (input: { bytes: Uint8Array }) => ({
        signature: sign(null, input.bytes, keys.privateKey).toString("base64"),
      })),
    };
    const options = {
      database: db,
      authority,
      store: { putImmutable },
      signer,
      canonicalizer: canonical,
      bucket: "test-artifacts",
      signingKeyId: "test-key",
      targetEnvironment: "local",
      targetInstance,
      targetPlanes: ["neon"],
      compiledRuntimePublication: f.dependencies,
    } as unknown as KyselyPublicationAuthorityWorkOptions;
    try {
      const worker = new KyselyPublicationAuthorityWork(options);
      const compiled = await worker.compile(id(1));
      if (successor) {
        expect(f.dependencies.predecessor).toHaveBeenCalledWith(id(1), "neon");
        expect(
          JSON.parse(
            String(
              (
                saved!.unsigned_document as {
                  manifest: { evidence: { expectedPredecessor: string } };
                }
              ).manifest.evidence.expectedPredecessor,
            ),
          ),
        ).toMatchObject({ sourceReleaseId: id(91), headVersion: 4 });
      }
      const signed = await worker.sign(compiled.compilationIds[0]!);
      expect(authority.createDeployment).toHaveBeenCalledWith(
        expect.objectContaining({
          targetInstance: targetInstance ?? "*",
          targetEnvironment: "local",
        }),
      );
      if (targetInstance) {
        for (const incorrect of [undefined, "*", "qa"]) {
          await expect(
            new KyselyPublicationAuthorityWork({
              ...options,
              targetInstance: incorrect,
            }).sign(compiled.compilationIds[0]!),
          ).rejects.toThrow("PUBLICATION_DEPLOYMENT_TARGET_MISMATCH");
        }
        await expect(
          new KyselyPublicationAuthorityWork({
            ...options,
            targetEnvironment: "production",
          }).sign(compiled.compilationIds[0]!),
        ).rejects.toThrow("PUBLICATION_DEPLOYMENT_TARGET_MISMATCH");
        expect(authority.createDeployment).toHaveBeenCalledOnce();
        expect(putImmutable).toHaveBeenCalledOnce();
      }
      const stored = JSON.parse(
        Buffer.from(putImmutable.mock.calls[0]![0].bytes).toString(),
      );
      const { signature, ...unsigned } = stored;
      expect(
        verify(
          null,
          canonical.canonicalBytes(unsigned),
          keys.publicKey,
          Buffer.from(signature, "base64"),
        ),
      ).toBe(true);
      await expect(worker.dispatch(signed.deploymentId)).resolves.toEqual({
        deploymentId: id(9),
        targetPlane: "neon",
      });
      f.qualify.mockRejectedValueOnce(Error("approval revoked"));
      await expect(worker.dispatch(signed.deploymentId)).rejects.toThrow(
        "approval revoked",
      );
      expect(authority.transitionDeployment).toHaveBeenCalledOnce();
      const missing = new KyselyPublicationAuthorityWork({
        ...options,
        compiledRuntimePublication: undefined,
      });
      await expect(missing.sign(compiled.compilationIds[0]!)).rejects.toThrow(
        "ADAPTER_REQUIRED",
      );
      expect(signer.sign).toHaveBeenCalledOnce();
    } finally {
      await db.destroy();
    }
  },
);
it("keeps compilation dependencies explicit and excludes product-specific implementations", () => {
  const content = readFileSync(
    new URL("../compilation/compiled-runtime.ts", import.meta.url),
    "utf8",
  );
  const ast = ts.createSourceFile(
    "compiled-runtime.ts",
    content,
    ts.ScriptTarget.Latest,
    true,
  );
  const allowed = new Set([
    "@athyper/server-contract-publication",
    "@athyper/server-platform-metadata",
    "../compiled-entity-artifact-compiler.js",
    "../entity-ai-manifest-compiler.js",
    "../shared/authorization/operation-projection.js",
  ]);
  function visit(node: ts.Node) {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      expect(allowed.has(node.moduleSpecifier.text)).toBe(true);
    if (ts.isCallExpression(node))
      expect(
        node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          node.expression.getText(ast) === "require",
      ).toBe(false);
    node.forEachChild(visit);
  }
  visit(ast);
  expect(content).not.toMatch(/business_partner|country|currency|process\.env/);
});

it("binds coordinated activation to the same manifest digest at compile, sign and dispatch", async () => {
  const f = fixture();
  Object.assign(f.source, { coordinationHash: "e".repeat(64) });
  const document = await compileRuntimePublication(
    f.source,
    f.dependencies,
    canonical,
    "test-key",
  );
  expect(document.manifest.evidence?.coordinationHash).toBe("e".repeat(64));
  for (const phase of ["sign", "dispatch"] as const) {
    await qualifyRuntimePublication(document, f.dependencies, canonical, phase);
    expect(f.qualify).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase, coordinationHash: "e".repeat(64) }),
    );
  }
  Object.assign(document.manifest.evidence!, { coordinationHash: "invalid" });
  await expect(
    qualifyRuntimePublication(document, f.dependencies, canonical, "sign"),
  ).rejects.toThrow();
});

it("compiles native live-read pins and binds them to the signed source at compile/sign/dispatch", async () => {
  const f = fixture(),
    input = await f.lower();
  const source = {
    entityId: f.source.sourceEntityId,
    releaseId: f.source.releaseId,
    contractHash: f.source.sourceContractHash,
    tenantId: f.source.tenantId,
  };
  const resource = {
    owner: "platform",
    namespace: "entity",
    key: "security",
    version: 1,
    hash: "d".repeat(64),
  };
  const old = Object.values(input.runtimeContracts)[0]!;
  Object.assign(old, {
    schema: "athyper.entity-runtime-descriptor/1.1",
    liveReadContract: {
      schema: "entity.live-read/1",
      source,
      security: resource,
      storageAuthority: { ...resource, key: "storage" },
    },
  });
  f.lower.mockResolvedValue(input);
  const document = await compileRuntimePublication(
    f.source,
    f.dependencies,
    canonical,
    "test-key",
  );
  await qualifyRuntimePublication(document, f.dependencies, canonical, "sign");
  await qualifyRuntimePublication(
    document,
    f.dependencies,
    canonical,
    "dispatch",
  );
  expect(f.qualify).toHaveBeenCalledTimes(3);
  for (const evidence of [
    { ...document.manifest.evidence, sourceContractHash: "e".repeat(64) },
    { ...document.manifest.evidence, sourceEntityId: id(99) },
    { ...document.manifest.evidence, sourceContractHash: undefined },
  ]) {
    const changed = {
      ...document,
      manifest: { ...document.manifest, evidence },
    };
    await expect(
      qualifyRuntimePublication(
        changed as typeof document,
        f.dependencies,
        canonical,
        "sign",
      ),
    ).rejects.toThrow("SOURCE_PIN");
  }
  expect(f.qualify).toHaveBeenCalledTimes(3); // Mismatched source never reaches the authority.
});
