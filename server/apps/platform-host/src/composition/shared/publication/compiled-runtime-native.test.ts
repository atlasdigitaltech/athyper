import {
  canonicalBytes,
  sha256 as hashBytes,
} from "@athyper/server-adapter-publication-signing";
import {
  compileRuntimePublication,
  qualifyRuntimePublication,
} from "../../../../../../packages/services/publication/src/compilation/compiled-runtime.js";
import type { AuthoringPlane } from "@athyper/server-contract-meta-entity-authoring";
import * as nativeRecovery from "./native-compilation-recovery-authority.js";
import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect } from "kysely";
import { afterEach, expect, it, vi } from "vitest";
import { nativeReleaseFixture } from "../../../../../../packages/planes/studio/meta-entity-authoring/src/native-release-compilation.fixtures.js";
import {
  sha256,
  compileNativePublication,
  nativePublicationTargets,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import { publicationCompilerIdentity } from "./compiler-build.js";
import { createCompiledRuntimePublication } from "./compiled-runtime.js";
import * as qualification from "./target-qualification.js";
afterEach(() => vi.restoreAllMocks());
it.each([
  ...(["studio", "neon", "mesh"] as const).flatMap((plane) =>
    [false, true].flatMap((recovery) =>
      [false, true].map((successor) => ({ plane, recovery, successor })),
    ),
  ),
])(
  "recompiles native reviewed sources at the worker boundary (plane=$plane, recovery=$recovery, successor=$successor)",
  async ({ plane, recovery, successor }) => {
    const f = nativeReleaseFixture();
    f.graph.entity.ownershipModel = "system";
    f.graph.entity.entityClass = "reference";
    const planes: AuthoringPlane[] = ["studio", "neon", "mesh"];
    const members = f.graph.referenceMembers!.members;
    let id = 900;
    const next = () =>
      `00000000-0000-4000-8000-${String(id++).padStart(12, "0")}`;
    for (const kind of [
      "target",
      "authorizationProfile",
      "fieldAccess",
    ] as const) {
      const rows = members[kind];
      Reflect.set(
        members,
        kind,
        planes.flatMap((targetPlane, position) =>
          rows.map((row) => ({
            ...row,
            id: next(),
            targetPlane,
            ...(kind === "target" ? { position: position + 1 } : {}),
          })),
        ),
      );
    }
    f.graph.operationScopeBindings = planes.flatMap((targetPlane) =>
      f.graph.operationScopeBindings!.map((row) => ({ ...row, targetPlane })),
    );
    const contexts = planes.map((plane) => ({
      ...structuredClone(f.c),
      graphHash: sha256(f.graph),
      core: {
        ...structuredClone(f.c.core),
        catalogues: f.c.core.catalogues.map((row) => ({
          ...row,
          plane,
          hash:
            plane === "studio" ? row.hash : sha256({ plane, catalogue: row }),
        })),
      },
      authorization: {
        ...structuredClone(f.c.authorization),
        plane,
        permissions: f.c.authorization.permissions.map((row) => ({
          ...row,
          plane,
        })),
        scopes: f.c.authorization.scopes.map((row) => ({ ...row, plane })),
      },
    }));
    const resolved = {
      graph: f.graph,
      compiler: contexts[0]!,
      controls: f.controls,
      targetCompilers: contexts,
    };
    const artifact = compileNativePublication(resolved),
      releaseId = randomUUID(),
      tenantId = randomUUID(),
      publisherId = randomUUID();
    const changeSetId = f.graph.ownedLabels!.changeSetId;
    const configuration = {
      environment: "local",
      instance: "dev",
      domainSuffix: "dev.athyper.test",
      tenantId,
      realmKey: "test",
      author: {
        principalId: randomUUID(),
        code: "author",
        authEpoch: 0,
        credentialSha256: "a".repeat(64),
      },
      publisher: {
        principalId: publisherId,
        code: "publisher",
        authEpoch: 0,
        credentialSha256: "b".repeat(64),
      },
    };
    const targets = nativePublicationTargets(f.graph, artifact);
    const targetArtifact = targets.find(
      (target) => target.targetPlane === plane,
    )!.artifact;
    expect(targetArtifact.contractHash).not.toBe(artifact.contractHash);
    const previousId = randomUUID();
    const member = {
      changeSetId,
      entityId: f.graph.authoringSource.entityId,
      revision: 3,
      contractHash: artifact.contractHash,
      descriptorHash: artifact.descriptorHash,
      sourceReleaseId: successor ? previousId : null,
      authorId: randomUUID(),
      reviewerId: randomUUID(),
      targets: targets.map((target) => ({
        plane: target.targetPlane,
        contractHash: target.artifact.contractHash,
        descriptorHash: target.artifact.descriptorHash,
      })),
    };
    const policy = {
      schema: "athyper.dev-human-reviewed-publication/1",
      environment: "local",
      instance: "dev",
      authorityTenantId: tenantId,
      policyId: "test.native",
      revision: 1,
      authorPrincipalId: configuration.author.principalId,
      publisherPrincipalId: publisherId,
      compiler: publicationCompilerIdentity(),
      predecessors: successor
        ? [
            {
              schema: "athyper.dev-entity-successor-policy/1",
              environment: "local",
              instance: "dev",
              authorityTenantId: tenantId,
              policyId: "test.native.successor",
              revision: 1,
              entityId: member.entityId,
              changeSetId,
              contractHash: member.contractHash,
              descriptorHash: member.descriptorHash,
              authorPrincipalId: configuration.author.principalId,
              publisherPrincipalId: publisherId,
              compiler: publicationCompilerIdentity(),
              predecessor: {
                authoringReleaseId: previousId,
                authoringReleaseNo: 1,
                authoringReleaseHash: "a".repeat(64),
                publicationReleaseId: previousId,
                publicationReleaseNo: 1,
                publicationReleaseHash: "b".repeat(64),
                revisionId: randomUUID(),
                contractHash: "c".repeat(64),
              },
              targets: planes.map((plane) => ({
                plane,
                environment: "local",
                instance: "dev",
                publicationKey:
                  "metadata.reference." + f.graph.entity.entityCode,
                sourceReleaseId: previousId,
                sourceReleaseNo: 1,
                headState: "absent",
              })),
            },
          ]
        : [],
      plan: {
        schema: "athyper.human-reviewed-publication-plan/1",
        publisherId,
        members: [member],
      },
    };
    if (recovery) {
      policy.compiler = { ...policy.compiler, buildHash: "0".repeat(64) };
      if (successor) policy.predecessors[0]!.compiler = policy.compiler;
      vi.spyOn(
        nativeRecovery,
        "findNativeCompilationRecovery",
      ).mockResolvedValue({
        original: policy,
        policy: {
          compiler: publicationCompilerIdentity(),
          originalPolicy: {},
          releases: [{ releaseId }],
        },
        pin: { id: randomUUID(), version: 1, hash: "e".repeat(64) },
      } as never);
    }
    const row = {
      publication_release_id: releaseId,
      release_key: "metadata.reference." + f.graph.entity.entityCode,
      release_no: successor ? 2 : 1,
      successor_policy: policy.predecessors[0],
      source_tenant_id: null,
      revision_id: randomUUID(),
      entity_code: f.graph.entity.entityCode,
      source_entity_id: f.graph.authoringSource.entityId,
      source_release_hash: artifact.descriptorHash,
      contract_json: f.graph,
      compiled_json: targetArtifact.descriptor,
      plane_key: plane,
      created_at: "2026-10-09T00:00:00Z",
      target_planes: planes,
    };
    const query = vi.fn(async (text: string) => ({
      rows: text.includes("information_schema.tables")
        ? [{ name: "shared.synthetic_reference" }]
        : text.includes("executionPolicyId")
          ? [{ id: randomUUID() }]
          : text.includes("FROM master.principal")
            ? [{ id: publisherId }]
            : text.includes("fn_compiled_entity_compilation_source")
              ? targets.map((target) => ({
                  ...row,
                  plane_key: target.targetPlane,
                  compiled_json: target.artifact.descriptor,
                }))
              : text.includes("metadata ?")
                ? [{ human: true }]
                : text.includes("fn_human_execution_context")
                  ? [
                      {
                        execution: {
                          policy,
                          coordinationHash: sha256(policy.plan),
                          sources: [{ changeSetId, graph: f.graph }],
                        },
                      },
                    ]
                  : [],
    }));
    const db = new Kysely<Record<string, never>>({
      dialect: new PostgresDialect({
        pool: {
          connect: async () => ({ query, release() {} }),
          end: async () => {},
        } as never,
      }),
    });
    const nativeSource = vi.fn(async () => resolved);
    const qualify = vi
      .spyOn(qualification, "qualifyNativeReferencePublicationTarget")
      .mockResolvedValue();
    const adapter = createCompiledRuntimePublication({
      authority: db,
      configuration,
      nativeSource,
      targets: () => ({
        databases: { studio: db, neon: db, mesh: db },
        runtime: { qualify() {} },
        qualifyCapabilities: async () => {},
      }),
    });
    const source = {
      releaseId,
      releaseNo: successor ? 2 : 1,
      publicationKey: row.release_key,
      plane,
      tenantId: null,
      entityCode: row.entity_code,
      revisionId: row.revision_id,
      sourceEntityId: row.source_entity_id,
      sourceReleaseHash: row.source_release_hash,
      sourceContractHash: artifact.contractHash,
      sourceDescriptorHash: targetArtifact.descriptorHash,
      generatedAt: "2026-10-09T00:00:00.000Z",
      native: targetArtifact.descriptor,
      ...(successor
        ? {
            expectedPredecessor: policy.predecessors[0]!.targets.find(
              (target) => target.plane === plane,
            ),
          }
        : {}),
      contract: f.graph as unknown as Record<string, unknown>,
      coordinationHash: sha256(policy.plan),
    };
    try {
      const registry = await adapter.registry(plane);
      expect(registry.renderers.has("text")).toBe(true);
      expect(registry.renderers.has("unregistered-renderer")).toBe(false);
      const result = await adapter.lower(source);
      expect(result.artifacts.length).toBeGreaterThan(0);
      expect(nativeSource).toHaveBeenCalledWith(
        expect.objectContaining({ isTransaction: true }),
        changeSetId,
      );
      expect(qualify).toHaveBeenCalledOnce();
      await expect(
        adapter.lower({
          ...source,
          sourceContractHash: targetArtifact.contractHash,
        }),
      ).rejects.toThrow("COMPILED_PUBLICATION_SOURCE_CHANGED");
      const otherTarget = targets.find(
        (target) => target.targetPlane !== plane,
      )!;
      await expect(
        adapter.lower({
          ...source,
          sourceDescriptorHash: otherTarget.artifact.descriptorHash,
        }),
      ).rejects.toThrow("COMPILED_PUBLICATION_SOURCE_CHANGED");
      if (recovery) {
        vi.mocked(
          nativeRecovery.findNativeCompilationRecovery,
        ).mockResolvedValueOnce(undefined);
        await expect(adapter.lower(source)).rejects.toThrow(
          "NATIVE_COMPILATION_RECOVERY_EXACT_AUTHORITY_REQUIRED",
        );
      }
      nativeSource.mockRejectedValueOnce(Error("authority revoked"));
      await expect(adapter.lower(source)).rejects.toThrow("authority revoked");
      expect(qualify).toHaveBeenCalledOnce();
      const canonical = { canonicalBytes, sha256: hashBytes };
      const document = await compileRuntimePublication(
        source,
        adapter,
        canonical,
        "test-signing-key",
      );
      expect(document.envelope.targetPlane).toBe(plane);
      expect(document.manifest.evidence?.sourceContractHash).toBe(
        artifact.contractHash,
      );
      expect(document.manifest.evidence?.sourceDescriptorHash).toBe(
        targetArtifact.descriptorHash,
      );
      await qualifyRuntimePublication(document, adapter, canonical, "sign");
      await qualifyRuntimePublication(document, adapter, canonical, "dispatch");
    } finally {
      await db.destroy();
    }
  },
);
